'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const exec = promisify(require('node:child_process').execFile);
const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');
const express = require('express');
const { runTool, catalog, pageIndices, subtitles } = require('../lib/toolbox');
const routes = require('../lib/toolbox-routes');
const ffmpeg = require('ffmpeg-static');
const ffprobe = require('ffprobe-static').path;
let root, server, base;
const fixture = {};

async function inspect(file) {
  const { stdout } = await exec(ffprobe, ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', file], { windowsHide: true });
  return JSON.parse(stdout);
}
async function run(id, { text = '', files = [], options = {} } = {}) {
  const dir = path.join(root, crypto.randomUUID());
  await fs.mkdir(dir);
  return runTool({ toolId: id, text, files: files.map(name => ({ path: fixture[name], originalname: path.basename(fixture[name]) })), options, workDir: dir });
}
async function content(results, i = 0) { return fs.readFile(results[i].path, 'utf8'); }
async function upload(id, names = [], options = {}, text = '') {
  const form = new FormData();
  form.append('toolId', id); form.append('options', JSON.stringify(options)); form.append('text', text);
  for (const name of names) form.append('files', new Blob([await fs.readFile(fixture[name])]), path.basename(fixture[name]));
  return fetch(`${base}/run`, { method: 'POST', body: form });
}

before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'usc-toolbox-test-'));
  for (const name of ['image.png', 'first.pdf', 'second.pdf', 'stereo.wav', 'silence.wav', 'clip.mp4', 'silent.mp4', 'raw.bin', 'latin.txt']) fixture[name] = path.join(root, name);
  await sharp({ create: { width: 160, height: 96, channels: 4, background: '#2563eb80' } }).png().toFile(fixture['image.png']);
  for (const [name, pages] of [['first.pdf', 3], ['second.pdf', 2]]) {
    const doc = await PDFDocument.create();
    for (let i = 0; i < pages; i++) doc.addPage([200 + i * 10, 300]);
    doc.setTitle(name); await fs.writeFile(fixture[name], await doc.save());
  }
  const media = async args => exec(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { windowsHide: true });
  await media(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=3:sample_rate=48000', '-ac', '2', fixture['stereo.wav']]);
  await media(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=1:sample_rate=48000', '-af', 'adelay=500,apad=pad_dur=0.5', fixture['silence.wav']]);
  await media(['-f', 'lavfi', '-i', 'testsrc2=size=160x96:rate=10:duration=3', '-i', fixture['stereo.wav'], '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', fixture['clip.mp4']]);
  await media(['-i', fixture['clip.mp4'], '-an', '-c:v', 'copy', fixture['silent.mp4']]);
  await fs.writeFile(fixture['raw.bin'], Buffer.from([0, 1, 2, 255, 200]));
  await fs.writeFile(fixture['latin.txt'], Buffer.from('Café', 'latin1'));
  const app = express();
  app.use('/api/toolbox', routes(root));
  server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
  base = `http://127.0.0.1:${server.address().port}/api/toolbox`;
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); if (root) await fs.rm(root, { recursive: true, force: true }); });

test('Catalog exposes 100 unique tools including all previous conversions', async () => {
  assert.equal(catalog.length, 100); assert.equal(new Set(catalog.map(t => t.id)).size, 100);
  const response = await fetch(`${base}/catalog`); assert.equal(response.status, 200);
  assert.equal((await response.json()).tools.length, 100);
});
test('01 JSON ↔ CSV handles quoted newlines, union of keys, Unicode and formula protection', async () => {
  const result = await run('json-csv', { text: JSON.stringify([{ name: 'Café,\nAda', value: '=1+1' }, { name: 'Lin', extra: { a: 1 } }]) });
  const csv = await content(result); assert.match(csv, /'=1\+1/);
  const back = await run('json-csv', { text: csv, options: { direction: 'CSV to JSON' } });
  const rows = JSON.parse(await content(back)); assert.equal(rows[0].name, 'Café,\nAda'); assert.equal(rows[1].extra, '{"a":1}');
});
test('02 JSON ↔ YAML preserves arrays, booleans and Unicode', async () => {
  const data = { name: 'Café', enabled: true, items: [1, 'two'] };
  const yaml = await content(await run('json-yaml', { text: JSON.stringify(data) }));
  const back = await run('json-yaml', { text: yaml, options: { direction: 'YAML to JSON' } });
  assert.deepEqual(JSON.parse(await content(back)), data);
});
test('03 JSON ↔ XML preserves attributes and escaped characters', async () => {
  const xml = await content(await run('json-xml', { text: '{"record":{"@_id":"a","name":"A & B"}}' }));
  const back = await run('json-xml', { text: xml, options: { direction: 'XML to JSON' } });
  assert.deepEqual(JSON.parse(await content(back)), { root: { record: { '@_id': 'a', name: 'A & B' } } });
});
test('04 CSV ↔ TSV preserves tabs inside cells', async () => {
  const csv = 'name,note\nAda,"a\tb"\n';
  const tsv = await content(await run('csv-tsv', { text: csv }));
  const back = await run('csv-tsv', { text: tsv, options: { direction: 'TSV to CSV' } });
  assert.deepEqual(require('csv-parse/sync').parse(await content(back)), require('csv-parse/sync').parse(csv));
});
test('05 JSON formatting validates and minifies', async () => {
  const result = await run('json-format', { text: '{ "ok": true }', options: { style: 'compact' } });
  assert.equal(await content(result), '{"ok":true}\n');
  await assert.rejects(run('json-format', { text: '{broken}' }));
});
test('06 Markdown produces a standalone HTML document with an escaped title', async () => {
  const html = await content(await run('markdown-html', { text: '# Hello\n\n**world**', options: { title: '<test>' } }));
  assert.match(html, /<!doctype html>/); assert.match(html, /<h1>Hello<\/h1>/); assert.match(html, /<strong>world<\/strong>/); assert.doesNotMatch(html, /<title><test>/);
});
test('07 HTML becomes readable text without executable elements', async () => {
  const txt = await content(await run('html-text', { text: '<h1>Hello</h1><script>alert(1)</script><p>Caf&eacute;</p>' }));
  assert.match(txt, /Café/); assert.doesNotMatch(txt, /alert/);
});
test('08 Base64 restores arbitrary binary bytes and accepts data URLs', async () => {
  const encoded = await content(await run('base64', { files: ['raw.bin'] }));
  const decoded = await run('base64', { text: `data:application/octet-stream;base64,${encoded}`, options: { direction: 'Decode', filename: '../../manifest.json' } });
  assert.equal(decoded[0].name, 'manifest.json');
  assert.deepEqual(await fs.readFile(decoded[0].path), await fs.readFile(fixture['raw.bin']));
  await assert.rejects(run('base64', { text: 'invalid!', options: { direction: 'Decode' } }), /valid/);
});
test('09 URL encoding restores Unicode and literal plus signs', async () => {
  const source = 'Café + tea & water';
  const encoded = await content(await run('url-codec', { text: source }));
  assert.equal(await content(await run('url-codec', { text: encoded, options: { direction: 'Decode' } })), source);
});
test('10 HTML entities round-trip Unicode and markup', async () => {
  const source = '<p>Café & tea</p>';
  const encoded = await content(await run('html-entities', { text: source }));
  assert.equal(await content(await run('html-entities', { text: encoded, options: { direction: 'Decode' } })), source);
});
test('11 Text encodings emit UTF-16 BOM and reject lossy Latin-1', async () => {
  const result = await run('text-encoding', { files: ['latin.txt'], options: { from: 'latin1', to: 'utf16le' } });
  const bytes = await fs.readFile(result[0].path);
  assert.equal(bytes[0], 255); assert.equal(bytes[1], 254); assert.equal(bytes.subarray(2).toString('utf16le'), 'Café');
  await assert.rejects(run('text-encoding', { text: '🦊', options: { to: 'latin1' } }), /cannot represent/);
});
test('12 Checksums match independent crypto digests for multiple files', async () => {
  const data = JSON.parse(await content(await run('checksums', { files: ['raw.bin', 'latin.txt'] })));
  assert.equal(data.length, 2);
  assert.equal(data[0].sha256, crypto.createHash('sha256').update(await fs.readFile(fixture['raw.bin'])).digest('hex'));
  assert.equal(data[0].md5.length, 32); assert.equal(data[0].sha512.length, 128);
});
test('13 Gzip compresses and restores binary bytes', async () => {
  const result = await run('gzip', { files: ['raw.bin'] });
  fixture['compressed.gz'] = result[0].path;
  const back = await run('gzip', { files: ['compressed.gz'], options: { direction: 'Decompress' } });
  assert.deepEqual(await fs.readFile(back[0].path), await fs.readFile(fixture['raw.bin']));
});
test('14 Images to PDF creates ordered A4 pages', async () => {
  const result = await run('images-pdf', { files: ['image.png', 'image.png'] });
  const doc = await PDFDocument.load(await fs.readFile(result[0].path));
  assert.equal(doc.getPageCount(), 2); assert.ok(Math.abs(doc.getPage(0).getWidth() - 595.28) < .01);
});
test('15 PDF merge preserves page order and dimensions', async () => {
  const result = await run('pdf-merge', { files: ['second.pdf', 'first.pdf'] });
  const doc = await PDFDocument.load(await fs.readFile(result[0].path));
  assert.equal(doc.getPageCount(), 5); assert.equal(doc.getPage(1).getWidth(), 210); assert.equal(doc.getPage(2).getWidth(), 200);
});
test('16 PDF extraction honors order and split emits individual pages', async () => {
  const extracted = await run('pdf-split', { files: ['first.pdf'], options: { pages: '3,1' } });
  const doc = await PDFDocument.load(await fs.readFile(extracted[0].path));
  assert.equal(doc.getPageCount(), 2); assert.equal(doc.getPage(0).getWidth(), 220);
  const split = await run('pdf-split', { files: ['first.pdf'], options: { pages: '1-2', mode: 'split' } });
  assert.equal(split.length, 2); assert.equal((await PDFDocument.load(await fs.readFile(split[1].path))).getPageCount(), 1);
});
test('17 PDF rotation only changes selected pages', async () => {
  const result = await run('pdf-rotate', { files: ['first.pdf'], options: { angle: '90', pages: '2' } });
  const doc = await PDFDocument.load(await fs.readFile(result[0].path));
  assert.deepEqual(doc.getPages().map(p => p.getRotation().angle), [0, 90, 0]);
});
test('18 PDF metadata supports inspection and editing', async () => {
  const metadata = JSON.parse(await content(await run('pdf-metadata', { files: ['first.pdf'] })));
  assert.equal(metadata.pages, 3); assert.equal(metadata.title, 'first.pdf');
  const result = await run('pdf-metadata', { files: ['first.pdf'], options: { mode: 'edit', title: 'New title', author: 'Ada', subject: 'Local' } });
  const doc = await PDFDocument.load(await fs.readFile(result[0].path));
  assert.equal(doc.getTitle(), 'New title'); assert.equal(doc.getAuthor(), 'Ada'); assert.equal(doc.getSubject(), 'Local');
});
const srt = '1\n00:00:01,000 --> 00:00:03,500\nHello!\n';
test('19 SRT ↔ WebVTT converts timing punctuation', async () => {
  const vtt = await content(await run('subtitle-convert', { text: srt }));
  assert.match(vtt, /^WEBVTT\n\n/); assert.match(vtt, /00:00:01\.000/);
  assert.equal(await content(await run('subtitle-convert', { text: vtt, options: { direction: 'VTT to SRT' } })), srt);
});
test('20 Subtitle shift handles negatives and retains VTT settings', async () => {
  const shifted = await content(await run('subtitle-shift', { text: srt, options: { seconds: -2 } }));
  assert.match(shifted, /00:00:00,000 --> 00:00:01,500/);
  const vtt = subtitles('WEBVTT\n\n00:01.000 --> 00:02.000 align:start\nHello\n', { vtt: true, shift: 100 });
  assert.match(vtt, /00:00:01\.100 --> 00:00:02\.100 align:start/);
});
test('21 Video frame extraction creates a real PNG at the requested timestamp', async () => {
  const result = await run('video-frame', { files: ['clip.mp4'], options: { seconds: 1 } });
  const image = await sharp(result[0].path).metadata(); assert.equal(image.format, 'png'); assert.equal(image.width, 160);
});
test('22 Video contact sheet creates the requested grid', async () => {
  const result = await run('video-contact', { files: ['clip.mp4'], options: { columns: 2, rows: 2 } });
  const image = await sharp(result[0].path).metadata(); assert.equal(image.width, 640); assert.equal(image.height, 360);
});
test('23 Video reversal retains audio and supports silent inputs', async () => {
  for (const input of ['clip.mp4', 'silent.mp4']) {
    const result = await run('video-reverse', { files: [input] });
    const info = await inspect(result[0].path); assert.ok(Math.abs(Number(info.format.duration) - 3) < .2);
    assert.equal(info.streams.some(s => s.codec_type === 'audio'), input === 'clip.mp4');
  }
});
test('24 Video rotation changes dimensions and flips preserve them', async () => {
  for (const transform of ['cw', 'ccw', '180', 'horizontal', 'vertical']) {
    const result = await run('video-transform', { files: ['clip.mp4'], options: { transform } });
    const video = (await inspect(result[0].path)).streams.find(s => s.codec_type === 'video');
    assert.equal(video.width, ['cw', 'ccw'].includes(transform) ? 96 : 160);
    assert.equal(video.height, ['cw', 'ccw'].includes(transform) ? 160 : 96);
  }
});
test('25 Soundtrack replacement outputs video and audio', async () => {
  const result = await run('video-audio', { files: ['silent.mp4', 'stereo.wav'] });
  const info = await inspect(result[0].path); assert.equal(info.streams.filter(s => ['video', 'audio'].includes(s.codec_type)).length, 2);
  assert.ok(Math.abs(Number(info.format.duration) - 3) < .2);
});
test('26 Waveform creates the requested image dimensions', async () => {
  const result = await run('audio-waveform', { files: ['stereo.wav'], options: { width: 640, height: 200 } });
  const image = await sharp(result[0].path).metadata(); assert.equal(image.width, 640); assert.equal(image.height, 200);
});
test('27 Audio fades retain duration and lower the opening amplitude', async () => {
  const result = await run('audio-fade', { files: ['stereo.wav'], options: { fadeIn: 1, fadeOut: 1 } });
  const info = await inspect(result[0].path); assert.ok(Math.abs(Number(info.format.duration) - 3) < .01);
  const { stdout } = await exec(ffmpeg, ['-v', 'error', '-i', result[0].path, '-t', '0.01', '-f', 's16le', '-ac', '1', '-'], { encoding: 'buffer', windowsHide: true });
  let peak = 0; for (let i = 0; i + 1 < stdout.length; i += 2) peak = Math.max(peak, Math.abs(stdout.readInt16LE(i)));
  assert.ok(peak < 100, `Opening peak should be faded: ${peak}`);
});
test('28 Silence trimming removes padding from both ends', async () => {
  const result = await run('audio-silence', { files: ['silence.wav'] });
  const info = await inspect(result[0].path); assert.ok(Number(info.format.duration) > .9); assert.ok(Number(info.format.duration) < 1.2);
});
test('29 Channel splitter outputs separate mono WAV files', async () => {
  const result = await run('audio-split', { files: ['stereo.wav'] }); assert.equal(result.length, 2);
  for (const file of result) assert.equal((await inspect(file.path)).streams[0].channels, 1);
});
test('30 Audio join concatenates in order at 48 kHz stereo', async () => {
  const result = await run('audio-join', { files: ['stereo.wav', 'silence.wav'] });
  const info = await inspect(result[0].path); assert.ok(Math.abs(Number(info.format.duration) - 5) < .01);
  assert.equal(info.streams[0].sample_rate, '48000'); assert.equal(info.streams[0].channels, 2);
});
test('API converts multipart text and serves attachment downloads', async () => {
  const response = await upload('json-format', [], { style: 'compact' }, '{ "answer": 42 }');
  assert.equal(response.status, 200); const body = await response.json(); assert.equal(body.results.length, 1);
  const file = await fetch(new URL(body.results[0].url, base));
  assert.match(file.headers.get('content-disposition'), /attachment/); assert.equal(await file.text(), '{"answer":42}\n');
});
test('API handles real binary uploads, cleans originals, and protects filenames', async () => {
  const response = await upload('base64', ['raw.bin']); assert.equal(response.status, 200);
  const body = await response.json(); assert.equal(body.results[0].preview, 'AAEC/8g=');
  const job = body.results[0].url.split('/')[4];
  const names = await fs.readdir(path.join(root, '.toolbox-results', job)); assert.equal(names.length, 2); assert.ok(names.every(n => !n.startsWith('input-')));
  assert.equal((await fetch(`${base}/download/${job}/manifest.json`)).status, 404);
  assert.equal((await fetch(`${base}/download/${job}/input-not-present`)).status, 404);
  const hostile = await upload('base64', [], { direction: 'Decode', filename: 'manifest.json' }, 'aGVsbG8=');
  const data = await hostile.json(); assert.equal(hostile.status, 200);
  assert.equal(await (await fetch(new URL(data.results[0].url, base))).text(), 'hello');
});
test('API rejects invalid requests and leaves no failed jobs behind', async () => {
  const before = await fs.readdir(path.join(root, '.toolbox-results'));
  for (const [toolId, names, options, text] of [['missing', [], {}, 'x'], ['pdf-merge', ['first.pdf'], {}, ''], ['video-frame', ['clip.mp4'], { seconds: 900 }, ''], ['json-format', [], {}, 'bad']]) {
    const response = await upload(toolId, names, options, text); assert.equal(response.status, 400); assert.ok((await response.json()).error);
  }
  assert.deepEqual(await fs.readdir(path.join(root, '.toolbox-results')), before);
});
test('Validation rejects malformed ranges, XML entities, unsupported values and missing tracks', async () => {
  assert.throws(() => pageIndices('0-100000000', 3), /between/);
  assert.throws(() => pageIndices('2-1', 3), /between/);
  await assert.rejects(run('json-xml', { text: '<!DOCTYPE a [<!ENTITY x "evil">]><a>&x;</a>', options: { direction: 'XML to JSON' } }), /entity/);
  await assert.rejects(run('video-transform', { files: ['clip.mp4'], options: { transform: 'hacker' } }), /valid/);
  await assert.rejects(run('video-contact', { files: ['clip.mp4'], options: { columns: 2.5 } }), /whole number/);
  await assert.rejects(run('audio-fade', { files: ['silent.mp4'] }), /audio track/);
  await assert.rejects(run('video-frame', { files: ['stereo.wav'] }), /video track/);
});
test('Empty binary files round-trip through gzip and HTML-only scripts yield empty text', async () => {
  fixture['empty.bin'] = path.join(root, 'empty.bin'); await fs.writeFile(fixture['empty.bin'], Buffer.alloc(0));
  const compressed = await run('gzip', { files: ['empty.bin'] }); fixture['empty.gz'] = compressed[0].path;
  const restored = await run('gzip', { files: ['empty.gz'], options: { direction: 'Decompress' } }); assert.equal(restored[0].bytes, 0);
  assert.equal(await content(await run('html-text', { text: '<script>alert(1)</script>' })), '');
});
test('JSON text requests preserve pasted newlines and exact UTF-8 hash bytes', async () => {
  const text = 'Hello\nCafé\n';
  const response = await fetch(`${base}/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ toolId: 'text-hash', text, options: { algorithm: 'sha256' } }) });
  assert.equal(response.status, 200); const data = await response.json(); const hashes = JSON.parse(data.results[0].preview);
  assert.equal(hashes.hashes.sha256, crypto.createHash('sha256').update(text, 'utf8').digest('hex')); assert.equal(hashes.bytes, Buffer.byteLength(text));
  assert.equal((await fetch(`${base}/run`, { method: 'POST', headers: { Origin: 'https://example.com', 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
});
