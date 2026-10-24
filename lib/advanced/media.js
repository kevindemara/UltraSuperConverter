'use strict';
const path = require('node:path');
const fs = require('node:fs/promises');
const videoEncoding = ['-c:v', 'libx264', '-preset', 'fast', '-crf', '22', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-movflags', '+faststart'];

function durationOf(info) {
  const duration = Number(info.format?.duration);
  if (!(duration > 0) || !Number.isFinite(duration)) throw new Error('Could not determine input duration.');
  return duration;
}
async function normalizedClip(ctx, file, index, width, height, requestedDuration) {
  const info = await ctx.probe(file);
  if (!info.streams.some(s => s.codec_type === 'video' && !s.disposition?.attached_pic)) throw new Error(`No video in ${file.originalname}.`);
  const duration = requestedDuration || durationOf(info);
  const hasAudio = info.streams.some(s => s.codec_type === 'audio');
  const output = path.join(ctx.workDir, `normalized-${index}.mp4`);
  const args = ['-i', file.path];
  if (!hasAudio) args.push('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo');
  const filters = `[0:v:0]scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,settb=AVTB,setpts=PTS-STARTPTS[v];[${hasAudio ? '0' : '1'}:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,apad,asetpts=PTS-STARTPTS[a]`;
  await ctx.ff([...args, '-filter_complex_threads', '1', '-filter_complex', filters, '-map', '[v]', '-map', '[a]', '-t', String(duration), ...videoEncoding, output]);
  const normalized = await ctx.probe({ path: output });
  return { path: output, duration: durationOf(normalized) };
}
async function assemble(ctx, clips, transition, name) {
  if (transition && clips.some(c => c.duration <= transition * 2)) throw new Error('Crossfade must be shorter than half of every clip. Reduce the crossfade duration.');
  const args = clips.flatMap(c => ['-i', c.path]), filters = [];
  let v = '0:v:0', a = '0:a:0', total = clips[0].duration;
  if (transition > 0) {
    clips.slice(1).forEach((clip, j) => {
      const i = j + 1;
      filters.push(`[${v}][${i}:v:0]xfade=transition=fade:duration=${transition}:offset=${(total - transition).toFixed(6)}[v${i}]`);
      filters.push(`[${a}][${i}:a:0]acrossfade=d=${transition}:c1=tri:c2=tri[a${i}]`);
      v = `v${i}`; a = `a${i}`; total += clip.duration - transition;
    });
  } else {
    filters.push(`${clips.map((_, i) => `[${i}:v:0][${i}:a:0]`).join('')}concat=n=${clips.length}:v=1:a=1[vout][aout]`);
    v = 'vout'; a = 'aout';
  }
  await ctx.generated(name, output => ctx.ff([...args, '-filter_complex_threads', '1', '-filter_complex', filters.join(';'), '-map', `[${v}]`, '-map', `[${a}]`, ...videoEncoding, output]));
}
function trackNumbers(source, count, fallback, label) {
  const values = source.trim() ? source.split(',').map(v => Number(v.trim())) : [];
  if (values.length > count || values.some(v => !Number.isFinite(v))) throw new Error(`Provide at most one ${label} value per input track.`);
  return Array.from({ length: count }, (_, i) => values[i] ?? fallback);
}
function loudnessJson(stderr) {
  const matches = [...stderr.matchAll(/\{\s*"input_i"[\s\S]*?\}/g)];
  if (!matches.length) throw new Error('Loudness measurement failed.');
  return JSON.parse(matches[matches.length - 1][0]);
}
async function mediaTool(ctx) {
  const { toolId, files, options: o } = ctx;
  if (toolId === 'video-join') {
    if (files.length < 2 || files.length > 10) throw new Error('Choose 2–10 clips.');
    const details = await Promise.all(files.map(f => ctx.probe(f))), duration = details.reduce((sum, info) => sum + durationOf(info), 0);
    if (duration > 600) throw new Error('Combined clip duration must not exceed 10 minutes.');
    const [width, height] = o.size.split('x').map(Number), clips = [];
    for (let i = 0; i < files.length; i++) clips.push(await normalizedClip(ctx, files[i], i, width, height));
    await assemble(ctx, clips, o.transition, 'assembled-video.mp4');
  } else if (toolId === 'video-grid') {
    if (files.length < 2 || files.length > 4) throw new Error('Choose 2–4 videos.');
    const details = await Promise.all(files.map(f => ctx.probe(f))), duration = Math.min(...details.map(durationOf));
    if (duration > 600) throw new Error('Comparison videos are limited to 10 minutes.');
    const columns = Math.min(o.columns, files.length), height = Math.floor(o.cellWidth * 9 / 16 / 2) * 2;
    const clips = [];
    for (let i = 0; i < files.length; i++) clips.push(await normalizedClip(ctx, files[i], i, o.cellWidth, height, duration));
    const args = clips.flatMap(c => ['-i', c.path]);
    const layout = clips.map((_, i) => `${i % columns * o.cellWidth}_${Math.floor(i / columns) * height}`).join('|');
    const filter = `${clips.map((_, i) => `[${i}:v:0]`).join('')}xstack=inputs=${clips.length}:layout=${layout}:fill=black:shortest=1[v]`;
    await ctx.generated('comparison-grid.mp4', output => ctx.ff([...args, '-filter_complex_threads', '1', '-filter_complex', filter, '-map', '[v]', ...(o.audio === 'first' ? ['-map', '0:a:0'] : ['-an']), '-t', String(duration), ...videoEncoding, output]));
  } else if (toolId === 'slideshow') {
    if (files.length < 2) throw new Error('Choose at least two photos.');
    if (o.transition * 2 >= o.seconds) throw new Error('Crossfade must be shorter than half the duration of each photo.');
    const clips = [];
    for (let i = 0; i < files.length; i++) {
      const photo = path.join(ctx.workDir, `slide-${i}.png`), clip = path.join(ctx.workDir, `slide-${i}.mp4`);
      await (await ctx.image(files[i])).resize(1280, 720, { fit: 'contain', background: '#142238' }).png().toFile(photo);
      await ctx.ff(['-loop', '1', '-framerate', '30', '-i', photo, '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', String(o.seconds), ...videoEncoding, clip]);
      clips.push({ path: clip, duration: o.seconds });
    }
    await assemble(ctx, clips, o.transition, 'photo-slideshow.mp4');
  } else if (toolId === 'audio-mix') {
    if (files.length < 2 || files.length > 8) throw new Error('Choose 2–8 audio tracks.');
    const gains = trackNumbers(o.gains, files.length, 0, 'gain'), offsets = trackNumbers(o.offsets, files.length, 0, 'offset');
    if (gains.some(v => v < -60 || v > 12) || offsets.some(v => v < 0 || v > 600)) throw new Error('Gains must be -60 to +12 dB; offsets must be 0–600 seconds.');
    const details = await Promise.all(files.map(f => ctx.probe(f)));
    if (details.some(info => !info.streams.some(s => s.codec_type === 'audio'))) throw new Error('Each input needs an audio track.');
    const duration = Math.max(...details.map((info, i) => durationOf(info) + offsets[i]));
    if (duration > 1800) throw new Error('The mixed timeline is limited to 30 minutes.');
    const filters = files.map((_, i) => `[${i}:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS,volume=${gains[i]}dB,adelay=${Math.round(offsets[i] * 1000)}:all=1,apad,atrim=duration=${duration}[a${i}]`);
    if (o.duck === 'yes') {
      filters.push('[a0]asplit=2[voice][side]');
      filters.push(`${files.slice(1).map((_, i) => `[a${i + 1}]`).join('')}amix=inputs=${files.length - 1}:normalize=0[bed]`);
      filters.push('[bed][side]sidechaincompress=threshold=0.025:ratio=8:attack=15:release=250[ducked]');
      filters.push('[voice][ducked]amix=inputs=2:normalize=0,alimiter=limit=0.95[out]');
    } else filters.push(`${files.map((_, i) => `[a${i}]`).join('')}amix=inputs=${files.length}:normalize=0,alimiter=limit=0.95[out]`);
    await ctx.generated('mixed-tracks.wav', output => ctx.ff([...files.flatMap(f => ['-i', f.path]), '-filter_complex_threads', '1', '-filter_complex', filters.join(';'), '-map', '[out]', '-t', String(duration), '-c:a', 'pcm_s16le', '-ar', '48000', output]));
    await ctx.write('mix-settings.json', JSON.stringify(files.map((f, i) => ({ source: f.originalname, gainDB: gains[i], startSeconds: offsets[i] })), null, 2), true);
  } else if (toolId === 'podcast-master') {
    const info = await ctx.probe(files[0]);
    if (!info.streams.some(s => s.codec_type === 'audio')) throw new Error('Choose a file with an audio track.');
    if (durationOf(info) > 1800) throw new Error('Mastering supports recordings up to 30 minutes.');
    const chain = [];
    if (o.denoise === 'yes') chain.push('afftdn=nf=-25');
    if (o.speechEQ === 'yes') chain.push('highpass=f=80', 'lowpass=f=15000', 'acompressor=threshold=0.125:ratio=3:attack=10:release=150:makeup=1.5');
    const normalization = `loudnorm=I=${o.lufs}:TP=-1.5:LRA=11`;
    const first = await ctx.ff(['-i', files[0].path, '-map', '0:a:0', '-vn', '-af', [...chain, `${normalization}:print_format=json`].join(','), '-f', 'null', '-'], true);
    const measured = loudnessJson(first.stderr);
    for (const key of ['input_i', 'input_tp', 'input_lra', 'input_thresh', 'target_offset']) if (!Number.isFinite(Number(measured[key]))) throw new Error('The recording is silent or cannot be measured for loudness.');
    const params = `:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true:print_format=json`;
    const output = ctx.destination('mastered-podcast.wav');
    await ctx.ff(['-i', files[0].path, '-map', '0:a:0', '-vn', '-af', [...chain, normalization + params].join(','), '-c:a', 'pcm_s16le', '-ar', '48000', output.path], true);
    ctx.results.push(output);
    const final = await ctx.ff(['-i', output.path, '-af', `${normalization}:print_format=json`, '-f', 'null', '-'], true);
    const before = await ctx.ff(['-i', files[0].path, '-map', '0:a:0', '-af', `${normalization}:print_format=json`, '-f', 'null', '-'], true);
    await ctx.write('mastering-report.json', JSON.stringify({ targetLUFS: o.lufs, denoise: o.denoise === 'yes', speechEQ: o.speechEQ === 'yes', before: loudnessJson(before.stderr), processedMeasurement: measured, after: loudnessJson(final.stderr) }, null, 2), true);
  } else throw new Error('Unsupported media tool.');
}
module.exports = { mediaTool, loudnessJson };
