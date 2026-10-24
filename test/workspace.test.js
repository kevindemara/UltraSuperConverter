'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const express = require('express');
const { promisify } = require('node:util');
const { WorkspaceStore } = require('../lib/workspace-store');
const { walkArchive } = require('../lib/advanced/archive');
const { naming } = require('../public/workspace-utils');
let root, server, router, base;
const recipe = (steps, extra = {}) => ({ name: 'Test recipe', steps: steps.map(step => typeof step === 'string' ? { toolId: step, options: {} } : step), ...extra });
async function request(route, method = 'GET', body) {
  const response = await fetch(`${base}${route}`, { method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
  return { status: response.status, data: await response.json() };
}
async function importAssets(entries) {
  const form = new FormData(); form.append('paths', JSON.stringify(entries.map(e => e.path || e.name))); entries.forEach(entry => form.append('files', new Blob([entry.bytes ?? entry.text]), entry.name));
  const response = await fetch(`${base}/assets`, { method: 'POST', body: form }); assert.equal(response.status, 200); return (await response.json()).assets;
}
async function waitJob(id, desired = ['completed', 'partial', 'failed', 'cancelled', 'interrupted']) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) { const { data } = await request(`/jobs/${id}`); if (desired.includes(data.status)) return data; await new Promise(resolve => setTimeout(resolve, 30)); }
  throw new Error('Job did not reach the expected state.');
}
async function enqueue(recipeValue, assetIds = [], text = '') { const { status, data } = await request('/jobs', 'POST', { recipe: recipeValue, assetIds, text }); assert.equal(status, 202, JSON.stringify(data)); return data; }
before(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'usc-workspace-test-')); router = require('../lib/workspace-routes')(root); const app = express(); app.use(express.json({ limit: '12mb' })); app.use('/api/workspace', router); server = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); }); base = `http://127.0.0.1:${server.address().port}/api/workspace`; });
after(async () => { router?.store.close(); const deadline = Date.now() + 5000; while (router?.store.active && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50)); if (server) await new Promise(resolve => server.close(resolve)); if (root) await fs.rm(root, { recursive: true, force: true }); });

test('31 Background jobs return immediately and report progress through completion', async () => {
  const job = await enqueue(recipe(['json-format']), [], '{"hello":"world"}'); assert.equal(job.status, 'queued');
  const finished = await waitJob(job.id); assert.equal(finished.status, 'completed', finished.error); assert.equal(finished.progress, 100); assert.equal(finished.results.length, 1);
  const file = await fetch(new URL(finished.results[0].url, base)); assert.equal(JSON.parse(await file.text()).hello, 'world');
});
test('32 Running and queued cancellation release the queue and protect active assets', async () => {
  const clip = path.join(root, 'long.mp4');
  await promisify(require('node:child_process').execFile)(require('ffmpeg-static'), ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=160x96:rate=10:duration=20', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', clip], { windowsHide: true });
  const assets = await importAssets([{ name: 'a.mp4', bytes: await fs.readFile(clip) }, { name: 'b.mp4', bytes: await fs.readFile(clip) }]);
  const job = await enqueue(recipe([{ toolId: 'video-join', options: { size: '1280x720', transition: .2 } }]), assets.map(a => a.id)); await waitJob(job.id, ['running']);
  assert.equal((await request(`/assets/${assets[0].id}`, 'DELETE')).status, 400);
  const queued = await enqueue(recipe(['json-format']), [], '{}'); const cancelledQueued = await request(`/jobs/${queued.id}/cancel`, 'POST', {}); assert.equal(cancelledQueued.data.status, 'cancelled');
  await new Promise(resolve => setTimeout(resolve, 250));
  const cancelled = await request(`/jobs/${job.id}/cancel`, 'POST', {}); assert.equal(cancelled.data.status, 'cancelled');
  const next = await enqueue(recipe(['json-format']), [], '{"next":true}'); assert.equal((await waitJob(next.id)).status, 'completed');
  assert.equal(router.store.active?.id === job.id, false);
});
test('33 History/results persist and running jobs recover as interrupted on restart', async () => {
  const isolated = path.join(root, 'persistence'); await fs.mkdir(isolated); const first = new WorkspaceStore(isolated); first.closed = true;
  const id = crypto.randomUUID(); first.state.jobs.push({ id, name: 'Interrupted', status: 'running', assetIds: [], results: [], recipe: recipe(['json-format']), text: '{}', createdAt: new Date().toISOString() }); first.persist(); first.close();
  const resumed = new WorkspaceStore(isolated); resumed.closed = true; assert.equal(resumed.state.jobs[0].status, 'interrupted'); assert.match(resumed.state.jobs[0].error, /server stopped/);
  const complete = router.store.state.jobs.find(j => j.status === 'completed');
  const snapshot = JSON.parse(await fs.readFile(router.store.stateFile, 'utf8')); assert.ok(snapshot.jobs.some(j => j.id === complete.id));
  const retry = await request(`/jobs/${complete.id}/retry`, 'POST', {}); assert.equal(retry.status, 202); assert.notEqual(retry.data.id, complete.id); assert.equal((await waitJob(retry.data.id)).status, 'completed'); resumed.close(); first.close();
});
test('34 Recipe CRUD, export/import and validation preserve the pipeline', async () => {
  const saved = await request('/recipes', 'POST', recipe(['json-format', { toolId: 'json-yaml', options: { direction: 'JSON to YAML' }, select: '*.json' }], { name: 'Reusable' })); assert.equal(saved.status, 200);
  const exported = await (await fetch(`${base}/recipes/${saved.data.id}/export`)).json(); assert.equal(exported.steps.length, 2);
  const renamed = await request(`/recipes/${saved.data.id}`, 'PUT', { ...exported, name: 'Renamed' }); assert.equal(renamed.data.name, 'Renamed');
  const imported = await request('/recipes', 'POST', exported); assert.notEqual(imported.data.id, saved.data.id);
  assert.equal((await request('/recipes', 'POST', recipe(['does-not-exist']))).status, 400);
  await request(`/recipes/${saved.data.id}`, 'DELETE'); assert.ok(!(await request('/state')).data.recipes.some(r => r.id === saved.data.id));
});
test('35 Multistep pipelines consume prior output files and support filename filters', async () => {
  const job = await enqueue(recipe(['json-format', { toolId: 'json-csv', options: { direction: 'JSON to CSV' }, select: '*.json' }, { toolId: 'spreadsheet-convert', options: { mode: 'csv-xlsx' }, select: '*.csv' }]), [], '[{"Name":"Ada","Score":98}]');
  const done = await waitJob(job.id); assert.equal(done.status, 'completed', done.error); assert.equal(done.results[0].name, 'workbook.xlsx');
  const bytes = Buffer.from(await (await fetch(new URL(done.results[0].url, base))).arrayBuffer()); const wb = new (require('exceljs').Workbook)(); await wb.xlsx.load(bytes); assert.equal(wb.worksheets[0].getCell('A2').value, 'Ada');
});
test('36 Batch processing isolates invalid inputs and emits a partial-success report', async () => {
  const assets = await importAssets([{ name: 'good.json', text: '{"ok":true}' }, { name: 'bad.json', text: '{broken}' }]);
  const job = await enqueue(recipe(['json-format'], { batch: true }), assets.map(a => a.id)); const done = await waitJob(job.id);
  assert.equal(done.status, 'partial'); assert.equal(done.results.length, 1); assert.equal(done.batches[1].status, 'failed');
  const report = await (await fetch(`${base}/jobs/${job.id}/report`)).json(); assert.equal(report.batches.length, 2); assert.equal(report.outputs[0].sha256.length, 64);
});
test('37 Asset library stores reusable copies, metadata and content hashes', async () => {
  const [asset] = await importAssets([{ name: 'library.txt', text: 'persistent source' }]); const state = (await request('/state')).data;
  const stored = state.assets.find(a => a.id === asset.id); assert.equal(stored.size, 17); assert.equal(stored.sha256, crypto.createHash('sha256').update('persistent source').digest('hex')); assert.equal(stored.storedName, undefined);
  assert.equal(await (await fetch(`${base}/assets/${asset.id}/download`)).text(), 'persistent source');
  assert.equal((await request(`/assets/${asset.id}`, 'DELETE')).status, 200); assert.ok(!(await request('/state')).data.assets.some(a => a.id === asset.id));
});
test('38 Folder imports preserve relative paths and selection order in job reports', async () => {
  const assets = await importAssets([{ name: 'b.json', path: 'folder/sub/b.json', text: '{"id":2}' }, { name: 'a.json', path: 'folder/a.json', text: '{"id":1}' }]);
  assert.equal(assets[0].relativePath, 'folder/sub/b.json');
  const job = await enqueue(recipe(['json-format'], { batch: true }), assets.map(a => a.id)); const done = await waitJob(job.id); assert.equal(done.status, 'completed');
  const report = await (await fetch(`${base}/jobs/${job.id}/report`)).json(); assert.deepEqual(report.sources.map(a => a.relativePath), ['folder/sub/b.json', 'folder/a.json']);
  const form = new FormData(); form.append('paths', '["../bad.txt"]'); form.append('files', new Blob(['bad']), 'bad.txt'); assert.equal((await fetch(`${base}/assets`, { method: 'POST', body: form })).status, 400);
});
test('39 Naming previews resolve collisions and templates preserve extension and package links', async () => {
  const preview = await request('/naming-preview', 'POST', { names: ['a.png', 'a.png'], template: '{name}' }); assert.deepEqual(preview.data.names, ['a.png', 'a-2.png']);
  assert.throws(() => naming('{unknown}', { name: 'x.png' }), /Unknown/); assert.ok(!naming('../../{source}', { name: 'x.png', source: '../bad' }).includes('/'));
  const image = await require('sharp')({ create: { width: 40, height: 40, channels: 4, background: 'red' } }).png().toBuffer(); const assets = await importAssets([{ name: 'icon.png', bytes: image }]);
  const job = await enqueue(recipe([{ toolId: 'sprite-atlas', options: { columns: 1 } }], { naming: '{source}-{name}-{index}' }), [assets[0].id]); const done = await waitJob(job.id); assert.equal(done.status, 'completed', done.error);
  const css = done.results.find(r => r.name.endsWith('.css')), png = done.results.find(r => r.name.endsWith('.png')); const cssText = await (await fetch(new URL(css.url, base))).text(); assert.ok(cssText.includes(png.name));
});
test('40 ZIP bundles contain final results and a machine-readable report', async () => {
  const job = await enqueue(recipe(['json-format']), [], '{"bundle":true}'); const done = await waitJob(job.id);
  const response = await fetch(`${base}/jobs/${job.id}/zip`); assert.match(response.headers.get('content-disposition'), /attachment/);
  const zip = path.join(root, 'results.zip'); await fs.writeFile(zip, Buffer.from(await response.arrayBuffer())); const names = [];
  await walkArchive(zip, async entry => { names.push(entry.name); }); assert.deepEqual(names.sort(), [done.results[0].name, 'conversion-report.json'].sort());
  assert.equal((await request(`/jobs/${job.id}`, 'DELETE')).status, 200); assert.equal((await request(`/jobs/${job.id}`)).status, 400);
});
test('Private workspace APIs reject foreign origins and rebinding hostnames', async () => {
  assert.equal((await fetch(`${base}/state`, { headers: { Origin: 'https://example.com' } })).status, 403);
  const foreignHostStatus = await new Promise((resolve, reject) => {
    const request = require('node:http').get(`${base}/state`, { headers: { Host: 'example.com' } }, response => { response.resume(); resolve(response.statusCode); }); request.on('error', reject);
  });
  assert.equal(foreignHostStatus, 403);
  assert.equal((await fetch(`${base}/state`, { headers: { Origin: new URL(base).origin } })).status, 200);
});
test('Output naming reserves the bundle report filename', async () => {
  const job = await enqueue(recipe([{ toolId: 'base64', options: { direction: 'Decode', filename: 'conversion-report.json' } }]), [], 'e30=');
  const done = await waitJob(job.id); assert.equal(done.status, 'completed'); assert.equal(done.results[0].name, 'conversion-report-2.json');
});
test('A second app instance cannot overwrite an active persistent workspace', () => {
  assert.throws(() => new WorkspaceStore(root), /already open/);
  assert.equal(JSON.parse(require('node:fs').readFileSync(router.store.lockFile, 'utf8')).token, router.store.lockToken);
});
test('Secret-bearing tools cannot enter saved recipes or persistent job history', async () => {
  const before = router.store.state.jobs.length;
  for (const toolId of ['aes-encrypt', 'hmac', 'password-generate', 'scrypt-password', 'bcrypt-password', 'jwt-inspect']) {
    const value = recipe([{ toolId, options: { password: 'never-save-this', key: 'never-save-this' } }]);
    assert.equal((await request('/recipes', 'POST', value)).status, 400);
    assert.equal((await request('/jobs', 'POST', { recipe: value, text: 'private' })).status, 400);
  }
  assert.equal(router.store.state.jobs.length, before);
  assert.ok(!(await fs.readFile(router.store.stateFile, 'utf8')).includes('never-save-this'));
});
test('Source-free utility generators run through background recipes', async () => {
  const job = await enqueue(recipe([{ toolId: 'uuid-generate', options: { count: 3 } }])); const done = await waitJob(job.id);
  assert.equal(done.status, 'completed', done.error); assert.equal(done.results.length, 2);
});
test('Atomic workspace saves tolerate a transient Windows destination lock', () => {
  const syncFs = require('node:fs'), original = syncFs.renameSync; let attempts = 0;
  syncFs.renameSync = (...args) => { if (attempts++ === 0) { const error = new Error('Temporary destination lock'); error.code = 'EPERM'; throw error; } return original(...args); };
  try { router.store.persist(); assert.equal(attempts, 2); }
  finally { syncFs.renameSync = original; }
});
