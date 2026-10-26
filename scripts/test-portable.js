'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const exec = promisify(execFile);
const root = path.resolve(__dirname, '..');
const pkg = require('../package.json');
const folder = path.resolve(process.argv[2] || path.join(root, 'dist', `UltraSuperConverter-${pkg.version}-win-x64`));
const exe = path.join(folder, 'UltraSuperConverter.exe');
const dataDir = path.join(folder, 'Data');
let base, enginePid, occupiedPort;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function request(route, method = 'GET', body) {
  const response = await fetch(`${base}${route}`, { method, signal: AbortSignal.timeout(30000), ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
  return { status: response.status, data: await response.json() };
}
async function runTool(toolId, text = '', options = {}, files = []) {
  let response;
  if (files.length) {
    const form = new FormData(); form.append('toolId', toolId); form.append('text', text); form.append('options', JSON.stringify(options));
    for (const file of files) form.append('files', new Blob([file.bytes]), file.name);
    response = await fetch(`${base}/api/toolbox/run`, { method: 'POST', body: form });
  } else response = await fetch(`${base}/api/toolbox/run`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ toolId, text, options }) });
  const value = await response.json(); assert.equal(response.status, 200, `${toolId}: ${JSON.stringify(value)}`); assert.ok(value.results.length);
  return value.results;
}
async function bytes(result) { const response = await fetch(`${base}${result.url}`); assert.equal(response.status, 200); return Buffer.from(await response.arrayBuffer()); }
async function main() {
  if (process.platform !== 'win32') throw new Error('Run this packaged EXE smoke test on Windows.');
  assert.ok(folder.startsWith(path.join(root, 'dist') + path.sep), 'Smoke-test only a fresh build under dist.');
  await fs.access(exe);
  await assert.rejects(fs.access(dataDir), { code: 'ENOENT' }, 'Use a fresh build without an existing Data folder.');
  occupiedPort = http.createServer((req, res) => { res.setHeader('Content-Type', 'application/json'); res.end('{"engine":{"name":"unrelated local app"}}'); });
  await new Promise(resolve => occupiedPort.listen(0, '127.0.0.1', resolve)); const port = occupiedPort.address().port;
  // PATH intentionally excludes Node/npm/Git: only the bundled runtime may be used.
  const env = { ...process.env, PATH: path.join(process.env.SystemRoot, 'System32') };
  await exec(exe, ['--no-browser', '--port', String(port)], { cwd: path.dirname(root), env, windowsHide: true, timeout: 60000 });
  const info = JSON.parse(await fs.readFile(path.join(dataDir, 'portable-runtime.json'), 'utf8'));
  enginePid = info.pid; base = `http://127.0.0.1:${info.port}`;
  assert.ok(info.port > port && info.port <= port + 20, 'An unrelated app on the requested port must be left alone.');
  await new Promise(resolve => occupiedPort.close(resolve)); occupiedPort = undefined;
  const state = (await request('/api/state')).data; assert.equal(state.engine.portable, true); assert.ok(state.engine.ffmpegReady); assert.equal(state.engine.pid, enginePid);
  console.log('PASS: launcher, bundled Node, isolated portable data, loopback API');
  await exec(exe, ['--no-browser'], { cwd: path.dirname(root), env, windowsHide: true, timeout: 15000 });
  assert.equal((await request('/api/state')).data.engine.pid, enginePid);
  console.log('PASS: second launch reuses the same engine');
  for (const page of ['/', '/tools.html', '/workspace.html']) assert.equal((await fetch(base + page)).status, 200);
  assert.equal((await request('/api/update/check')).data.portable, true);
  assert.equal((await request('/api/update/apply', 'POST')).status, 409);
  assert.equal((await request('/api/wizard/context-menu', 'POST')).status, 409);
  console.log('PASS: pages load, portable setup and source-update guards');
  assert.match((await bytes((await runTool('text-case', 'Portable works', { mode: 'upper' }))[0])).toString(), /PORTABLE WORKS/);
  await runTool('regex-lab', 'one two', { pattern: '\\w+', flags: 'g', mode: 'match' });
  await runTool('code-format', 'const result={ok:true}', { parser: 'babel' });
  const qr = (await runTool('qr-generate', 'Portable native engines', { size: 128, correction: 'M' })).find(r => r.name.endsWith('.png'));
  const png = await bytes(qr);
  const pdf = (await runTool('images-pdf', '', { paper: 'image' }, [{ name: 'qr.png', bytes: png }]))[0];
  await runTool('pdf-render', '', { pages: '1', dpi: 72, format: 'png' }, [{ name: 'sample.pdf', bytes: await bytes(pdf) }]);
  console.log('PASS: text, regex worker, code formatter, QR, Sharp/PDF rendering and native canvas');
  const audio = Buffer.alloc(44 + 8000 * 2); audio.write('RIFF'); audio.writeUInt32LE(audio.length - 8, 4); audio.write('WAVEfmt ', 8); audio.writeUInt32LE(16, 16); audio.writeUInt16LE(1, 20); audio.writeUInt16LE(1, 22); audio.writeUInt32LE(8000, 24); audio.writeUInt32LE(16000, 28); audio.writeUInt16LE(2, 32); audio.writeUInt16LE(16, 34); audio.write('data', 36); audio.writeUInt32LE(audio.length - 44, 40);
  const faded = await runTool('audio-fade', '', { fadeIn: 0.1, fadeOut: 0.1 }, [{ name: 'sample.wav', bytes: audio }]); assert.ok((await bytes(faded[0])).length > 44);
  console.log('PASS: bundled FFmpeg and FFprobe audio processing');
  const queued = await request('/api/workspace/jobs', 'POST', { recipe: { name: 'Portable smoke test', steps: [{ toolId: 'text-case', options: { mode: 'upper' } }] }, text: 'background worker', assetIds: [] });
  assert.equal(queued.status, 202, JSON.stringify(queued.data));
  let job;
  for (let i = 0; i < 150; i++) { job = (await request(`/api/workspace/jobs/${queued.data.id}`)).data; if (['completed', 'failed'].includes(job.status)) break; await pause(100); }
  assert.equal(job.status, 'completed', JSON.stringify(job));
  console.log('PASS: forked background worker and saved job history');
  await request('/api/shutdown', 'POST');
  for (let i = 0; i < 50; i++) { try { process.kill(enginePid, 0); await pause(100); } catch { enginePid = undefined; break; } }
  assert.equal(enginePid, undefined, 'Portable engine must shut down cleanly.');
  // This test created Data in a freshly built folder; it was never included in the ZIP.
  await fs.rm(dataDir, { recursive: true });
  console.log('All portable smoke checks passed. Build folder restored to a clean first-run state.');
}
main().catch(async error => {
  console.error(error);
  try { if (base) await fetch(`${base}/api/shutdown`, { method: 'POST' }); } catch { }
  occupiedPort?.close();
  console.error(`Diagnostic files retained in ${dataDir}`);
  process.exitCode = 1;
});
