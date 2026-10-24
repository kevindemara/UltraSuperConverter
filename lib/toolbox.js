'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { execFile } = require('node:child_process');
const zlib = require('node:zlib');
const sharp = require('sharp');
const heicConvert = require('heic-convert');
const { PDFDocument, degrees, PageSizes } = require('pdf-lib');
const yaml = require('js-yaml');
const { XMLParser, XMLBuilder, XMLValidator } = require('fast-xml-parser');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const { marked } = require('marked');
const { convert: htmlToText } = require('html-to-text');
const he = require('he');
const catalog = [...require('../public/tools-catalog'), ...require('../public/advanced-catalog'), ...require('../public/utility-catalog')];
const exec = promisify(execFile);
const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);
const ffmpeg = require('ffmpeg-static');
const ffprobe = require('ffprobe-static').path;

const MAX_TEXT = 10 * 1024 * 1024;
const MAX_EXPANDED = 100 * 1024 * 1024;

function safeName(name) {
  return path.basename(String(name || 'converted.bin').replace(/\\/g, '/')).replace(/[^\p{L}\p{N}._-]/gu, '_').slice(-180) || 'converted.bin';
}

function pageIndices(value, count) {
  if (!String(value || '').trim()) return Array.from({ length: count }, (_, i) => i);
  const indices = [];
  for (const part of String(value).split(',')) {
    const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) throw new Error('Use page numbers or ranges, such as 1-3,5.');
    const first = Number(match[1]);
    const last = Number(match[2] || match[1]);
    if (first < 1 || last > count || first > last) throw new Error(`Page range must be between 1 and ${count}.`);
    for (let i = first; i <= last; i++) if (!indices.includes(i - 1)) indices.push(i - 1);
  }
  return indices;
}

function parseTimestamp(value) {
  const m = value.match(/^(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})$/);
  if (!m || Number(m[2]) > 59 || Number(m[3]) > 59) throw new Error(`Invalid subtitle timestamp: ${value}`);
  return ((Number(m[1] || 0) * 60 + Number(m[2])) * 60 + Number(m[3])) * 1000 + Number(m[4]);
}

function formatTimestamp(ms, vtt) {
  ms = Math.max(0, Math.round(ms));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor(ms / 60000) % 60;
  const s = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${vtt ? '.' : ','}${String(ms % 1000).padStart(3, '0')}`;
}

function subtitles(source, { vtt, shift = 0 }) {
  const blocks = source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim().split(/\n\s*\n/);
  const cues = [];
  const metadata = [];
  for (const block of blocks) {
    if (/^(WEBVTT|NOTE(?:\s|$)|STYLE(?:\s|$)|REGION(?:\s|$))/.test(block)) {
      if (vtt && !block.startsWith('WEBVTT')) metadata.push(block);
      continue;
    }
    const lines = block.split('\n');
    const timingIndex = lines.findIndex(line => line.includes('-->'));
    if (timingIndex < 0) throw new Error('Each subtitle cue needs a timing line containing -->.');
    const match = lines[timingIndex].match(/^\s*(\S+)\s+-->\s+(\S+)(.*)$/);
    if (!match) throw new Error('Invalid subtitle timing line.');
    const start = parseTimestamp(match[1]) + shift;
    const end = parseTimestamp(match[2]) + shift;
    if (end < start) throw new Error('Subtitle end time must not be before its start.');
    if (end < 0) continue;
    const body = lines.slice(timingIndex + 1).join('\n');
    if (!body.trim()) throw new Error('Subtitle cue text is empty.');
    const id = vtt && timingIndex > 0 ? lines[0] : String(cues.length + 1);
    cues.push(`${id}\n${formatTimestamp(start, vtt)} --> ${formatTimestamp(end, vtt)}${match[3]}\n${body}`);
  }
  if (!cues.length && shift === 0) throw new Error('No subtitle cues found.');
  return (vtt ? `WEBVTT\n\n${metadata.length ? metadata.join('\n\n') + '\n\n' : ''}` : '') + cues.join('\n\n') + '\n';
}

async function probe(file) {
  const { stdout } = await exec(ffprobe, ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', file], { timeout: 20000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
  return JSON.parse(stdout);
}

async function ff(args) {
  try {
    await exec(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-nostdin', '-y', ...args], { timeout: 180000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
  } catch (err) {
    if (err.killed) throw new Error('This conversion exceeded the 3-minute processing limit. Try a shorter clip.');
    throw new Error(`Media conversion failed: ${(err.stderr || err.message).trim().slice(-1400)}`);
  }
}

function validateOptions(tool, supplied) {
  const options = {};
  for (const field of tool.fields) {
    const value = supplied[field.key] ?? field.value;
    if (field.type === 'number') {
      const n = Number(value);
      if (value === '' || !Number.isFinite(n) || n < field.min || n > field.max || (field.step === 1 && !Number.isInteger(n))) {
        throw new Error(`${field.label} must be ${field.step === 1 ? 'a whole number' : 'a number'} between ${field.min} and ${field.max}.`);
      }
      options[field.key] = n;
    } else if (field.type === 'select') {
      if (!field.choices.some(c => c[0] === String(value))) throw new Error(`Choose a valid ${field.label.toLowerCase()}.`);
      options[field.key] = String(value);
    } else {
      const string = String(value ?? '');
      if (string.length > (field.maxLength || 2000)) throw new Error(`${field.label} exceeds its ${field.maxLength || 2000}-character limit.`);
      options[field.key] = string;
    }
  }
  return options;
}

async function runTool({ toolId, text = '', files = [], options: supplied = {}, workDir }) {
  const tool = catalog.find(t => t.id === toolId);
  if (!tool) throw new Error('Unknown converter tool.');
  const options = validateOptions(tool, supplied);
  if (require('../public/utility-catalog').some(t => t.id === toolId)) return require('./utilities').runUtility({ toolId, text, files, options, workDir });
  if (require('../public/advanced-catalog').some(t => t.id === toolId)) return require('./advanced-tools').runAdvanced({ toolId, text, files, options, workDir });
  if (tool.input !== 'text' && !files.length) throw new Error('Choose an input file.');
  if (tool.input === 'file' && tool.id !== 'checksums' && files.length !== 1) throw new Error('Choose exactly one input file.');
  if (tool.input === 'text' && files.length > 1) throw new Error('Choose one input file or paste text.');
  const results = [];
  const resultPath = name => path.join(workDir, `output-${safeName(name)}`);
  const write = async (name, data, preview = false) => {
    const outputPath = resultPath(name);
    await fs.promises.writeFile(outputPath, data);
    results.push({ path: outputPath, name: safeName(name), ...(preview ? { preview: Buffer.from(data).toString('utf8').slice(0, 100000) } : {}) });
  };
  const addResult = name => results.push({ path: resultPath(name), name });
  const input = files[0]?.path;
  const inputName = safeName(files[0]?.originalname || 'converted.txt');
  async function readText() {
    if (input) {
      if ((await fs.promises.stat(input)).size > MAX_TEXT) throw new Error('Text input is limited to 10 MB.');
      return (await fs.promises.readFile(input)).toString('utf8').replace(/^\uFEFF/, '');
    }
    if (Buffer.byteLength(text) > MAX_TEXT) throw new Error('Text input is limited to 10 MB.');
    return String(text).replace(/^\uFEFF/, '');
  }
  const json = data => JSON.stringify(data, null, 2) + '\n';
  if (toolId === 'json-csv') {
    const source = await readText();
    if (options.direction === 'JSON to CSV') {
      const rows = JSON.parse(source);
      if (!Array.isArray(rows) || !rows.length || rows.some(r => !r || Array.isArray(r) || typeof r !== 'object')) throw new Error('Provide a non-empty JSON array of objects.');
      const columns = [...new Set(rows.flatMap(Object.keys))];
      if (!columns.length) throw new Error('Records need at least one field.');
      const normalized = rows.map(row => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v !== null && typeof v === 'object' ? JSON.stringify(v) : v])));
      await write('converted.csv', stringify(normalized, { header: true, columns, escape_formulas: true }), true);
    } else await write('converted.json', json(parse(source, { columns: true, bom: true, skip_empty_lines: true })), true);
  } else if (toolId === 'json-yaml') {
    const source = await readText();
    if (options.direction === 'JSON to YAML') await write('converted.yaml', yaml.dump(JSON.parse(source), { noRefs: true }), true);
    else await write('converted.json', json(yaml.load(source, { schema: yaml.JSON_SCHEMA })), true);
  } else if (toolId === 'json-xml') {
    const source = await readText();
    if (options.direction === 'JSON to XML') {
      const data = JSON.parse(source);
      if (!data || typeof data !== 'object') throw new Error('XML conversion needs a JSON object or array.');
      const xml = new XMLBuilder({ ignoreAttributes: false, format: true }).build({ root: data });
      if (XMLValidator.validate(xml) !== true) throw new Error('JSON keys must be valid XML element names.');
      await write('converted.xml', xml, true);
    } else {
      if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('XML documents with DTD or entity declarations are not supported.');
      const valid = XMLValidator.validate(source);
      if (valid !== true) throw new Error(`Invalid XML: ${valid.err.msg}`);
      await write('converted.json', json(new XMLParser({ ignoreAttributes: false, processEntities: true }).parse(source)), true);
    }
  } else if (toolId === 'csv-tsv') {
    const toTsv = options.direction === 'CSV to TSV';
    const rows = parse(await readText(), { delimiter: toTsv ? ',' : '\t', bom: true });
    await write(toTsv ? 'converted.tsv' : 'converted.csv', stringify(rows, { delimiter: toTsv ? '\t' : ',' }), true);
  } else if (toolId === 'json-format') {
    const data = JSON.parse(await readText());
    await write('formatted.json', JSON.stringify(data, null, options.style === 'pretty' ? 2 : 0) + '\n', true);
  } else if (toolId === 'markdown-html') {
    const html = marked.parse(await readText());
    await write('document.html', `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${he.encode(options.title)}</title><style>body{max-width:760px;margin:40px auto;padding:0 20px;font:17px/1.6 system-ui}pre{overflow:auto;background:#eee;padding:16px}img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #bbb;padding:8px}</style></head><body>\n${html}</body></html>`, true);
  } else if (toolId === 'html-text') {
    await write('converted.txt', htmlToText(await readText(), { wordwrap: false }), true);
  } else if (toolId === 'base64') {
    if (options.direction === 'Encode') {
      const data = input ? await fs.promises.readFile(input) : Buffer.from(text);
      await write('encoded.base64.txt', data.toString('base64'), true);
    } else {
      const source = (await readText()).replace(/^data:[^,]*;base64,/i, '').replace(/\s/g, '');
      if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(source)) throw new Error('Provide valid, padded Base64 text.');
      await write(options.filename, Buffer.from(source, 'base64'));
    }
  } else if (toolId === 'url-codec') {
    await write('converted.txt', (options.direction === 'Encode' ? encodeURIComponent : decodeURIComponent)(await readText()), true);
  } else if (toolId === 'html-entities') {
    await write('converted.txt', (options.direction === 'Encode' ? he.encode : he.decode)(await readText()), true);
  } else if (toolId === 'text-encoding') {
    if (input && (await fs.promises.stat(input)).size > MAX_TEXT) throw new Error('Text input is limited to 10 MB.');
    const source = input ? (await fs.promises.readFile(input)).toString(options.from).replace(/^\uFEFF/, '') : text;
    if (options.to === 'latin1' && [...source].some(c => c.codePointAt(0) > 255)) throw new Error('This text contains characters that Latin-1 cannot represent. Choose UTF-8 or UTF-16 LE.');
    const bom = options.to === 'utf16le' ? Buffer.from([0xff, 0xfe]) : Buffer.alloc(0);
    await write('converted.txt', Buffer.concat([bom, Buffer.from(source, options.to)]));
  } else if (toolId === 'checksums') {
    const hashes = [];
    for (const file of files) {
      const hashers = ['sha256', 'sha512', 'md5'].map(algorithm => [algorithm, crypto.createHash(algorithm)]);
      for await (const chunk of fs.createReadStream(file.path)) for (const [, hasher] of hashers) hasher.update(chunk);
      hashes.push({ file: file.originalname, bytes: (await fs.promises.stat(file.path)).size, ...Object.fromEntries(hashers.map(([a, h]) => [a, h.digest('hex')])) });
    }
    await write('checksums.json', json(hashes), true);
  } else if (toolId === 'gzip') {
    const data = await fs.promises.readFile(input);
    if (options.direction === 'Compress') await write(`${inputName}.gz`, await gzip(data));
    else await write(inputName.replace(/\.gz$/i, '') === inputName ? 'decompressed.bin' : inputName.replace(/\.gz$/i, ''), await gunzip(data, { maxOutputLength: MAX_EXPANDED }));
  } else if (toolId.startsWith('pdf-') || toolId === 'images-pdf') {
    if (toolId === 'pdf-merge' && files.length < 2) throw new Error('Choose at least two PDF files to merge.');
    if (toolId === 'images-pdf') {
      const doc = await PDFDocument.create();
      for (const file of files) {
        let source = file.path;
        if (/\.hei[cf]$/i.test(file.originalname)) source = Buffer.from(await heicConvert({ buffer: await fs.promises.readFile(file.path), format: 'PNG' }));
        const bytes = await sharp(source, { limitInputPixels: 100000000 }).rotate().resize({ width: 4000, height: 4000, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
        const image = await doc.embedPng(bytes);
        const size = options.paper === 'image' ? [image.width, image.height] : options.paper === 'letter' ? PageSizes.Letter : PageSizes.A4;
        const page = doc.addPage(size);
        const margin = options.paper === 'image' ? 0 : 24;
        const scale = Math.min((size[0] - margin * 2) / image.width, (size[1] - margin * 2) / image.height);
        const width = image.width * scale, height = image.height * scale;
        page.drawImage(image, { x: (size[0] - width) / 2, y: (size[1] - height) / 2, width, height });
      }
      await write('images.pdf', await doc.save());
    } else if (toolId === 'pdf-merge') {
      const doc = await PDFDocument.create();
      for (const file of files) {
        const source = await PDFDocument.load(await fs.promises.readFile(file.path));
        for (const page of await doc.copyPages(source, source.getPageIndices())) doc.addPage(page);
      }
      await write('merged.pdf', await doc.save());
    } else {
      const doc = await PDFDocument.load(await fs.promises.readFile(input), { updateMetadata: false });
      if (!doc.getPageCount()) throw new Error('This PDF has no pages.');
      if (toolId === 'pdf-split') {
        const indices = pageIndices(options.pages, doc.getPageCount());
        const groups = options.mode === 'split' ? indices.map(i => [i]) : [indices];
        for (const group of groups) {
          const target = await PDFDocument.create();
          for (const page of await target.copyPages(doc, group)) target.addPage(page);
          await write(options.mode === 'split' ? `page-${group[0] + 1}.pdf` : 'extracted.pdf', await target.save());
        }
      } else if (toolId === 'pdf-rotate') {
        for (const index of pageIndices(options.pages, doc.getPageCount())) {
          const page = doc.getPage(index);
          page.setRotation(degrees((page.getRotation().angle + Number(options.angle)) % 360));
        }
        await write('rotated.pdf', await doc.save());
      } else if (options.mode === 'edit') {
        doc.setTitle(options.title); doc.setAuthor(options.author); doc.setSubject(options.subject);
        await write('metadata-edited.pdf', await doc.save());
      } else await write('metadata.json', json({ pages: doc.getPageCount(), title: doc.getTitle() || '', author: doc.getAuthor() || '', subject: doc.getSubject() || '', creator: doc.getCreator() || '', producer: doc.getProducer() || '', pageSizes: doc.getPages().map(p => ({ ...p.getSize(), rotation: p.getRotation().angle })) }), true);
    }
  } else if (toolId.startsWith('subtitle-')) {
    const source = await readText();
    const vtt = toolId === 'subtitle-convert' ? options.direction === 'SRT to VTT' : /^\uFEFF?WEBVTT/.test(source) || source.startsWith('WEBVTT');
    await write(vtt ? 'subtitles.vtt' : 'subtitles.srt', subtitles(source, { vtt, shift: toolId === 'subtitle-shift' ? options.seconds * 1000 : 0 }), true);
  } else {
    const info = await probe(input);
    const video = info.streams?.find(s => s.codec_type === 'video' && !s.disposition?.attached_pic);
    const audio = info.streams?.find(s => s.codec_type === 'audio');
    const duration = Number(toolId.startsWith('audio-') ? (audio?.duration || info.format?.duration) : (video?.duration || info.format?.duration));
    if (toolId.startsWith('video-') && !video) throw new Error('Choose a file containing a video track.');
    if (toolId.startsWith('audio-') && !audio) throw new Error('Choose a file containing an audio track.');
    const videoEncoding = ['-c:v', 'libx264', '-preset', 'fast', '-crf', '22', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];
    if (toolId === 'video-frame') {
      if (Number.isFinite(duration) && options.seconds >= duration) throw new Error(`Timestamp must be earlier than ${duration.toFixed(3)} seconds.`);
      const name = `frame.${options.format}`;
      await ff(['-ss', String(options.seconds), '-i', input, '-map', `0:${video.index}`, '-frames:v', '1', '-vf', 'scale=min(4096\\,iw):-2', resultPath(name)]);
      addResult(name);
    } else if (toolId === 'video-contact') {
      if (!(duration > 0)) throw new Error('Could not determine video duration.');
      const count = options.columns * options.rows;
      const frames = [];
      for (let i = 0; i < count; i++) {
        const output = resultPath(`contact-frame-${i}.png`);
        await ff(['-ss', String(duration * (i + 0.5) / count), '-i', input, '-map', `0:${video.index}`, '-frames:v', '1', '-vf', 'scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2:color=0x152238', output]);
        frames.push({ input: output, left: (i % options.columns) * 320, top: Math.floor(i / options.columns) * 180 });
      }
      await sharp({ create: { width: options.columns * 320, height: options.rows * 180, channels: 3, background: '#152238' } }).composite(frames).png().toFile(resultPath('contact-sheet.png'));
      addResult('contact-sheet.png');
    } else if (toolId === 'video-reverse') {
      if (!(duration > 0) || duration > 60) throw new Error('Reverse video requires a clip of 60 seconds or less. Trim it in the media studio first.');
      const args = ['-i', input, '-map', `0:${video.index}`, '-vf', 'scale=w=min(720\\,iw):h=min(720\\,ih):force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=30,reverse'];
      if (audio) args.push('-map', `0:${audio.index}`, '-af', 'areverse', '-c:a', 'aac');
      await ff([...args, ...videoEncoding, resultPath('reversed.mp4')]);
      addResult('reversed.mp4');
    } else if (toolId === 'video-transform') {
      const filters = { cw: 'transpose=1', ccw: 'transpose=2', '180': 'hflip,vflip', horizontal: 'hflip', vertical: 'vflip' };
      await ff(['-i', input, '-map', `0:${video.index}`, '-map', '0:a:0?', '-vf', `${filters[options.transform]},scale=trunc(iw/2)*2:trunc(ih/2)*2`, '-c:a', 'aac', ...videoEncoding, resultPath('transformed.mp4')]);
      addResult('transformed.mp4');
    } else if (toolId === 'video-audio') {
      if (files.length !== 2) throw new Error('Choose exactly two files: video first, audio second.');
      const soundtrack = await probe(files[1].path);
      if (!soundtrack.streams?.some(s => s.codec_type === 'audio')) throw new Error('The second file needs an audio track.');
      await ff(['-i', input, '-i', files[1].path, '-map', `0:${video.index}`, '-map', '1:a:0', '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-af', 'apad', '-shortest', '-c:a', 'aac', ...videoEncoding, resultPath('soundtrack.mp4')]);
      addResult('soundtrack.mp4');
    } else if (toolId === 'audio-waveform') {
      await ff(['-i', input, '-filter_complex', `[0:${audio.index}]aformat=channel_layouts=mono,showwavespic=s=${options.width}x${options.height}:colors=0x2563eb[v]`, '-map', '[v]', '-frames:v', '1', resultPath('waveform.png')]);
      addResult('waveform.png');
    } else if (toolId === 'audio-fade') {
      if (!(duration > 0)) throw new Error('Could not determine audio duration.');
      if (options.fadeIn + options.fadeOut > duration) throw new Error('Combined fade durations must not exceed the recording length.');
      const filters = [];
      if (options.fadeIn > 0) filters.push(`afade=t=in:st=0:d=${options.fadeIn}`);
      if (options.fadeOut > 0) filters.push(`afade=t=out:st=${duration - options.fadeOut}:d=${options.fadeOut}`);
      await ff(['-i', input, '-map', `0:${audio.index}`, '-vn', ...(filters.length ? ['-af', filters.join(',')] : []), '-c:a', 'pcm_s16le', resultPath('faded.wav')]);
      addResult('faded.wav');
    } else if (toolId === 'audio-silence') {
      if (!(duration > 0) || duration > 600) throw new Error('Silence trimming supports recordings up to 10 minutes.');
      // Detect boundaries, then trim once. silenceremove's start_duration refers
      // to non-silent confirmation audio and would otherwise cut into speech.
      const { stderr } = await exec(ffmpeg, ['-hide_banner', '-nostdin', '-i', input, '-map', `0:${audio.index}`, '-af', `silencedetect=noise=${options.threshold}dB:d=${options.duration}`, '-f', 'null', '-'], { timeout: 180000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
      const intervals = [];
      let silenceStart;
      for (const match of stderr.matchAll(/silence_(start|end):\s*(-?\d+(?:\.\d+)?)/g)) {
        if (match[1] === 'start') silenceStart = Number(match[2]);
        else if (silenceStart !== undefined) { intervals.push([silenceStart, Number(match[2])]); silenceStart = undefined; }
      }
      if (silenceStart !== undefined) intervals.push([silenceStart, duration]);
      const start = intervals[0]?.[0] <= 0.01 ? intervals[0][1] : 0;
      const last = intervals[intervals.length - 1];
      const end = last && last[1] >= duration - 0.01 ? last[0] : duration;
      if (end <= start) throw new Error('The entire recording is below the silence threshold. Lower the threshold to retain quieter audio.');
      await ff(['-i', input, '-map', `0:${audio.index}`, '-vn', '-af', `atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS`, '-c:a', 'pcm_s16le', resultPath('trimmed.wav')]);
      addResult('trimmed.wav');
    } else if (toolId === 'audio-split') {
      if (!(audio.channels > 0) || audio.channels > 8) throw new Error('Channel splitting supports 1 to 8 channels.');
      for (let channel = 0; channel < audio.channels; channel++) {
        const name = `channel-${channel + 1}.wav`;
        await ff(['-i', input, '-map', `0:${audio.index}`, '-vn', '-af', `pan=mono|c0=c${channel}`, '-c:a', 'pcm_s16le', resultPath(name)]);
        addResult(name);
      }
    } else if (toolId === 'audio-join') {
      if (files.length < 2) throw new Error('Choose at least two audio files to join.');
      const args = [], filters = [], labels = [];
      for (let i = 0; i < files.length; i++) {
        const details = i === 0 ? info : await probe(files[i].path);
        if (!details.streams?.some(s => s.codec_type === 'audio')) throw new Error(`No audio track in ${files[i].originalname}.`);
        args.push('-i', files[i].path);
        filters.push(`[${i}:a:0]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS[a${i}]`);
        labels.push(`[a${i}]`);
      }
      filters.push(`${labels.join('')}concat=n=${files.length}:v=0:a=1[out]`);
      await ff([...args, '-filter_complex', filters.join(';'), '-map', '[out]', '-c:a', 'pcm_s16le', resultPath('joined.wav')]);
      addResult('joined.wav');
    } else throw new Error('Tool handler is unavailable.');
  }
  for (const result of results) {
    const stat = await fs.promises.stat(result.path).catch(() => null);
    if (!stat?.isFile()) throw new Error('No output was produced. Check the input and conversion settings.');
    result.bytes = stat.size;
  }
  return results;
}

module.exports = { runTool, catalog, pageIndices, subtitles, safeName, validateOptions };
