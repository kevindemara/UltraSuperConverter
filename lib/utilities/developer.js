'use strict';
const { Worker } = require('node:worker_threads');
const path = require('node:path');
const pointerEscape = key => String(key).replace(/~/g, '~0').replace(/\//g, '~1');
function pointerParts(pointer) {
  if (pointer === '') return [];
  if (!pointer.startsWith('/') || /~(?:[^01]|$)/.test(pointer)) throw new Error('Use a valid JSON Pointer beginning with /, or an empty pointer for the whole document.');
  return pointer.slice(1).split('/').map(s => s.replace(/~1/g, '/').replace(/~0/g, '~'));
}
function queryPointer(data, pointer) {
  let current = data;
  for (const part of pointerParts(pointer)) {
    if (current === null || typeof current !== 'object' || !Object.hasOwn(current, part) || (Array.isArray(current) && !/^(0|[1-9]\d*)$/.test(part))) throw new Error(`JSON Pointer does not exist: ${pointer}`);
    current = current[part];
  }
  return current;
}
function flatten(data) {
  const containers = Object.create(null), values = Object.create(null); let nodes = 0;
  function visit(value, pointer, depth) {
    if (++nodes > 100000 || depth > 100) throw new Error('JSON is limited to 100 levels and 100,000 nodes.');
    if (value !== null && typeof value === 'object') { containers[pointer] = Array.isArray(value) ? 'array' : 'object'; for (const key of Object.keys(value)) visit(value[key], `${pointer}/${pointerEscape(key)}`, depth + 1); }
    else values[pointer] = value;
  }
  visit(data, '', 0); return { format: 'usc-flat-json', version: 1, containers, values };
}
function unflatten(envelope) {
  if (envelope?.format !== 'usc-flat-json' || envelope.version !== 1 || !envelope.containers || !envelope.values || typeof envelope.containers !== 'object' || typeof envelope.values !== 'object' || Array.isArray(envelope.containers) || Array.isArray(envelope.values)) throw new Error('Provide a flattened JSON envelope created by this tool.');
  const entries = [...Object.entries(envelope.containers).map(([pointer, kind]) => { if (!['object', 'array'].includes(kind)) throw new Error('Invalid container type.'); return [pointer, kind === 'array' ? [] : Object.create(null)]; }), ...Object.entries(envelope.values).map(([pointer, value]) => { if (value !== null && typeof value === 'object') throw new Error('Flattened values must be scalars.'); return [pointer, value]; })];
  if (entries.length > 100000) throw new Error('Flattened input has too many nodes.');
  entries.sort((a, b) => pointerParts(a[0]).length - pointerParts(b[0]).length);
  const seen = new Set(); let root, hasRoot = false;
  for (const [pointer, value] of entries) {
    if (seen.has(pointer)) throw new Error('A JSON Pointer appears as both a value and a container.'); seen.add(pointer);
    const parts = pointerParts(pointer); if (parts.length > 100) throw new Error('JSON nesting exceeds 100 levels.');
    if (!parts.length) { root = value; hasRoot = true; continue; }
    if (!hasRoot) throw new Error('Flattened JSON is missing its root.');
    const parentPointer = '/' + parts.slice(0, -1).map(pointerEscape).join('/');
    const parent = queryPointer(root, parts.length === 1 ? '' : parentPointer), key = parts.at(-1);
    if (parent === null || typeof parent !== 'object') throw new Error('A flattened parent is not a container.');
    if (Array.isArray(parent) && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) > 100000)) throw new Error('Invalid array index in flattened JSON.');
    Object.defineProperty(parent, key, { value, enumerable: true, configurable: true, writable: true });
  }
  if (!hasRoot) throw new Error('Flattened JSON has no root.');
  // Array holes are not produced by the flatten operation and are rejected.
  for (const [, value] of entries) if (Array.isArray(value) && Object.keys(value).length !== value.length) throw new Error('Flattened arrays must not contain gaps.');
  return root;
}
async function regexRun(source, options) {
  if (source.length > 200000 || options.pattern.length > 2000) throw new Error('Regex tests accept at most 200,000 input characters and a 2,000-character pattern.');
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'regex-worker.js'), { workerData: { source, ...options }, resourceLimits: { maxOldGenerationSizeMb: 64 } });
    const timer = setTimeout(() => { worker.terminate(); reject(new Error('Regular expression exceeded the two-second deadline. Simplify the pattern.')); }, 2000);
    const finish = () => { clearTimeout(timer); worker.terminate(); };
    worker.once('message', result => { finish(); if (result.error) reject(new Error(result.error)); else resolve(result); });
    worker.once('error', error => { finish(); reject(error); });
    worker.once('exit', code => { if (code !== 0) { clearTimeout(timer); reject(new Error('Regex worker stopped before completing.')); } });
  });
}
async function developerUtility(ctx) {
  const source = await ctx.source(), o = ctx.options, id = ctx.toolId;
  if (id === 'regex-lab') {
    const result = await regexRun(source, o);
    if (typeof result.output === 'string') await ctx.write('replaced.txt', result.output, true); else await ctx.json('regex-matches.json', result);
  } else if (id === 'json-diff') {
    const before = JSON.parse(source), after = JSON.parse(o.other), changes = []; let nodes = 0;
    function visit(a, b, pointer, depth) {
      if (++nodes > 100000 || depth > 100 || changes.length > 10000) throw new Error('JSON diff exceeds the depth, node or change limit.');
      if (Object.is(a, b)) return;
      if (a !== null && b !== null && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
        for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
          const p = `${pointer}/${pointerEscape(key)}`;
          if (!Object.hasOwn(a, key)) changes.push({ type: 'added', path: p, after: b[key] });
          else if (!Object.hasOwn(b, key)) changes.push({ type: 'removed', path: p, before: a[key] });
          else visit(a[key], b[key], p, depth + 1);
        }
      } else changes.push({ type: 'changed', path: pointer, before: a, after: b });
    }
    visit(before, after, '', 0); await ctx.json('json-diff.json', { identical: changes.length === 0, changes });
  } else if (id === 'json-pointer') await ctx.json('selected-value.json', queryPointer(JSON.parse(source), o.pointer));
  else if (id === 'json-flatten') await ctx.json('converted.json', o.mode === 'flatten' ? flatten(JSON.parse(source)) : unflatten(JSON.parse(source)));
  else if (id === 'json-lines') {
    if (o.mode === 'encode') { const values = JSON.parse(source); if (!Array.isArray(values)) throw new Error('Provide a JSON array.'); await ctx.write('converted.jsonl', values.map(v => JSON.stringify(v)).join('\n') + (values.length ? '\n' : ''), true); }
    else { const values = []; source.replace(/\r\n?/g, '\n').split('\n').forEach((line, index) => { if (!line.trim()) return; try { values.push(JSON.parse(line)); } catch (_) { throw new Error(`Invalid JSON on line ${index + 1}.`); } }); await ctx.json('converted.json', values); }
  } else if (id === 'csv-query') {
    const { parse } = require('csv-parse/sync'), { stringify } = require('csv-stringify/sync');
    const table = parse(source, { bom: true, skip_empty_lines: true }); if (!table.length) throw new Error('Provide CSV with a header row.');
    const header = table[0]; if (new Set(header).size !== header.length) throw new Error('CSV headers must be unique.');
    const columns = o.columns.trim() ? o.columns.split('|').map(s => s.trim()) : header;
    const indexOf = name => { const i = header.indexOf(name); if (i < 0) throw new Error(`CSV column not found: ${name}`); return i; };
    const selected = columns.map(indexOf); let rows = table.slice(1);
    if (o.filterColumn) { const index = indexOf(o.filterColumn); rows = rows.filter(row => row[index].includes(o.contains)); }
    if (o.sortColumn) { const index = indexOf(o.sortColumn), sign = o.order === 'desc' ? -1 : 1; rows.sort((a, b) => sign * a[index].localeCompare(b[index], 'en', { numeric: true })); }
    await ctx.write('filtered.csv', stringify([columns, ...rows.map(row => selected.map(i => row[i]))], { escape_formulas: true }), true);
    await ctx.json('csv-report.json', { inputRows: table.length - 1, outputRows: rows.length, columns });
  } else if (id === 'sql-format') {
    if (source.length > 200000) throw new Error('SQL formatting is limited to 200,000 characters.');
    await ctx.write('formatted.sql', require('sql-formatter').format(source, { language: o.dialect, keywordCase: o.keywordCase, tabWidth: 2 }), true);
  } else if (id === 'code-format') {
    if (source.length > 500000) throw new Error('Code formatting is limited to 500,000 characters.');
    const result = await require('prettier').format(source, { parser: o.parser, tabWidth: o.tabWidth, printWidth: o.printWidth });
    await ctx.write(`formatted.${{ html: 'html', css: 'css', babel: 'js', typescript: 'ts', json: 'json', markdown: 'md' }[o.parser]}`, result, true);
  } else if (id === 'css-minify') {
    if (source.length > 500000) throw new Error('CSS minification is limited to 500,000 characters.');
    const result = new (require('clean-css'))({ level: 1, inline: ['none'], rebase: false }).minify(source);
    if (result.errors.length) throw new Error(result.errors.join('; '));
    await ctx.write('minified.css', result.styles, true); await ctx.json('minification-report.json', { inputBytes: Buffer.byteLength(source), outputBytes: Buffer.byteLength(result.styles), warnings: result.warnings });
  } else if (id === 'javascript-minify') {
    if (source.length > 500000) throw new Error('JavaScript minification is limited to 500,000 characters.');
    const result = await require('terser').minify(source, { mangle: o.mangle === 'yes', compress: { passes: 1 }, format: { comments: false } });
    await ctx.write('minified.js', result.code || '', true); await ctx.json('minification-report.json', { inputBytes: Buffer.byteLength(source), outputBytes: Buffer.byteLength(result.code || '') });
  } else if (id === 'url-inspect') {
    let url; try { url = new URL(source.trim()); } catch (_) { throw new Error('Enter a complete URL with a scheme.'); }
    if (url.username || url.password) throw new Error('Remove credentials from the URL before inspecting it.');
    if (o.mode === 'query') { url.search = ''; for (const line of o.query.split(/\r?\n/)) { if (!line.trim()) continue; const index = line.indexOf('='); if (index < 0) throw new Error('Each query row must use key=value.'); url.searchParams.append(line.slice(0, index), line.slice(index + 1)); } }
    await ctx.json('url-details.json', { url: url.href, scheme: url.protocol, hostname: url.hostname, port: url.port, path: url.pathname, fragment: url.hash, query: [...url.searchParams].map(([key, value]) => ({ key, value })) });
    await ctx.write('url.txt', url.href, true);
  } else throw new Error('Unknown developer utility.');
}
module.exports = { developerUtility, queryPointer, flatten, unflatten, regexRun };
