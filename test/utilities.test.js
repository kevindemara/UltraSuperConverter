'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const sharp = require('sharp');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { runTool } = require('../lib/toolbox');
const core = require('../public/text-core');
let root;
const fixtures = {};
async function run(id, text = '', options = {}, files = []) { const workDir = path.join(root, crypto.randomUUID()); await fs.mkdir(workDir); return runTool({ toolId: id, text, options, files: files.map(name => ({ path: fixtures[name], originalname: name })), workDir }); }
async function read(results, name) { const entry = name ? results.find(r => r.name === name) : results[0]; assert.ok(entry, `Output missing: ${name}`); return fs.readFile(entry.path, 'utf8'); }
async function json(results, name) { return JSON.parse(await read(results, name)); }
before(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'usc-utilities-test-'));
  const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica);
  const first = doc.addPage([300, 400]); first.drawText('Hello PDF utility', { x: 25, y: 350, font, size: 18 });
  doc.addPage([300, 400]); const third = doc.addPage([300, 400]); third.drawRectangle({ x: 40, y: 40, width: 100, height: 120, color: rgb(.2, .4, .9) });
  fixtures['sample.pdf'] = path.join(root, 'sample.pdf'); await fs.writeFile(fixtures['sample.pdf'], await doc.save({ useObjectStreams: false }));
  const scan = await PDFDocument.create(); const image = await scan.embedPng(await sharp(crypto.randomBytes(600 * 800 * 3), { raw: { width: 600, height: 800, channels: 3 } }).png().toBuffer()); scan.addPage([300, 400]).drawImage(image, { x: 0, y: 0, width: 300, height: 400 });
  fixtures['scan.pdf'] = path.join(root, 'scan.pdf'); await fs.writeFile(fixtures['scan.pdf'], await scan.save());
  fixtures['binary.bin'] = path.join(root, 'binary.bin'); await fs.writeFile(fixtures['binary.bin'], Buffer.from([0, 1, 2, 255, 200, 0, 127]));
  fixtures['certificate.pem'] = path.join(__dirname, 'fixtures', 'public-test-cert.pem');
  fixtures['certificate.der'] = path.join(root, 'certificate.der'); await fs.writeFile(fixtures['certificate.der'], new crypto.X509Certificate(await fs.readFile(fixtures['certificate.pem'])).raw);
});
after(async () => { if (root) await fs.rm(root, { recursive: true, force: true }); });

test('61 Case formatting handles uppercase, lowercase, words, sentences and Unicode', async () => {
  assert.equal(await read(await run('text-case', 'Hello café', { mode: 'upper' })), 'HELLO CAFÉ');
  assert.equal(await read(await run('text-case', 'HELLO CAFÉ', { mode: 'lower' })), 'hello café');
  assert.equal(await read(await run('text-case', 'hello WORLD', { mode: 'capitalize' })), 'Hello World');
  assert.equal(await read(await run('text-case', 'hELLO WORLD. nEXT LINE!', { mode: 'sentence' })), 'Hello world. Next line!');
  assert.equal(core.caseFormat('Ab cD', 'toggle'), 'aB Cd'); assert.equal(core.caseFormat('abcd', 'alternating'), 'aBcD');
  assert.equal(core.caseFormat('the war and the peace', 'title'), 'The War and the Peace');
});
test('62 Counts distinguish visible emoji clusters, code points, bytes and words', async () => {
  const stats = await json(await run('text-count', 'Hello world!\n\nCafé 👩‍💻')); assert.equal(stats.words, 3); assert.equal(stats.lines, 3); assert.equal(stats.paragraphs, 2); assert.ok(stats.characters < stats.codePoints); assert.ok(stats.utf8Bytes > stats.utf16Units);
  assert.equal((await json(await run('text-count', ''))).words, 0); assert.equal(core.stats('👩‍💻').characters, 1);
});
test('63 Pasted text cleanup normalizes CRLF, spaces and blank lines', async () => {
  const out = await read(await run('text-clean', '  Hello   world \r\n\r\n\r\n Next\u200B ', { blank: 'single', invisible: 'yes' })); assert.equal(out, 'Hello world\n\nNext');
});
test('64 Natural and length sorting use the requested direction', async () => {
  assert.equal(await read(await run('text-sort', 'item10\nitem2\nitem1', { mode: 'natural' })), 'item1\nitem2\nitem10');
  assert.equal(await read(await run('text-sort', 'a\nabc\nab', { mode: 'length', order: 'desc' })), 'abc\nab\na');
});
test('65 Deduplication keeps the correct occurrence and reports removals', async () => {
  const out = await run('text-dedupe', 'A\nb\na\nA', { keep: 'last', ignoreCase: 'yes' }); assert.equal(await read(out, 'result.txt'), 'b\nA'); assert.equal((await json(out, 'deduplication-report.json')).removedLines, 2);
});
test('66 Literal replacement does not interpret regex or replacement tokens', async () => {
  const out = await run('text-replace', 'a.b A.B', { find: 'a.b', replacement: '$&\nX', ignoreCase: 'yes' }); assert.equal(await read(out, 'result.txt'), '$&\nX $&\nX'); assert.equal((await json(out, 'replacement-report.json')).replacements, 2);
});
test('67 Regex worker returns groups, handles zero-width Unicode matches and replacement', async () => {
  const matches = await json(await run('regex-lab', 'A12 B34', { pattern: '(?<letter>[A-Z])(\\d+)', flags: 'g' })); assert.equal(matches.matches[1].groups[1], '34'); assert.equal(matches.matches[0].namedGroups.letter, 'A');
  assert.equal(await read(await run('regex-lab', 'A12', { pattern: '(\\d+)', flags: 'g', mode: 'replace', replacement: '[$1]' })), 'A[12]');
  const empty = await json(await run('regex-lab', '🦊', { pattern: '(?:)', flags: 'gu' })); assert.equal(empty.matches.length, 2);
});
test('68 Text diffs report changes and escape HTML in exported comparisons', async () => {
  const out = await run('text-diff', 'Hello <script>x</script>\n', { other: 'Hello studio\n', mode: 'words' }); const report = await json(out, 'text-diff.json'); assert.equal(report.identical, false); assert.ok(report.chunks.some(c => c.type === 'added')); assert.match(await read(out, 'text-diff.html'), /(?:&lt;|&#x3C;)script/); assert.doesNotMatch(await read(out, 'text-diff.html'), /<script>/);
});
test('69 Slugs normalize accents and optionally retain non-Latin letters', async () => {
  assert.equal(await read(await run('text-slug', ' Café & Tea! ')), 'cafe-tea'); assert.equal(await read(await run('text-slug', '你好 世界', { unicode: 'yes', separator: '_' })), '你好_世界');
});
test('70 Identifier styles split acronyms and word boundaries', async () => {
  assert.equal(await read(await run('identifier-case', 'HTTPResponseCode', { mode: 'snake' })), 'http_response_code'); assert.equal(await read(await run('identifier-case', 'user name', { mode: 'camel' })), 'userName'); assert.equal(await read(await run('identifier-case', 'user name', { mode: 'constant' })), 'USER_NAME');
});
test('71 Reversal keeps emoji graphemes intact', async () => { assert.equal(await read(await run('text-reverse', 'A👩‍💻B')), 'B👩‍💻A'); assert.equal(await read(await run('text-reverse', 'one two three', { mode: 'words' })), 'three two one'); });
test('72 Line numbering respects blank lines, padding and custom affixes', async () => { assert.equal(await read(await run('text-number', 'A\n\nB', { start: 7, padding: 3, prefix: '[', separator: '] ', suffix: '!' })), '[007] A!\n\n[008] B!'); });
test('73 Reflow wraps paragraphs without losing words', async () => { assert.equal(await read(await run('text-wrap', 'one two\nthree four five\n\nnext paragraph', { width: 12 })), 'one two\nthree four\nfive\n\nnext\nparagraph'); });
test('74 Truncation budgets visible characters including the suffix', async () => { const out = await read(await run('text-truncate', 'Hello beautiful world', { length: 10 })); assert.equal(out, 'Hello…'); assert.ok(core.graphemes(out).length <= 10); });
test('75 Unicode normalization composes accents and strips marks when requested', async () => { assert.equal(await read(await run('unicode-normalize', 'Cafe\u0301'), 'result.txt'), 'Café'); assert.equal(await read(await run('unicode-normalize', 'Café', { strip: 'yes' }), 'result.txt'), 'Cafe'); });
test('76 Extractors return unique emails, URLs and valid IPs without network requests', async () => { const email = await run('text-extract', 'a@example.com a@example.com'); assert.equal((await json(email, 'extracted-values.json')).count, 1); const ips = await run('text-extract', 'IP 192.168.1.1. Invalid 999.1.1.1 IPv6 ::1', { kind: 'ip' }); assert.deepEqual((await json(ips, 'extracted-values.json')).values, ['192.168.1.1', '::1']); });
test('77 Frequency counting supports n-grams and custom stop words', async () => { const out = await json(await run('word-frequency', 'Red blue red blue green', { ngram: 2, stopWords: 'green' })); assert.deepEqual(out.results[0], { text: 'red blue', count: 2 }); });
test('78 UTF-8 byte codecs round-trip Unicode in hex, binary and decimal', async () => { for (const base of ['hex', 'binary', 'decimal']) { const encoded = await read(await run('text-bytes', 'Café 🦊', { base })); assert.equal(await read(await run('text-bytes', encoded, { base, mode: 'decode' })), 'Café 🦊'); } await assert.rejects(run('text-bytes', 'ff', { mode: 'decode' }), /valid UTF-8/); });
test('79 Morse encodes and decodes supported text', async () => { const encoded = await read(await run('morse-code', 'SOS HELLO 123')); assert.match(encoded, /^\.\.\. --- \.\.\./); assert.equal(await read(await run('morse-code', encoded, { mode: 'decode' })), 'SOS HELLO 123'); });
test('80 ROT13 is reversible and Caesar supports negative shifts', async () => { const encoded = await read(await run('caesar-cipher', 'Hello World!')); assert.equal(encoded, 'Uryyb Jbeyq!'); assert.equal(await read(await run('caesar-cipher', encoded)), 'Hello World!'); assert.equal(await read(await run('caesar-cipher', 'Abc', { shift: -1 })), 'Zab'); });
test('81 JSON diff ignores object key order and reports pointer paths', async () => { assert.equal((await json(await run('json-diff', '{"a":1,"b":2}', { other: '{"b":2,"a":1}' }))).identical, true); const report = await json(await run('json-diff', '{"a/b":1}', { other: '{"a/b":2,"new":true}' })); assert.equal(report.changes[0].path, '/a~1b'); assert.equal(report.changes[1].type, 'added'); });
test('82 JSON Pointer handles escaped keys and rejects nonexistent array keys', async () => { assert.equal(await json(await run('json-pointer', '{"a/b":{"~key":[42]}}', { pointer: '/a~1b/~0key/0' })), 42); await assert.rejects(run('json-pointer', '[1]', { pointer: '/01' }), /does not exist/); });
test('83 Flatten/unflatten preserves empty containers, numeric keys and prototype-named keys', async () => { const source = '{"__proto__":{"polluted":true},"0":"zero","arr":[null,{},[]]}'; const flattened = await read(await run('json-flatten', source)); const restored = await json(await run('json-flatten', flattened, { mode: 'unflatten' })); assert.deepEqual(restored, JSON.parse(source)); assert.equal({}.polluted, undefined); });
test('84 JSON Lines round-trips arrays and locates invalid lines', async () => { const source = '[{"a":1},{"b":"two"}]', encoded = await read(await run('json-lines', source)); assert.deepEqual(await json(await run('json-lines', encoded, { mode: 'decode' })), JSON.parse(source)); await assert.rejects(run('json-lines', '{}\ninvalid', { mode: 'decode' }), /line 2/); });
test('85 CSV query selects, filters and naturally sorts quoted tables', async () => { const out = await run('csv-query', 'Name,Team,Score\n"Ada, A",Blue,98\nLin,Green,95\nSam,Blue,90', { columns: 'Score|Name', filterColumn: 'Team', contains: 'Blue', sortColumn: 'Score' }); assert.equal(await read(out, 'filtered.csv'), 'Score,Name\n90,Sam\n98,"Ada, A"\n'); });
test('86 SQL formatting honors dialect and keyword case', async () => { const out = await read(await run('sql-format', 'select name from users where id=1;', { dialect: 'postgresql' })); assert.match(out, /SELECT/); assert.match(out, /\nFROM/); });
test('87 Code formatter supports HTML, TypeScript and JSON without execution', async () => { assert.match(await read(await run('code-format', '<main><p>Hello</p></main>')), /<main>/); assert.match(await read(await run('code-format', 'const n:number=1', { parser: 'typescript' })), /const n: number = 1;/); assert.equal(await read(await run('code-format', '{"x":1}', { parser: 'json' })), '{ "x": 1 }\n'); });
test('88 CSS minifier emits smaller code and a consistent byte report', async () => { const source = 'body { color: #ffffff; margin: 0px 0px 0px 0px; }', out = await run('css-minify', source); assert.ok((await read(out, 'minified.css')).length < source.length); assert.equal((await json(out, 'minification-report.json')).inputBytes, Buffer.byteLength(source)); });
test('89 JavaScript minifier compresses source without executing it', async () => { const source = 'function greet(name) { const message = "Hello " + name; return message; }', out = await run('javascript-minify', source); assert.ok((await read(out, 'minified.js')).length < source.length); });
test('90 URL parsing and query editing retain duplicate keys and encode values', async () => { const out = await run('url-inspect', 'https://example.com/path?old=1#section', { mode: 'query', query: 'q=hello world\nq=a=b' }); const data = await json(out, 'url-details.json'); assert.equal(data.query.length, 2); assert.equal(data.query[1].value, 'a=b'); assert.match(data.url, /hello\+world/); assert.equal(data.fragment, '#section'); });
test('91 JWT inspection marks decoded claims as unverified', async () => { const enc = value => Buffer.from(JSON.stringify(value)).toString('base64url'), token = `${enc({ alg: 'HS256' })}.${enc({ sub: 'Ada', exp: 1 })}.c2ln`; const out = await json(await run('jwt-inspect', token)); assert.equal(out.signatureVerified, false); assert.equal(out.expiredByUntrustedClaim, true); assert.equal(out.payload.sub, 'Ada'); });
test('92 Text hashes match published hello vectors and independent crypto results', async () => { const data = await json(await run('text-hash', 'hello')); assert.equal(data.hashes.md5, '5d41402abc4b2a76b9719d911017c592'); assert.equal(data.hashes.sha256, '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'); assert.equal(data.hashes['sha3-256'], crypto.createHash('sha3-256').update('hello').digest('hex')); });
test('93 HMAC generates and verifies without writing the key', async () => { const expected = crypto.createHmac('sha256', 'secret').update('message').digest('hex'), out = await json(await run('hmac', 'message', { key: 'secret', expected })); assert.equal(out.verified, true); assert.equal(out.digest, expected); assert.equal(out.key, undefined); });
test('94 AES-GCM round-trips binary bytes and rejects wrong passwords and tampering', async () => {
  const encrypted = await run('aes-encrypt', '', { password: 'long test password' }, ['binary.bin']); fixtures['encrypted.json'] = encrypted[0].path;
  const decrypted = await run('aes-encrypt', '', { mode: 'decrypt', password: 'long test password' }, ['encrypted.json']); assert.deepEqual(await fs.readFile(decrypted[0].path), await fs.readFile(fixtures['binary.bin']));
  await assert.rejects(run('aes-encrypt', '', { mode: 'decrypt', password: 'wrong password' }, ['encrypted.json']), /incorrect|changed/);
  const envelope = JSON.parse(await read(encrypted)); envelope.name = 'tampered.bin'; fixtures['tampered.json'] = path.join(root, 'tampered.json'); await fs.writeFile(fixtures['tampered.json'], JSON.stringify(envelope)); await assert.rejects(run('aes-encrypt', '', { mode: 'decrypt', password: 'long test password' }, ['tampered.json']), /incorrect|changed/);
  const encodedText = await read(await run('aes-encrypt', 'Private text\nCafé', { password: 'long test password' })); assert.ok(!encodedText.includes('Private text'));
  const restoredText = await run('aes-encrypt', encodedText, { mode: 'decrypt', password: 'long test password' }); assert.equal(restoredText[0].preview, 'Private text\nCafé');
});
test('95 Password generator includes all selected groups and excludes ambiguous characters', async () => { const passwords = (await read(await run('password-generate', '', { count: 10, length: 20 }))).trim().split('\n'); assert.equal(passwords.length, 10); for (const password of passwords) { assert.equal(password.length, 20); assert.match(password, /[A-Z]/); assert.match(password, /[a-z]/); assert.match(password, /[2-9]/); assert.match(password, /[^A-Za-z0-9]/); assert.doesNotMatch(password, /[IlO01]/); } });
test('96 UUID generator creates valid v4 and time-ordered v7 identifiers', async () => { const uuid = require('uuid'); for (const version of ['v4', 'v7']) { const data = await json(await run('uuid-generate', '', { version, count: 4 }), 'uuids.json'); assert.ok(data.values.every(v => uuid.validate(v) && uuid.version(v) === (version === 'v4' ? 4 : 7))); if (version === 'v7') assert.deepEqual(data.values, [...data.values].sort()); } });
test('97 Random tokens decode to the requested byte length', async () => { const values = (await read(await run('token-generate', '', { encoding: 'base64url', bytes: 24, count: 5 }))).trim().split('\n'); assert.equal(new Set(values).size, 5); assert.ok(values.every(v => Buffer.from(v, 'base64url').length === 24)); });
test('98 Scrypt digests verify passwords and reject hostile work parameters', async () => { const digest = await read(await run('scrypt-password', '', { password: 'correct horse' })); assert.equal((await json(await run('scrypt-password', '', { password: 'correct horse', digest }))).verified, true); assert.equal((await json(await run('scrypt-password', '', { password: 'wrong', digest }))).verified, false); const bad = JSON.parse(digest); bad.params.N = 2 ** 30; await assert.rejects(run('scrypt-password', '', { password: 'x', digest: JSON.stringify(bad) }), /Unsupported/); });
test('99 Bcrypt verifies digests and rejects silent 72-byte truncation', async () => { const digest = (await json(await run('bcrypt-password', '', { password: 'correct horse', cost: 8 }))).digest; assert.equal((await json(await run('bcrypt-password', '', { password: 'correct horse', digest }))).verified, true); assert.equal((await json(await run('bcrypt-password', '', { password: 'wrong', digest }))).verified, false); await assert.rejects(run('bcrypt-password', '', { password: 'é'.repeat(37) }), /72/); });
test('100 Certificate inspection supports PEM and DER and avoids trust claims', async () => { for (const file of ['certificate.pem', 'certificate.der']) { const info = await json(await run('certificate-inspect', '', {}, [file])); assert.match(info.subject, /ultrasuperconvertor\.test/); assert.equal(info.trustChainVerified, false); assert.equal(info.publicKeyType, 'rsa'); assert.equal(info.fingerprintSHA256.split(':').length, 32); } });
test('101 PDF compression preserves text in structure mode and reduces a real noisy scan', async () => {
  const structured = await run('pdf-compress', '', {}, ['sample.pdf']), report = await json(structured, 'compression-report.json'); assert.ok(report.outputBytes <= report.inputBytes); assert.equal(report.savedBytes, report.inputBytes - report.outputBytes);
  fixtures['compressed.pdf'] = structured[0].path; const text = await runTool({ toolId: 'pdf-text', files: [{ path: fixtures['compressed.pdf'], originalname: 'compressed.pdf' }], options: {}, workDir: await fs.mkdtemp(path.join(root, 'extract-')) }); assert.match(await read(text, 'extracted.txt'), /Hello PDF utility/);
  const scan = await run('pdf-compress', '', { mode: 'raster', dpi: 72, quality: 40 }, ['scan.pdf']); const scanReport = await json(scan, 'compression-report.json'); assert.ok(scanReport.savedPercent > 30); assert.equal(scanReport.rasterized, true);
});
test('102 Blank-page removal retains original nonblank pages and reports decisions', async () => { const out = await run('pdf-blank', '', {}, ['sample.pdf']), doc = await PDFDocument.load(await fs.readFile(out[0].path)); assert.equal(doc.getPageCount(), 2); assert.equal((await json(out, 'blank-page-report.json')).pages[1].blank, true); });
test('103 Paper-size conversion produces correctly sized pages', async () => { const out = await run('pdf-resize', '', { paper: 'letter', orientation: 'landscape' }, ['sample.pdf']); const doc = await PDFDocument.load(await fs.readFile(out[0].path)); assert.equal(doc.getPageCount(), 3); assert.equal(doc.getPage(0).getWidth(), 792); assert.equal(doc.getPage(0).getHeight(), 612); });
test('104 Grayscale PDF output retains page geometry and renders without color', async () => { const out = await run('pdf-grayscale', '', { dpi: 72 }, ['sample.pdf']); fixtures['gray.pdf'] = out[0].path; const rendered = await runTool({ toolId: 'pdf-render', files: [{ path: out[0].path, originalname: 'gray.pdf' }], options: { pages: '3', dpi: 72 }, workDir: await fs.mkdtemp(path.join(root, 'gray-render-')) }); const { data, info } = await sharp(rendered[0].path).removeAlpha().raw().toBuffer({ resolveWithObject: true }); let maxDifference = 0; for (let i = 0; i < data.length; i += info.channels) maxDifference = Math.max(maxDifference, Math.abs(data[i] - data[i + 1]), Math.abs(data[i] - data[i + 2])); assert.ok(maxDifference <= 2); });
test('105 QR generation creates PNG and SVG with a complete quiet border', async () => { const out = await run('qr-generate', 'https://example.com/local?x=1', { size: 512 }); fixtures['qr.png'] = out[0].path; assert.equal((await sharp(out[0].path).metadata()).width, 512); assert.match(await read(out, 'qr-code.svg'), /<svg/); });
test('106 QR reader restores the encoded payload without opening it', async () => { const out = await run('qr-decode', '', {}, ['qr.png']); assert.equal(await read(out, 'decoded-qr.txt'), 'https://example.com/local?x=1'); });
test('107 Color conversion matches RGB/HSL/CMYK known colors', async () => { const red = await json(await run('color-convert', 'hsl(0,100%,50%)')); assert.equal(red.hex, '#ff0000'); assert.deepEqual(red.rgb, { r: 255, g: 0, b: 0 }); assert.equal(red.cmyk.m, 100); assert.equal((await json(await run('color-convert', '#fff'))).hex, '#ffffff'); await assert.rejects(run('color-convert', 'rgb(300,0,0)'), /range/); });
test('108 Contrast checker calculates 21:1 for black/white and fails identical colors', async () => { const pass = await json(await run('contrast-check', '', { foreground: '#000', background: '#fff' })); assert.equal(pass.ratio, 21); assert.equal(pass.normalTextAAA, true); const fail = await json(await run('contrast-check', '', { foreground: '#888', background: '#888' })); assert.equal(fail.ratio, 1); assert.equal(fail.largeTextAA, false); });
test('109 Units cover exact physical, binary storage and temperature conversions', async () => { assert.equal((await json(await run('unit-convert', '1', { from: 'ft', to: 'in' }))).result, 12); assert.equal((await json(await run('unit-convert', '1', { from: 'MiB', to: 'B' }))).result, 1048576); assert.ok(Math.abs((await json(await run('unit-convert', '32', { from: 'F', to: 'C' }))).result) < 1e-8); await assert.rejects(run('unit-convert', '1', { from: 'kg', to: 'm' }), /same measurement/); });
test('110 Timestamp conversion handles Unix seconds, milliseconds, offsets and calendar validation', async () => { const time = await json(await run('timestamp-convert', '1704067200')); assert.equal(time.isoUTC, '2024-01-01T00:00:00.000Z'); const iso = await json(await run('timestamp-convert', '2024-01-01T00:00:00-05:00', { mode: 'iso', timeZone: 'UTC' })); assert.equal(iso.isoUTC, '2024-01-01T05:00:00.000Z'); await assert.rejects(run('timestamp-convert', '2024-02-30T00:00:00Z', { mode: 'iso' }), /invalid calendar/); });
test('Regex deadlines terminate catastrophic patterns without blocking later utilities', async () => {
  await assert.rejects(run('regex-lab', 'a'.repeat(10000) + '!', { pattern: '(a+)+$', flags: '' }), /two-second deadline/);
  assert.equal((await json(await run('text-hash', 'hello', { algorithm: 'md5' }))).hashes.md5, '5d41402abc4b2a76b9719d911017c592');
});
test('Utility inputs reject invalid byte codes, pointers, colors, offsets and hostile envelope parameters', async () => {
  await assert.rejects(run('text-bytes', '999', { mode: 'decode', base: 'decimal' }), /byte values/);
  await assert.rejects(run('json-pointer', '{}', { pointer: '/bad~9escape' }), /valid JSON Pointer/);
  await assert.rejects(run('json-flatten', '{"format":"usc-flat-json","version":1,"containers":{"":"array"},"values":{"/99999999":1}}', { mode: 'unflatten' }), /array index/);
  await assert.rejects(run('color-convert', '#ff000080'), /Use #RGB/);
  await assert.rejects(run('timestamp-convert', '2024-01-01T00:00:00', { mode: 'iso' }), /explicit offset/);
  await assert.rejects(run('text-case', 'x'.repeat(1000001)), /limited to 1 MB/);
});
test('Diffs can normalize Windows line endings or compare them explicitly', async () => {
  assert.equal((await json(await run('text-diff', 'same\r\nline\r\n', { other: 'same\nline\n' }), 'text-diff.json')).identical, true);
  assert.equal((await json(await run('text-diff', 'same\r\n', { other: 'same\n', normalizeNewlines: 'no' }), 'text-diff.json')).identical, false);
});
