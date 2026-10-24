'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const exec = promisify(require('node:child_process').execFile);
const sharp = require('sharp');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const Excel = require('exceljs');
const { runTool } = require('../lib/toolbox');
let root;
const fixtures = {};
async function run(toolId, files = [], options = {}, text = '') {
  const workDir = path.join(root, crypto.randomUUID()); await fs.mkdir(workDir);
  return runTool({ toolId, files: files.map(name => ({ path: fixtures[name], originalname: name })), options, text, workDir });
}
async function read(result, index = 0) { return fs.readFile(result[index].path, 'utf8'); }
async function inspect(file) { const { stdout } = await exec(require('ffprobe-static').path, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { windowsHide: true }); return JSON.parse(stdout); }
before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'usc-advanced-test-'));
  for (const name of ['blue.png', 'green.png', 'sample.pdf', 'table.xlsx', 'more.xlsx', 'table.csv', 'clip.mp4', 'quiet.mp4', 'tone.wav', 'archive.zip']) fixtures[name] = path.join(root, name);
  for (const [name, color] of [['blue.png', '#2563eb'], ['green.png', '#059669']]) await sharp({ create: { width: 160, height: 100, channels: 4, background: color } }).png().toFile(fixtures[name]);
  const pdf = await PDFDocument.create(), font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= 3; i++) { const page = pdf.addPage([300, 400]); page.drawText(`Hello page ${i}`, { x: 30, y: 330, font, size: 18, color: rgb(0, 0, .5) }); }
  await fs.writeFile(fixtures['sample.pdf'], await pdf.save());
  for (const name of ['table.xlsx', 'more.xlsx']) {
    const wb = new Excel.Workbook(), sheet = wb.addWorksheet('Data'); sheet.addRows([['Name', 'Score'], [' Ada ', 98], ['Lin', 95], ['Lin', 95], ['', '']]);
    sheet.getCell('D1').value = 'Formula'; sheet.getCell('D2').value = { formula: '1+1', result: 2 }; sheet.getCell('A1').font = { bold: true };
    await wb.xlsx.writeFile(fixtures[name]);
  }
  await fs.writeFile(fixtures['table.csv'], 'Name,Score\nAda,98\nLin,95\n');
  const ff = args => exec(require('ffmpeg-static'), ['-hide_banner', '-loglevel', 'error', '-y', ...args], { windowsHide: true });
  await ff(['-f', 'lavfi', '-i', 'sine=frequency=440:duration=4:sample_rate=48000', '-ac', '2', fixtures['tone.wav']]);
  await ff(['-f', 'lavfi', '-i', 'testsrc2=size=160x96:rate=15:duration=1', '-i', fixtures['tone.wav'], '-t', '1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', fixtures['clip.mp4']]);
  await ff(['-i', fixtures['clip.mp4'], '-an', '-c:v', 'copy', fixtures['quiet.mp4']]);
  const archive = require('archiver')('zip'); const output = require('node:fs').createWriteStream(fixtures['archive.zip']); archive.pipe(output);
  archive.append('hello', { name: 'folder/hello.txt' }); archive.append('world', { name: 'world.txt' });
  await Promise.all([archive.finalize(), new Promise((resolve, reject) => { output.on('close', resolve); archive.on('error', reject); })]);
});
after(async () => { if (root) await fs.rm(root, { recursive: true, force: true }); });
test('41 ZIP inventory and selective extraction preserve bytes', async () => {
  const list = await run('archive-explorer', ['archive.zip']); assert.equal(JSON.parse(await read(list)).entries.length, 2);
  const result = await run('archive-explorer', ['archive.zip'], { mode: 'extract', entries: 'folder/hello.txt' });
  assert.equal(result.length, 2); assert.equal(await read(result), 'hello');
  const { safeEntry } = require('../lib/advanced/archive');
  for (const name of ['../bad', '/bad', 'C:/bad', 'ok/../../bad', 'x:stream']) assert.throws(() => safeEntry(name), /Unsafe/);
});
test('42 PDF rendering creates selected pages at the requested DPI', async () => {
  const result = await run('pdf-render', ['sample.pdf'], { pages: '2', dpi: 72 }); assert.equal(result.length, 1);
  const metadata = await sharp(result[0].path).metadata(); assert.equal(metadata.width, 300); assert.equal(metadata.height, 400);
  const { channels } = await sharp(result[0].path).stats(); assert.ok(channels.some(c => c.stdev > 1));
});
test('43 PDF text extraction retains page boundaries and coordinates', async () => {
  const result = await run('pdf-text', ['sample.pdf'], { pages: '3,1' });
  assert.match(await read(result), /Page 3 ---\nHello page 3/); const data = JSON.parse(await read(result, 1)); assert.equal(data.pages[1].page, 1); assert.ok(data.pages[0].blocks[0].x > 0);
});
test('44 PDF watermarks add actual text to selected pages', async () => {
  const result = await run('pdf-watermark', ['sample.pdf'], { text: 'REVIEW', pages: '2' }); fixtures['watermarked.pdf'] = result[0].path;
  const extracted = await run('pdf-text', ['watermarked.pdf']); const pages = JSON.parse(await read(extracted, 1)).pages;
  assert.doesNotMatch(pages[0].text, /REVIEW/); assert.match(pages[1].text, /REVIEW/);
});
test('45 Page numbering applies prefixes and starts to selected pages', async () => {
  const result = await run('pdf-number', ['sample.pdf'], { pages: '2-3', start: 7, prefix: 'Sheet ' }); fixtures['numbered.pdf'] = result[0].path;
  const extracted = await run('pdf-text', ['numbered.pdf']); assert.match(await read(extracted), /Sheet 7/); assert.match(await read(extracted), /Sheet 8/);
});
test('46 N-up creates the correct number of landscape print sheets', async () => {
  const result = await run('pdf-nup', ['sample.pdf'], { columns: 2, rows: 1 }); const doc = await PDFDocument.load(await fs.readFile(result[0].path));
  assert.equal(doc.getPageCount(), 2); assert.ok(doc.getPage(0).getWidth() > doc.getPage(0).getHeight());
});
test('47 Logo stamping produces a valid PDF retaining source pages', async () => {
  const result = await run('pdf-stamp', ['sample.pdf', 'blue.png'], { pages: '1', widthPercent: 30 });
  const doc = await PDFDocument.load(await fs.readFile(result[0].path)); assert.equal(doc.getPageCount(), 3);
  assert.ok(result[0].bytes > (await fs.stat(fixtures['sample.pdf'])).size);
});
test('49 Markdown creates DOCX headings, tables, emphasis and list content', async () => {
  const result = await run('markdown-docx', [], {}, '# Brief\n\n**Bold** and *italic*.\n\n- First\n- Second\n\n| Name | Score |\n| --- | --- |\n| Ada | 98 |');
  fixtures['document.docx'] = result[0].path;
  const html = (await require('mammoth').convertToHtml({ path: result[0].path })).value;
  assert.match(html, /<h1>Brief/); assert.match(html, /<strong>Bold/); assert.match(html, /<em>italic/); assert.match(html, /<table>/); assert.match(html, /<ul>/); assert.match(html, /Second/);
});
test('48 Word extraction yields semantic HTML, plain text and warnings', async () => {
  const result = await run('docx-extract', ['document.docx']);
  assert.match(await read(result, result.findIndex(r => r.name === 'document.html')), /<h1>Brief/);
  assert.match(await read(result, result.findIndex(r => r.name === 'document.txt')), /Ada/);
  assert.ok(result.some(r => r.name === 'conversion-warnings.json'));
});
test('50 Spreadsheet conversion exports all sheets and creates styled XLSX', async () => {
  const result = await run('spreadsheet-convert', ['table.xlsx'], { mode: 'xlsx-tables' }); assert.equal(result.length, 2);
  const records = JSON.parse(await read(result, 1)); assert.equal(records[0].Formula, 2);
  const back = await run('spreadsheet-convert', [], { mode: 'json-xlsx' }, '[{"Name":"Ada","Score":98}]');
  const wb = new Excel.Workbook(); await wb.xlsx.readFile(back[0].path); assert.equal(wb.worksheets[0].getCell('B2').value, 98); assert.equal(wb.worksheets[0].getRow(1).font.bold, true);
});
test('51 Cleanup trims, deduplicates, removes blank rows and sorts', async () => {
  const result = await run('spreadsheet-clean', ['table.xlsx'], { sort: 'Score', order: 'asc' }); const wb = new Excel.Workbook(); await wb.xlsx.readFile(result[0].path);
  const sheet = wb.worksheets[0]; assert.equal(sheet.rowCount, 3); assert.equal(sheet.getCell('A2').value, 'Lin'); assert.equal(sheet.getCell('A3').value, 'Ada');
  const report = JSON.parse(await read(result, 1)); assert.equal(report[0].duplicatesRemoved, 1); assert.equal(report[0].blankRowsRemoved, 1);
});
test('52 Workbook merge resolves duplicate sheet names and copies styles', async () => {
  const result = await run('spreadsheet-merge', ['table.xlsx', 'more.xlsx']); const wb = new Excel.Workbook(); await wb.xlsx.readFile(result[0].path);
  assert.deepEqual(wb.worksheets.map(s => s.name), ['Data', 'Data (2)']); assert.equal(wb.worksheets[1].getCell('A1').font.bold, true); assert.equal(wb.worksheets[1].getCell('D2').value, 2);
});
test('53 Photo proof sheets have correct cells and filename captions', async () => {
  const result = await run('photo-sheet', ['blue.png', 'green.png'], { columns: 2, cellWidth: 200, cellHeight: 120 });
  const meta = await sharp(result[0].path).metadata(); assert.equal(meta.width, 400); assert.equal(meta.height, 152);
});
test('54 Responsive packs avoid upscaling and contain consistent manifests', async () => {
  const result = await run('responsive-pack', ['blue.png'], { widths: '80,160,320' });
  const data = JSON.parse(await read(result, result.findIndex(r => r.name === 'image-manifest.json')));
  assert.equal(data[0].variants.length, 4); assert.ok(data[0].variants.every(v => v.width <= 160));
  const html = await read(result, result.findIndex(r => r.name.endsWith('.html'))); assert.match(html, /srcset=/);
});
test('55 Sprite atlas emits PNG, CSS and coordinates in input order', async () => {
  const result = await run('sprite-atlas', ['blue.png', 'green.png'], { columns: 2, cell: 64, padding: 4 });
  const meta = await sharp(result[0].path).metadata(); assert.equal(meta.width, 128); assert.equal(meta.height, 64);
  const data = JSON.parse(await read(result, 1)); assert.equal(data.sprites[1].x, 64); assert.match(await read(result, 2), /url\("atlas.png"\)/);
});
test('56 Video assembly supports crossfades and silent sources', async () => {
  const result = await run('video-join', ['clip.mp4', 'quiet.mp4'], { transition: .2, size: '640x360' }); const info = await inspect(result[0].path);
  assert.equal(info.streams[0].width, 640); assert.ok(Number(info.format.duration) > 1.7 && Number(info.format.duration) < 2); assert.ok(info.streams.some(s => s.codec_type === 'audio'));
});
test('57 Comparison grids normalize clips and lay out their pixels', async () => {
  const result = await run('video-grid', ['clip.mp4', 'quiet.mp4'], { cellWidth: 160, columns: 2, audio: 'none' }); const info = await inspect(result[0].path);
  assert.equal(info.streams[0].width, 320); assert.equal(info.streams[0].height, 90); assert.ok(!info.streams.some(s => s.codec_type === 'audio'));
});
test('58 Slideshow creates a playable photo sequence', async () => {
  const result = await run('slideshow', ['blue.png', 'green.png'], { seconds: 1, transition: .2 }); const info = await inspect(result[0].path);
  assert.equal(info.streams[0].width, 1280); assert.ok(Number(info.format.duration) > 1.7 && Number(info.format.duration) < 2);
});
test('59 Mixer respects track offsets and outputs a settings report', async () => {
  const result = await run('audio-mix', ['tone.wav', 'tone.wav'], { offsets: '0,1', gains: '0,-12', duck: 'yes' }); const info = await inspect(result[0].path);
  assert.ok(Math.abs(Number(info.format.duration) - 5) < .1); assert.equal(info.streams[0].channels, 2); assert.equal(JSON.parse(await read(result, 1))[1].startSeconds, 1);
});
test('60 Podcast mastering measures before/after loudness', async () => {
  const result = await run('podcast-master', ['tone.wav'], { lufs: -16 });
  const report = JSON.parse(await read(result, 1)); assert.ok(Number.isFinite(Number(report.before.input_i))); assert.ok(Math.abs(Number(report.after.input_i) + 16) < 1);
});
