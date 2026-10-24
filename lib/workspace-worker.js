'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { runTool, catalog } = require('./toolbox');
const { naming } = require('../public/workspace-utils');
const send = message => new Promise(resolve => { if (process.connected) process.send(message, () => resolve()); else resolve(); });

process.once('disconnect', () => {
  if (process.platform === 'win32') require('node:child_process').spawn('taskkill.exe', ['/PID', String(process.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  else { try { process.kill(-process.pid, 'SIGKILL'); } catch (_) { process.exit(1); } }
});
process.once('message', async request => {
  const { job, assets, jobDir } = request;
  try {
    const outputs = [], batches = [], used = new Set(['conversion-report.json']);
    const groups = job.recipe.batch ? assets.map(a => [a]) : [assets];
    if (!groups.length) groups.push([]);
    let finished = 0;
    for (let batch = 0; batch < groups.length; batch++) {
      let inputs = groups[batch].map(a => ({ path: a.path, originalname: a.name }));
      try {
        let latest = [];
        for (let stage = 0; stage < job.recipe.steps.length; stage++) {
          const step = job.recipe.steps[stage], tool = catalog.find(t => t.id === step.toolId);
          send({ type: 'progress', progress: Math.round(finished / (groups.length * job.recipe.steps.length) * 95), stage: `${batch + 1}/${groups.length} · ${stage + 1}/${job.recipe.steps.length} · ${tool.name}` });
          const stageDir = path.join(jobDir, `batch-${batch}-stage-${stage}`); await fs.mkdir(stageDir, { recursive: true });
          const escaped = String(step.select || '*').split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
          const selectedInputs = inputs.filter(file => new RegExp(`^${escaped}$`, 'i').test(file.originalname));
          if (inputs.length && !selectedInputs.length) throw new Error(`No files match the input filter "${step.select}" at step ${stage + 1}.`);
          latest = await runTool({ toolId: step.toolId, text: stage === 0 ? job.text : '', files: selectedInputs, options: step.options, workDir: stageDir });
          inputs = latest.map(r => ({ path: r.path, originalname: r.name })); finished++;
        }
        const nameMap = new Map();
        for (const result of latest) nameMap.set(result.name, naming(job.recipe.naming, { name: result.name, source: groups[batch][0]?.name || 'text', index: outputs.length + nameMap.size + 1, tool: job.recipe.steps.at(-1).toolId, date: job.createdAt.slice(0, 10) }, used));
        for (const result of latest) {
          const name = nameMap.get(result.name), output = path.join(jobDir, 'results', name);
          if (/\.(html|css|json)$/i.test(result.name) && result.bytes < 10 * 1024 * 1024) {
            let content = await fs.readFile(result.path, 'utf8');
            // Rewrite package-local references after applying the naming template.
            const placeholders = [];
            for (const [oldName, newName] of [...nameMap.entries()].sort((a, b) => b[0].length - a[0].length)) {
              const token = `__USC_REFERENCE_${crypto.randomUUID()}__`;
              content = content.split(oldName).join(token); placeholders.push([token, newName]);
            }
            for (const [token, value] of placeholders) content = content.split(token).join(value);
            await fs.writeFile(output, content);
          } else await fs.copyFile(result.path, output);
          const info = await fs.stat(output), hash = crypto.createHash('sha256');
          for await (const chunk of require('node:fs').createReadStream(output)) hash.update(chunk);
          let preview;
          if (typeof result.preview === 'string') {
            const handle = await fs.open(output, 'r');
            try { const buffer = Buffer.alloc(Math.min(info.size, 100000)); const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0); preview = buffer.subarray(0, bytesRead).toString('utf8'); } finally { await handle.close(); }
          }
          outputs.push({ name, bytes: info.size, sha256: hash.digest('hex'), source: groups[batch][0]?.relativePath || groups[batch][0]?.name || 'text', ...(preview === undefined ? {} : { preview }) });
        }
        batches.push({ index: batch + 1, sources: groups[batch].map(a => a.relativePath || a.name), status: 'completed' });
      } catch (error) {
        batches.push({ index: batch + 1, sources: groups[batch].map(a => a.relativePath || a.name), status: 'failed', error: error.message });
        finished = (batch + 1) * job.recipe.steps.length;
        if (!job.recipe.batch) throw error;
      }
    }
    const report = { id: job.id, name: job.name, recipe: job.recipe, startedAt: job.startedAt, finishedAt: new Date().toISOString(), sources: assets.map(({ name, relativePath, size, sha256 }) => ({ name, relativePath, size, sha256 })), batches, outputs: outputs.map(({ preview, ...r }) => r) };
    await fs.writeFile(path.join(jobDir, 'report.json'), JSON.stringify(report, null, 2));
    // Keep only final results and the report; intermediates can be large.
    for (const entry of await fs.readdir(jobDir, { withFileTypes: true })) if (entry.isDirectory() && entry.name !== 'results') await fs.rm(path.join(jobDir, entry.name), { recursive: true, force: true });
    await send({ type: 'done', results: outputs, batches, status: !outputs.length ? 'failed' : batches.some(b => b.status === 'failed') ? 'partial' : 'completed', error: !outputs.length ? 'All batch inputs failed. Review the batch report.' : null });
    process.exit(0);
  } catch (error) { await send({ type: 'failed', error: error.message }); process.exit(1); }
});
