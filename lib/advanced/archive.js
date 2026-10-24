'use strict';
const yauzl = require('yauzl');
const fs = require('node:fs/promises');
const path = require('node:path');

function safeEntry(name) {
  const normalized = name.replace(/\\/g, '/');
  if (!normalized || normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized) || normalized.includes('\0') || normalized.split('/').some(p => p === '..' || /:/.test(p))) throw new Error(`Unsafe archive path: ${name}`);
  return normalized;
}
async function walkArchive(file, visitor, { maxEntries = 5000, maxBytes = 200 * 1024 * 1024 } = {}) {
  const zip = await new Promise((resolve, reject) => yauzl.open(file, { lazyEntries: true, autoClose: false }, (err, value) => err ? reject(err) : resolve(value)));
  let count = 0, total = 0;
  try {
    await new Promise((resolve, reject) => {
      zip.on('error', reject); zip.on('end', resolve);
      zip.on('entry', entry => {
        (async () => {
          const name = safeEntry(entry.fileName);
          if (++count > maxEntries || (total += entry.uncompressedSize) > maxBytes) throw new Error('Archive exceeds the entry-count or 200 MB expanded-size limit.');
          if (((entry.externalFileAttributes >>> 16) & 0xf000) === 0xa000) throw new Error('Symbolic links in archives are not supported.');
          if (entry.generalPurposeBitFlag & 1) throw new Error('Encrypted archive entries are not supported.');
          const read = async () => {
            const stream = await new Promise((ok, fail) => zip.openReadStream(entry, (err, source) => err ? fail(err) : ok(source)));
            const chunks = []; let size = 0;
            for await (const chunk of stream) { size += chunk.length; if (size > Math.min(maxBytes, 100 * 1024 * 1024)) { stream.destroy(); throw new Error('An archive entry exceeds 100 MB.'); } chunks.push(chunk); }
            return Buffer.concat(chunks);
          };
          await visitor({ name, bytes: entry.uncompressedSize, compressedBytes: entry.compressedSize, directory: name.endsWith('/'), read });
          zip.readEntry();
        })().catch(reject);
      });
      zip.readEntry();
    });
  } finally { zip.close(); }
}
async function validateOfficeArchive(file) { await walkArchive(file, async () => {}); }
async function archiveTool(ctx) {
  const inventory = [], selected = ctx.options.entries.split('|').map(s => s.trim()).filter(Boolean), found = new Set();
  await walkArchive(ctx.files[0].path, async entry => {
    inventory.push({ name: entry.name, bytes: entry.bytes, compressedBytes: entry.compressedBytes, directory: entry.directory });
    if (ctx.options.mode === 'extract' && !entry.directory && (!selected.length || selected.includes(entry.name))) {
      found.add(entry.name);
      await ctx.write(`${String(found.size).padStart(3, '0')}-${path.basename(entry.name)}`, await entry.read());
    }
  });
  if (selected.some(name => !found.has(name)) && ctx.options.mode === 'extract') throw new Error('Some selected entry paths were not found. Inspect the archive inventory first.');
  await ctx.write('archive-inventory.json', JSON.stringify({ entries: inventory, totalBytes: inventory.reduce((sum, e) => sum + e.bytes, 0) }, null, 2), true);
}
module.exports = { safeEntry, walkArchive, validateOfficeArchive, archiveTool };
