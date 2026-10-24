'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const catalog = require('../../public/utility-catalog');

async function runUtility({ toolId, text = '', files = [], options = {}, workDir }) {
  const tool = catalog.find(t => t.id === toolId);
  if (!tool) throw new Error('Unknown utility.');
  if (tool.input === 'file' && files.length !== 1) throw new Error('Choose exactly one input file.');
  if (tool.input === 'text' && files.length > 1) throw new Error('Choose one input file or paste text.');
  if (tool.input === 'none' && files.length) throw new Error('This generator does not use input files.');
  const { safeName, pageIndices } = require('../toolbox');
  const results = [];
  const ctx = { toolId, tool, files, options, workDir, safeName, pageIndices, results,
    async source(limit = 1000000) {
      if (files.length) {
        if ((await fs.stat(files[0].path)).size > limit) throw new Error(`This utility accepts at most ${Math.round(limit / 1000000)} MB of input.`);
        return (await fs.readFile(files[0].path, 'utf8')).replace(/^\uFEFF/, '');
      }
      if (Buffer.byteLength(text) > limit) throw new Error('Pasted utility text is limited to 1 MB.');
      return String(text);
    },
    async write(name, data, preview = false, extra = {}) {
      name = safeName(name); const outputPath = path.join(workDir, `output-${name}`);
      if (results.some(r => r.name === name)) throw new Error('Duplicate output filename.');
      await fs.writeFile(outputPath, data);
      const result = { path: outputPath, name, bytes: Buffer.byteLength(data), ...(preview ? { preview: Buffer.from(data).toString('utf8').slice(0, 100000) } : {}), ...extra };
      results.push(result); return result;
    },
    async json(name, data, extra = {}) { return ctx.write(name, JSON.stringify(data, null, 2) + '\n', true, extra); }
  };
  if (toolId.startsWith('pdf-')) await require('./pdf').pdfUtility(ctx);
  else if (['text-hash', 'hmac', 'aes-encrypt', 'password-generate', 'uuid-generate', 'token-generate', 'scrypt-password', 'bcrypt-password', 'certificate-inspect', 'jwt-inspect'].includes(toolId)) await require('./security').securityUtility(ctx);
  else if (['qr-generate', 'qr-decode', 'color-convert', 'contrast-check', 'unit-convert', 'timestamp-convert'].includes(toolId)) await require('./general').generalUtility(ctx);
  else if (['regex-lab', 'json-diff', 'json-pointer', 'json-flatten', 'json-lines', 'csv-query', 'sql-format', 'code-format', 'css-minify', 'javascript-minify', 'url-inspect'].includes(toolId)) await require('./developer').developerUtility(ctx);
  else await require('./text').textUtility(ctx);
  if (!results.length) throw new Error('This utility produced no results.');
  return results;
}
module.exports = { runUtility };
