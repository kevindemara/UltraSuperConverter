'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { fork, execFile } = require('node:child_process');
const { catalog, validateOptions } = require('./toolbox');
const { naming } = require('../public/workspace-utils');

const activeStates = new Set(['queued', 'running']);
function validateRecipe(input) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.steps) || !input.steps.length || input.steps.length > 8) throw new Error('A recipe needs 1–8 conversion steps.');
  const recipe = { version: 1, name: String(input.name || 'Untitled recipe').slice(0, 100), batch: !!input.batch, naming: String(input.naming || '{name}').slice(0, 160), steps: input.steps.map(step => {
    const tool = catalog.find(t => t.id === step.toolId);
    if (!tool) throw new Error(`Unknown recipe tool: ${step.toolId}`);
    return { toolId: tool.id, select: String(step.select || '*').slice(0, 160), options: validateOptions(tool, step.options || {}) };
  }) };
  naming(recipe.naming, { name: 'example.png' });
  return recipe;
}
class WorkspaceStore {
  constructor(rootDir) {
    this.root = path.join(rootDir, '.workspace-data');
    this.libraryDir = path.join(this.root, 'library'); this.jobsDir = path.join(this.root, 'jobs'); this.tempDir = path.join(this.root, 'incoming');
    for (const dir of [this.root, this.libraryDir, this.jobsDir, this.tempDir]) fs.mkdirSync(dir, { recursive: true });
    this.lockFile = path.join(this.root, 'workspace.lock'); this.lockToken = crypto.randomUUID();
    this.acquireLock();
    this.stateFile = path.join(this.root, 'state.json');
    try {
      this.state = fs.existsSync(this.stateFile) ? JSON.parse(fs.readFileSync(this.stateFile, 'utf8')) : { version: 1, assets: [], recipes: [], jobs: [] };
      if (this.state.version !== 1 || !Array.isArray(this.state.jobs) || !Array.isArray(this.state.assets) || !Array.isArray(this.state.recipes)) throw new Error('Unsupported workspace state. Restore a valid state.json backup.');
    } catch (error) { this.releaseLock(); throw error; }
    this.active = null; this.closed = false;
    for (const job of this.state.jobs) if (job.status === 'running') { job.status = 'interrupted'; job.error = 'The server stopped during conversion. Retry this job to run it again.'; job.finishedAt = new Date().toISOString(); }
    this.persist(); setImmediate(() => this.pump());
  }
  acquireLock() {
    const create = () => fs.writeFileSync(this.lockFile, JSON.stringify({ pid: process.pid, token: this.lockToken }), { flag: 'wx' });
    try { create(); } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let owner; try { owner = JSON.parse(fs.readFileSync(this.lockFile, 'utf8')); } catch (_) { throw new Error('Workspace lock is unreadable. Check workspace.lock before restarting.'); }
      let alive = Number.isInteger(owner.pid) && owner.pid > 0;
      if (alive) { try { process.kill(owner.pid, 0); } catch (err) { alive = err.code !== 'ESRCH'; } }
      if (alive) throw new Error(`This workspace is already open in process ${owner.pid}. Use that app instance or choose a separate USC_DATA_DIR.`);
      fs.unlinkSync(this.lockFile); create();
    }
  }
  releaseLock() { try { if (JSON.parse(fs.readFileSync(this.lockFile, 'utf8')).token === this.lockToken) fs.unlinkSync(this.lockFile); } catch (_) {} }
  persist() { const temp = this.stateFile + '.tmp'; fs.writeFileSync(temp, JSON.stringify(this.state, null, 2)); fs.renameSync(temp, this.stateFile); }
  publicState() {
    return { assets: this.state.assets.map(({ storedName, ...rest }) => rest), recipes: this.state.recipes, jobs: this.state.jobs.map(job => this.publicJob(job)) };
  }
  publicJob(job) {
    const { text, ...summary } = job;
    return { ...summary, hasText: !!text, results: (job.results || []).map(r => ({ ...r, url: `/api/workspace/jobs/${job.id}/download/${encodeURIComponent(r.name)}` })) };
  }
  assetPath(asset) { return path.join(this.libraryDir, asset.storedName); }
  jobDir(id) { if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error('Invalid job identifier.'); return path.join(this.jobsDir, id); }
  async addAssets(files, relativePaths = []) {
    const total = this.state.assets.reduce((sum, a) => sum + a.size, 0) + files.reduce((sum, f) => sum + f.size, 0);
    if (total > 2 * 1024 * 1024 * 1024) throw new Error('The asset library is limited to 2 GB. Remove unused files first.');
    const { safeEntry } = require('./advanced/archive');
    const imported = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i], id = crypto.randomUUID();
        const name = path.basename(String(file.originalname).replace(/\\/g, '/'));
        const relativePath = safeEntry(String(relativePaths[i] || name));
        if (relativePath.length > 1000) throw new Error('A relative file path is too long.');
        const hash = crypto.createHash('sha256');
        for await (const chunk of fs.createReadStream(file.path)) hash.update(chunk);
        const extension = path.extname(name).replace(/[^a-zA-Z0-9.]/g, '').slice(0, 14);
        const storedName = `${id}${extension}`;
        await fsp.rename(file.path, path.join(this.libraryDir, storedName));
        imported.push({ id, name, relativePath, size: file.size, sha256: hash.digest('hex'), format: extension.slice(1).toUpperCase() || 'FILE', createdAt: new Date().toISOString(), storedName });
      }
      this.state.assets.push(...imported); this.persist(); return imported.map(({ storedName, ...a }) => a);
    } catch (error) { for (const asset of imported) await fsp.unlink(this.assetPath(asset)).catch(() => {}); throw error; }
  }
  async removeAsset(id) {
    const asset = this.state.assets.find(a => a.id === id); if (!asset) throw new Error('Asset not found.');
    if (this.state.jobs.some(j => activeStates.has(j.status) && j.assetIds.includes(id))) throw new Error('This file is used by a queued or running job. Cancel that job first.');
    await fsp.unlink(this.assetPath(asset)).catch(error => { if (error.code !== 'ENOENT') throw error; });
    this.state.assets = this.state.assets.filter(a => a.id !== id); this.persist();
  }
  saveRecipe(input, id) {
    const recipe = validateRecipe(input);
    const prior = id && this.state.recipes.find(r => r.id === id);
    if (id && !prior) throw new Error('Recipe not found.');
    const saved = { ...recipe, id: prior?.id || crypto.randomUUID(), updatedAt: new Date().toISOString() };
    if (prior) this.state.recipes[this.state.recipes.indexOf(prior)] = saved; else this.state.recipes.push(saved);
    this.persist(); return saved;
  }
  removeRecipe(id) { this.state.recipes = this.state.recipes.filter(r => r.id !== id); this.persist(); }
  enqueue(input) {
    if (this.closed) throw new Error('The workspace is shutting down.');
    const recipe = validateRecipe(input.recipe);
    const assetIds = Array.isArray(input.assetIds) ? input.assetIds : [];
    if (assetIds.length > (recipe.batch ? 200 : 20) || new Set(assetIds).size !== assetIds.length) throw new Error('Choose at most 20 distinct files for a combined job or 200 for a per-file batch.');
    const assets = assetIds.map(id => this.state.assets.find(a => a.id === id));
    if (assets.some(a => !a || !fs.existsSync(this.assetPath(a)))) throw new Error('One or more source assets are missing. Import the files again.');
    if (assets.reduce((sum, a) => sum + a.size, 0) > 500 * 1024 * 1024) throw new Error('A job is limited to 500 MB of input files.');
    const first = catalog.find(t => t.id === recipe.steps[0].toolId);
    const text = String(input.text || ''); if (Buffer.byteLength(text) > 10 * 1024 * 1024) throw new Error('Pasted text is limited to 10 MB.');
    if (!assets.length && (first.input !== 'text' || !text)) throw new Error('Select library files or paste text for the first tool.');
    if (this.state.jobs.filter(j => activeStates.has(j.status)).length >= 100) throw new Error('The queue is limited to 100 pending jobs.');
    const job = { id: crypto.randomUUID(), name: String(input.name || recipe.name).slice(0, 100), recipe, assetIds, text, status: 'queued', progress: 0, stage: 'Waiting in queue', results: [], createdAt: new Date().toISOString() };
    this.state.jobs.unshift(job); this.persist(); setImmediate(() => this.pump()); return this.publicJob(job);
  }
  pump() {
    if (this.closed || this.active) return;
    const job = [...this.state.jobs].reverse().find(j => j.status === 'queued'); if (!job) return;
    job.status = 'running'; job.startedAt = new Date().toISOString(); job.stage = 'Starting conversion worker'; this.persist();
    const jobDir = this.jobDir(job.id); fs.mkdirSync(path.join(jobDir, 'results'), { recursive: true });
    const child = fork(path.join(__dirname, 'workspace-worker.js'), [], { execArgv: [], windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
    this.active = { id: job.id, child };
    let errorLog = '', done = false;
    child.stderr.on('data', chunk => { errorLog = (errorLog + chunk.toString()).slice(-2000); });
    const timer = setTimeout(() => this.cancel(job.id, 'Job exceeded the 20-minute time limit.'), 20 * 60 * 1000); timer.unref();
    child.on('message', message => {
      if (job.status !== 'running') return;
      if (message.type === 'progress') { job.progress = message.progress; job.stage = message.stage; }
      else if (message.type === 'done') { Object.assign(job, { status: message.status, results: message.results, batches: message.batches, error: message.error, progress: 100, stage: 'Finished', finishedAt: new Date().toISOString() }); done = true; }
      else if (message.type === 'failed') { job.status = 'failed'; job.error = message.error; job.finishedAt = new Date().toISOString(); done = true; }
      this.persist();
    });
    child.on('error', error => { if (job.status === 'running') { job.status = 'failed'; job.error = error.message; this.persist(); } });
    child.on('close', () => {
      clearTimeout(timer);
      if (!done && job.status === 'running') { job.status = 'failed'; job.error = errorLog || 'The conversion worker stopped unexpectedly.'; job.finishedAt = new Date().toISOString(); }
      if (job.status === 'cancelled' || job.status === 'interrupted' || job.status === 'failed') this.discardIntermediates(job.id);
      this.active = null; this.persist(); this.pump();
    });
    child.send({ job, assets: job.assetIds.map(id => { const asset = this.state.assets.find(a => a.id === id); return { ...asset, path: this.assetPath(asset) }; }), jobDir });
  }
  discardIntermediates(id) {
    const dir = this.jobDir(id); if (!fs.existsSync(dir)) return;
    for (const name of fs.readdirSync(dir)) if (name !== 'report.json') fs.rmSync(path.join(dir, name), { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
  cancel(id, reason = 'Cancelled by user.') {
    const job = this.state.jobs.find(j => j.id === id); if (!job) throw new Error('Job not found.');
    if (!activeStates.has(job.status)) return this.publicJob(job);
    job.status = 'cancelled'; job.error = reason; job.stage = 'Cancelled'; job.finishedAt = new Date().toISOString(); this.persist();
    if (this.active?.id === id) {
      const child = this.active.child;
      if (process.platform === 'win32') execFile('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {});
      else { try { process.kill(-child.pid, 'SIGKILL'); } catch (_) { child.kill('SIGKILL'); } }
    }
    return this.publicJob(job);
  }
  retry(id) { const job = this.state.jobs.find(j => j.id === id); if (!job || activeStates.has(job.status)) throw new Error('Only finished jobs can be retried.'); return this.enqueue({ name: `${job.name} (retry)`, recipe: job.recipe, assetIds: job.assetIds, text: job.text }); }
  async removeJob(id) {
    const job = this.state.jobs.find(j => j.id === id); if (!job) throw new Error('Job not found.');
    if (activeStates.has(job.status) || this.active?.id === id) throw new Error('Wait for the job to stop before deleting it.');
    await fsp.rm(this.jobDir(id), { recursive: true, force: true }); this.state.jobs = this.state.jobs.filter(j => j.id !== id); this.persist();
  }
  close() { this.closed = true; if (this.active) { const job = this.state.jobs.find(j => j.id === this.active.id); this.cancel(job.id, 'Server stopped. Retry this job to continue.'); job.status = 'interrupted'; this.persist(); } this.releaseLock(); }
}
module.exports = { WorkspaceStore, validateRecipe };
