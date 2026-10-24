'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { promisify } = require('node:util');
const exec = promisify(require('node:child_process').execFile);
const sharp = require('sharp');
const heic = require('heic-convert');

async function runAdvanced({ toolId, text = '', files = [], options = {}, workDir }) {
  const { safeName, pageIndices } = require('./toolbox');
  const tool = require('../public/advanced-catalog').find(t => t.id === toolId);
  if (!tool) throw new Error('Unknown advanced tool.');
  if (tool.input !== 'text' && !files.length) throw new Error('Choose input files.');
  if (tool.input === 'file' && files.length !== 1) throw new Error('Choose exactly one file.');
  if (tool.input === 'text' && files.length > 1) throw new Error('Choose one file or paste text.');
  if (files.length > 20) throw new Error('Choose at most 20 input files.');
  const results = [], used = new Set();
  function destination(name) {
    name = safeName(name);
    const ext = path.extname(name), stem = path.basename(name, ext);
    let unique = name, i = 2;
    while (used.has(unique.toLowerCase())) unique = `${stem}-${i++}${ext}`;
    used.add(unique.toLowerCase());
    return { name: unique, path: path.join(workDir, `output-${unique}`) };
  }
  const ctx = { toolId, files, options, workDir, safeName, pageIndices, results, destination,
    async write(name, data, preview = false) {
      const result = destination(name); await fs.writeFile(result.path, data);
      if (preview) result.preview = Buffer.from(data).toString('utf8').slice(0, 100000);
      results.push(result); return result;
    },
    async generated(name, generate) { const result = destination(name); await generate(result.path); results.push(result); return result; },
    async sourceText() {
      if (files.length) { const info = await fs.stat(files[0].path); if (info.size > 10 * 1024 * 1024) throw new Error('Text inputs are limited to 10 MB.'); return (await fs.readFile(files[0].path, 'utf8')).replace(/^\uFEFF/, ''); }
      if (Buffer.byteLength(text) > 10 * 1024 * 1024) throw new Error('Text inputs are limited to 10 MB.'); return text;
    },
    async image(file) {
      let input = file.path;
      if (/\.hei[cf]$/i.test(file.originalname)) input = Buffer.from(await heic({ buffer: await fs.readFile(input), format: 'PNG' }));
      return sharp(input, { limitInputPixels: 100000000 }).rotate();
    },
    async ff(args, capture = false) {
      try { return await exec(require('ffmpeg-static'), ['-hide_banner', '-nostdin', '-y', '-loglevel', capture ? 'info' : 'error', ...args], { timeout: 600000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }); }
      catch (error) { throw new Error(error.killed ? 'Media processing exceeded ten minutes. Use smaller inputs.' : `Media conversion failed: ${(error.stderr || error.message).slice(-1600)}`); }
    },
    async probe(file) {
      const { stdout } = await exec(require('ffprobe-static').path, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file.path], { timeout: 20000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
      return JSON.parse(stdout);
    }
  };
  if (toolId === 'archive-explorer') await require('./advanced/archive').archiveTool(ctx);
  else if (toolId.startsWith('pdf-')) await require('./advanced/pdf').pdfTool(ctx);
  else if (toolId.startsWith('spreadsheet-') || toolId.startsWith('docx-') || toolId === 'markdown-docx') await require('./advanced/office').officeTool(ctx);
  else if (['photo-sheet', 'responsive-pack', 'sprite-atlas'].includes(toolId)) await require('./advanced/images').imageTool(ctx);
  else await require('./advanced/media').mediaTool(ctx);
  if (!results.length) throw new Error('No output was produced.');
  for (const result of results) result.bytes = (await fs.stat(result.path)).size;
  return results;
}
module.exports = { runAdvanced };
