'use strict';
const express = require('express');
const multer = require('multer');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const archiver = require('archiver');
const { WorkspaceStore } = require('./workspace-store');
const { naming } = require('../public/workspace-utils');

function workspaceRoutes(rootDir) {
  const router = express.Router(), store = new WorkspaceStore(rootDir);
  router.store = store;
  router.use(require('./local-request'));
  const handle = callback => async (req, res) => { try { await callback(req, res); } catch (error) { if (!res.headersSent) res.status(400).json({ error: error.message }); } };
  const attachment = (res, file, name) => { res.set('X-Content-Type-Options', 'nosniff'); res.set('Content-Security-Policy', "sandbox; default-src 'none'"); res.download(file, name); };
  const jobById = id => { const job = store.state.jobs.find(j => j.id === id); if (!job) throw new Error('Job not found.'); return job; };
  router.get('/state', (req, res) => res.json(store.publicState()));
  const upload = multer({ storage: multer.diskStorage({ destination: (req, file, cb) => cb(null, store.tempDir), filename: (req, file, cb) => cb(null, crypto.randomUUID()) }), limits: { files: 20, fileSize: 100 * 1024 * 1024, fields: 1, fieldSize: 100000 } }).array('files', 20);
  router.post('/assets', (req, res) => {
    upload(req, res, async error => {
      try {
        if (error) throw error;
        if (!req.files?.length) throw new Error('Choose files to import.');
        const paths = JSON.parse(req.body.paths || '[]');
        if (!Array.isArray(paths) || (paths.length && paths.length !== req.files.length)) throw new Error('Relative paths must match the uploaded files.');
        res.json({ assets: await store.addAssets(req.files, paths) });
      } catch (err) { res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Each input file is limited to 100 MB.' : err.message }); }
      finally { for (const file of req.files || []) await fsp.unlink(file.path).catch(() => {}); }
    });
  });
  router.get('/assets/:id/download', handle((req, res) => { const asset = store.state.assets.find(a => a.id === req.params.id); if (!asset) throw new Error('Asset not found.'); attachment(res, store.assetPath(asset), asset.name); }));
  router.delete('/assets/:id', handle(async (req, res) => { await store.removeAsset(req.params.id); res.json({ ok: true }); }));
  router.post('/recipes', handle((req, res) => res.json(store.saveRecipe(req.body))));
  router.put('/recipes/:id', handle((req, res) => res.json(store.saveRecipe(req.body, req.params.id))));
  router.delete('/recipes/:id', handle((req, res) => { store.removeRecipe(req.params.id); res.json({ ok: true }); }));
  router.get('/recipes/:id/export', handle((req, res) => {
    const recipe = store.state.recipes.find(r => r.id === req.params.id); if (!recipe) throw new Error('Recipe not found.');
    res.attachment(`recipe-${recipe.id}.json`).json(recipe);
  }));
  router.post('/naming-preview', handle((req, res) => {
    if (!Array.isArray(req.body.names) || req.body.names.length > 100) throw new Error('Provide up to 100 output names.');
    const used = new Set(); res.json({ names: req.body.names.map((name, index) => naming(req.body.template, { name, source: req.body.source || 'example', tool: req.body.tool || 'conversion', index: index + 1 }, used)) });
  }));
  router.post('/jobs', handle((req, res) => res.status(202).json(store.enqueue(req.body))));
  router.get('/jobs/:id', handle((req, res) => res.json(store.publicJob(jobById(req.params.id)))));
  router.post('/jobs/:id/cancel', handle((req, res) => res.json(store.cancel(req.params.id))));
  router.post('/jobs/:id/retry', handle((req, res) => res.status(202).json(store.retry(req.params.id))));
  router.delete('/jobs/:id', handle(async (req, res) => { await store.removeJob(req.params.id); res.json({ ok: true }); }));
  router.get('/jobs/:id/report', handle((req, res) => {
    const job = jobById(req.params.id), file = path.join(store.jobDir(job.id), 'report.json');
    if (!fs.existsSync(file)) throw new Error('This job has no completed report.'); attachment(res, file, 'conversion-report.json');
  }));
  router.get('/jobs/:id/download/:name', handle((req, res) => {
    const job = jobById(req.params.id), result = job.results.find(r => r.name === req.params.name);
    if (!result || /[\\/]/.test(result.name)) throw new Error('Output not found.');
    attachment(res, path.join(store.jobDir(job.id), 'results', result.name), result.name);
  }));
  router.get('/jobs/:id/zip', handle((req, res) => {
    const job = jobById(req.params.id), report = path.join(store.jobDir(job.id), 'report.json');
    if (!fs.existsSync(report) || ['running', 'queued'].includes(job.status)) throw new Error('Wait until the job finishes.');
    res.attachment(`conversion-${job.id}.zip`); res.set('X-Content-Type-Options', 'nosniff');
    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', error => { if (!res.headersSent) res.status(500).json({ error: error.message }); else res.destroy(error); });
    res.on('close', () => archive.abort()); archive.pipe(res);
    for (const result of job.results) archive.file(path.join(store.jobDir(job.id), 'results', result.name), { name: result.name });
    archive.file(report, { name: 'conversion-report.json' }); archive.finalize();
  }));
  return router;
}
module.exports = workspaceRoutes;
