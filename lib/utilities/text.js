'use strict';
const core = require('../../public/text-core');
const he = require('he');
const net = require('node:net');
const MORSE = Object.fromEntries('A .-;B -...;C -.-.;D -..;E .;F ..-.;G --.;H ....;I ..;J .---;K -.-;L .-..;M --;N -.;O ---;P .--.;Q --.-;R .-.;S ...;T -;U ..-;V ...-;W .--;X -..-;Y -.--;Z --..;0 -----;1 .----;2 ..---;3 ...--;4 ....-;5 .....;6 -....;7 --...;8 ---..;9 ----.;. .-.-.-;, --..--;? ..--..;! -.-.--;/ -..-.;( -.--.;) -.--.-;: ---...;= -...-;+ .-.-.;- -....-;_ ..--.-;" .-..-.;@ .--.-.;\' .----.'.split(';').map(row => { const index = row.indexOf(' '); return [row.slice(0, index), row.slice(index + 1)]; }));
const DECODE_MORSE = Object.fromEntries(Object.entries(MORSE).map(([key, value]) => [value, key]));
const lines = text => text.replace(/\r\n?/g, '\n').split('\n');
const escapeRegex = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

async function textUtility(ctx) {
  const source = await ctx.source(), o = ctx.options, id = ctx.toolId;
  let output = '';
  if (id === 'text-case') output = core.caseFormat(source, o.mode);
  else if (id === 'text-count') { const values = core.stats(source, o.readingWPM, o.speakingWPM); await ctx.json('text-statistics.json', values, { view: { type: 'stats', values } }); return; }
  else if (id === 'text-clean') {
    output = lines(source).map(line => { let value = line.trim(); if (o.collapse === 'yes') value = value.replace(/[^\S\n]+/gu, ' '); if (o.invisible === 'yes') value = value.replace(/[\u200B-\u200D\u2060\uFEFF]/g, ''); return value; }).join('\n');
    if (o.blank === 'single') output = output.replace(/\n{3,}/g, '\n\n');
    if (o.blank === 'remove') output = output.split('\n').filter(line => line.trim()).join('\n');
  } else if (id === 'text-sort') {
    const input = lines(source), sign = o.order === 'desc' ? -1 : 1;
    const collator = new Intl.Collator('en', { numeric: o.mode === 'natural', sensitivity: o.caseSensitive === 'yes' ? 'variant' : 'base' });
    input.sort((a, b) => sign * (o.mode === 'length' ? core.graphemes(a).length - core.graphemes(b).length : collator.compare(a, b))); output = input.join('\n');
  } else if (id === 'text-dedupe') {
    const input = lines(source), seen = new Set(), kept = [];
    for (const line of o.keep === 'last' ? input.reverse() : input) { let key = o.trim === 'yes' ? line.trim() : line; if (o.ignoreCase === 'yes') key = key.toLocaleLowerCase('en'); if (!seen.has(key)) { seen.add(key); kept.push(line); } }
    output = (o.keep === 'last' ? kept.reverse() : kept).join('\n');
    await ctx.json('deduplication-report.json', { inputLines: input.length, outputLines: kept.length, removedLines: input.length - kept.length });
  } else if (id === 'text-replace') {
    if (!o.find) throw new Error('Enter literal text to find.'); let count = 0;
    output = source.replace(new RegExp(escapeRegex(o.find), o.ignoreCase === 'yes' ? 'giu' : 'gu'), () => { count++; return o.replacement; });
    await ctx.json('replacement-report.json', { replacements: count });
  } else if (id === 'text-diff') {
    if (source.length + o.other.length > 100000) throw new Error('Diff comparisons are limited to 100,000 total characters.');
    const diff = require('diff'), method = { lines: diff.diffLines, words: diff.diffWordsWithSpace, characters: diff.diffChars }[o.mode];
    const before = o.normalizeNewlines === 'yes' ? source.replace(/\r\n?/g, '\n') : source;
    const after = o.normalizeNewlines === 'yes' ? o.other.replace(/\r\n?/g, '\n') : o.other;
    const chunks = method(before, after, { ignoreCase: o.ignoreCase === 'yes', timeout: 1200, maxEditLength: 10000 });
    if (!chunks) throw new Error('The comparison is too complex. Compare smaller sections.');
    const report = { mode: o.mode, identical: chunks.every(c => !c.added && !c.removed), added: chunks.filter(c => c.added).reduce((n, c) => n + c.count, 0), removed: chunks.filter(c => c.removed).reduce((n, c) => n + c.count, 0), chunks: chunks.map(c => ({ type: c.added ? 'added' : c.removed ? 'removed' : 'unchanged', text: c.value, count: c.count })) };
    await ctx.json('text-diff.json', report, { view: { type: 'diff', ...report } });
    const markup = report.chunks.map(c => `<${c.type === 'added' ? 'ins' : c.type === 'removed' ? 'del' : 'span'}>${he.encode(c.text)}</${c.type === 'added' ? 'ins' : c.type === 'removed' ? 'del' : 'span'}>`).join('');
    await ctx.write('text-diff.html', `<!doctype html><meta charset="utf-8"><title>Text comparison</title><style>body{max-width:1000px;margin:40px auto;padding:20px;font:16px/1.7 system-ui}pre{white-space:pre-wrap;overflow-wrap:anywhere}ins{background:#dcfce7;color:#14532d;text-decoration:none}del{background:#ffe4e6;color:#881337}</style><h1>Text comparison</h1><p>Added: ${report.added}; removed: ${report.removed} (${o.mode}).</p><pre>${markup}</pre>`); return;
  } else if (id === 'text-slug') {
    output = source.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('en').trim();
    output = output.replace(o.unicode === 'yes' ? /[^\p{L}\p{N}]+/gu : /[^a-z0-9]+/g, o.separator).replace(/^[-_]+|[-_]+$/g, '');
  } else if (id === 'identifier-case') {
    const tokens = source.replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, '$1 $2').replace(/(\p{Ll}|\p{N})(\p{Lu})/gu, '$1 $2').match(/[\p{L}\p{N}]+/gu) || [];
    const lower = tokens.map(s => s.toLocaleLowerCase('en')), cap = s => s.replace(/^\p{L}/u, c => c.toLocaleUpperCase('en'));
    output = o.mode === 'camel' ? lower.map((s, i) => i ? cap(s) : s).join('') : o.mode === 'pascal' ? lower.map(cap).join('') : lower.join({ snake: '_', kebab: '-', dot: '.', constant: '_' }[o.mode]);
    if (o.mode === 'constant') output = output.toLocaleUpperCase('en');
  } else if (id === 'text-reverse') output = o.mode === 'characters' ? core.graphemes(source).reverse().join('') : o.mode === 'lines' ? lines(source).reverse().join('\n') : source.trim().split(/\s+/u).reverse().join(' ');
  else if (id === 'text-number') { let number = o.start; output = lines(source).map(line => !line.trim() && o.skipBlank === 'yes' ? line : `${o.prefix}${String(number++).padStart(o.padding, '0')}${o.separator}${line}${o.suffix}`).join('\n'); }
  else if (id === 'text-wrap') {
    const wrap = value => {
      const words = value.trim().split(/\s+/u).filter(Boolean), rows = []; let line = '';
      for (let word of words) {
        if (line && core.graphemes(line + ' ' + word).length > o.width) { rows.push(line); line = ''; }
        if (o.breakWords === 'yes') { const chars = core.graphemes(word); while (chars.length > o.width) { rows.push(chars.splice(0, o.width).join('')); } word = chars.join(''); }
        if (word) line = line ? `${line} ${word}` : word;
      }
      if (line) rows.push(line); return rows.join('\n');
    };
    output = (o.mode === 'lines' ? lines(source) : source.replace(/\r\n?/g, '\n').split(/\n\s*\n/)).map(wrap).join(o.mode === 'lines' ? '\n' : '\n\n');
  } else if (id === 'text-truncate') {
    const truncate = value => { const chars = core.graphemes(value); if (chars.length <= o.length) return value; const suffix = core.graphemes(o.suffix).slice(0, o.length).join(''); let kept = chars.slice(0, o.length - core.graphemes(suffix).length).join(''); if (o.wholeWords === 'yes' && kept && !/\s$/u.test(kept) && !/^\s/u.test(chars.slice(core.graphemes(kept).length).join(''))) { const index = kept.search(/\s+\S*$/u); if (index >= 0) kept = kept.slice(0, index); } return kept.trimEnd() + suffix; };
    output = o.scope === 'lines' ? lines(source).map(truncate).join('\n') : truncate(source);
  } else if (id === 'unicode-normalize') {
    output = source.normalize(o.form); if (o.strip === 'yes') output = output.normalize('NFD').replace(/\p{M}/gu, '').normalize(o.form);
    const points = value => [...value].slice(0, 1000).map(c => `U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`);
    await ctx.json('unicode-report.json', { before: points(source), after: points(output), truncatedAt: 1000 });
  } else if (id === 'text-extract') {
    let matches;
    if (o.kind === 'email') matches = source.match(/[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}/g) || [];
    else if (o.kind === 'url') matches = (source.match(/https?:\/\/[^\s<>"']+/gi) || []).map(s => s.replace(/[.,;!?]+$/g, '')).filter(s => { try { new URL(s); return true; } catch (_) { return false; } });
    else matches = (source.match(/[0-9a-fA-F:.]+/g) || []).map(s => s.replace(/\.+$/, '')).filter(s => net.isIP(s));
    if (o.unique === 'yes') matches = [...new Set(matches)];
    await ctx.json('extracted-values.json', { kind: o.kind, count: matches.length, values: matches }); output = matches.join('\n');
  } else if (id === 'word-frequency') {
    const stopped = new Set(core.words(o.stopWords).map(s => s.toLocaleLowerCase('en'))), words = core.words(source).filter(word => !stopped.has(word.toLocaleLowerCase('en'))).map(word => o.ignoreCase === 'yes' ? word.toLocaleLowerCase('en') : word), counts = new Map();
    for (let i = 0; i <= words.length - o.ngram; i++) { const phrase = words.slice(i, i + o.ngram).join(' '); counts.set(phrase, (counts.get(phrase) || 0) + 1); }
    const entries = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, o.limit).map(([text, count]) => ({ text, count }));
    await ctx.json('word-frequency.json', { words: words.length, phraseLength: o.ngram, results: entries }); return;
  } else if (id === 'text-bytes') {
    const base = { hex: 16, binary: 2, decimal: 10 }[o.base];
    if (o.mode === 'encode') output = [...Buffer.from(source)].map(byte => byte.toString(base).padStart(o.base === 'hex' ? 2 : o.base === 'binary' ? 8 : 1, '0')).join(' ');
    else {
      let tokens = source.trim() ? source.trim().split(/\s+/u) : [];
      if (o.base === 'hex' && tokens.length === 1 && /^[0-9a-f]+$/i.test(tokens[0]) && tokens[0].length % 2 === 0) tokens = tokens[0].match(/.{2}/g);
      const pattern = { hex: /^[0-9a-f]{2}$/i, binary: /^[01]{8}$/, decimal: /^\d{1,3}$/ }[o.base];
      if (tokens.some(token => !pattern.test(token) || parseInt(token, base) > 255)) throw new Error('Provide valid byte values between 0 and 255 in the selected base.');
      try { output = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(tokens.map(s => parseInt(s, base)))); } catch (_) { throw new Error('Those bytes do not form valid UTF-8 text.'); }
    }
  } else if (id === 'morse-code') {
    if (o.mode === 'encode') output = source.toUpperCase().trim().split(/\s+/u).map(word => [...word].map(char => { if (!MORSE[char]) throw new Error(`Unsupported Morse character: ${char}`); return MORSE[char]; }).join(' ')).join(' / ');
    else output = source.trim().split(/\s*\/\s*/).map(word => word.trim().split(/\s+/).map(code => { if (!DECODE_MORSE[code]) throw new Error(`Invalid Morse sequence: ${code}`); return DECODE_MORSE[code]; }).join('')).join(' ');
  } else if (id === 'caesar-cipher') output = source.replace(/[a-z]/gi, char => { const start = char <= 'Z' ? 65 : 97; return String.fromCharCode(start + (char.charCodeAt(0) - start + o.shift + 26) % 26); });
  else throw new Error('Unknown text utility.');
  await ctx.write('result.txt', output, true);
}
module.exports = { textUtility, MORSE };
