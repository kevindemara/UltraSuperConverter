'use strict';

const express = require('express');
const multer = require('multer');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { runTool, catalog } = require('./toolbox');

module.exports = function toolboxRoutes(rootDir) {
  const router = express.Router();
  router.use(require('./local-request'));
  router.use(express.json({ limit: '12mb' }));
  const resultsRoot = path.join(rootDir, '.toolbox-results');
  fs.mkdirSync(resultsRoot, { recursive: true });
  let running = 0;
  const retention = 24 * 60 * 60 * 1000;
  function expireResults() {
    for (const entry of fs.readdirSync(resultsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^[a-f0-9]{32}$/.test(entry.name)) continue;
      const target = path.join(resultsRoot, entry.name);
      if (Date.now() - fs.statSync(target).mtimeMs > retention) fs.rmSync(target, { recursive: true, force: true });
    }
  }
  expireResults();
  const timer = setInterval(() => { try { expireResults(); } catch (error) { console.warn('Toolbox cleanup:', error.message); } }, 60 * 60 * 1000);
  timer.unref();
  const upload = multer({
    storage: multer.diskStorage({ destination: (req, file, cb) => cb(null, req.workDir), filename: (req, file, cb) => cb(null, `input-${crypto.randomUUID()}`) }),
    limits: { files: 20, fileSize: 100 * 1024 * 1024, fieldSize: 10 * 1024 * 1024, fields: 4 }
  }).array('files', 20);

  router.get('/catalog', (req, res) => res.json({ tools: catalog, retentionHours: 24, maxFileMB: 100 }));
  router.get('/download/:job/:name', (req, res) => {
    if (!/^[a-f0-9]{32}$/.test(req.params.job) || path.basename(req.params.name) !== req.params.name || /[\\/]/.test(req.params.name)) return res.sendStatus(404);
    const jobDir = path.join(resultsRoot, req.params.job);
    const manifestPath = path.join(jobDir, 'manifest.json');
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (!manifest.some(r => r.name === req.params.name)) return res.sendStatus(404);
      res.set('X-Content-Type-Options', 'nosniff');
      res.set('Content-Security-Policy', "sandbox; default-src 'none'");
      res.download(path.join(jobDir, `output-${req.params.name}`), req.params.name);
    } catch (_) { res.status(404).json({ error: 'This result has expired. Run the converter again.' }); }
  });

  router.post('/run', (req, res) => {
    if (running >= 2) return res.status(429).json({ error: 'Two toolbox conversions are running. Wait for one to finish and try again.' });
    running++;
    const job = crypto.randomBytes(16).toString('hex');
    req.workDir = path.join(resultsRoot, job);
    fs.mkdirSync(req.workDir);
    upload(req, res, async error => {
      let succeeded = false;
      try {
        if (error) throw error;
        if ((req.files || []).reduce((sum, f) => sum + f.size, 0) > 500 * 1024 * 1024) throw new Error('A toolbox batch is limited to 500 MB total.');
        const options = typeof req.body.options === 'string' ? JSON.parse(req.body.options || '{}') : req.body.options || {};
        if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error('Options must be an object.');
        if (req.body.text !== undefined && typeof req.body.text !== 'string') throw new Error('Text input must be a string.');
        const outputs = await runTool({ toolId: req.body.toolId, text: req.body.text || '', files: req.files || [], options, workDir: req.workDir });
        const result = outputs.map(({ path: outputPath, ...rest }) => ({ ...rest, url: `/api/toolbox/download/${job}/${encodeURIComponent(rest.name)}` }));
        fs.writeFileSync(path.join(req.workDir, 'manifest.json'), JSON.stringify(result));
        // Intermediate thumbnails and original files are discarded immediately.
        const keep = new Set(['manifest.json', ...outputs.map(r => path.basename(r.path))]);
        for (const name of fs.readdirSync(req.workDir)) if (!keep.has(name)) fs.unlinkSync(path.join(req.workDir, name));
        succeeded = true;
        res.json({ results: result, expiresAt: new Date(Date.now() + retention).toISOString() });
      } catch (err) {
        const message = err.code === 'LIMIT_FILE_SIZE' ? 'Each toolbox input file is limited to 100 MB.' : err.message;
        res.status(400).json({ error: message });
      } finally {
        running--;
        if (!succeeded) fs.rmSync(req.workDir, { recursive: true, force: true });
      }
    });
  });
  return router;
};
