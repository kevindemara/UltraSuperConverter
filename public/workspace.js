(() => {
  'use strict';
  const tools = [...window.CONVERTER_TOOLS, ...window.ADVANCED_TOOLS, ...window.UTILITY_TOOLS].filter(tool => !tool.sensitive);
  const $ = id => document.getElementById(id);
  const el = (tag, className = '', text) => { const node = document.createElement(tag); node.className = className; if (text !== undefined) node.textContent = text; return node; };
  const button = (title, action, className = 'quiet-button') => { const node = el('button', className, title); node.type = 'button'; node.addEventListener('click', () => Promise.resolve().then(action).catch(showError)); return node; };
  const size = n => n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
  let state = { assets: [], recipes: [], jobs: [] }, selected = [], steps = [], recipeId = null, refreshing = false, lastJobs = '', lastLibrary = '', lastRecipes = '', importing = false;
  let draft;
  try { draft = JSON.parse(localStorage.getItem('usc-workspace-draft') || 'null'); } catch (_) {}
  function showError(error) { $('workspaceError').textContent = error?.message || String(error); $('workspaceError').hidden = false; }
  function notice(message) { $('workspaceNotice').textContent = message; $('workspaceNotice').hidden = false; $('workspaceError').hidden = true; }
  async function api(route, method = 'GET', body) {
    const response = await fetch(`/api/workspace${route}`, { method, ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Workspace request failed.'); return data;
  }
  function switchTab(name) {
    for (const tab of document.querySelectorAll('[data-tab]')) { const active = tab.dataset.tab === name; tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1; $(`panel-${tab.dataset.tab}`).hidden = !active; }
    if (name === 'jobs') renderJobs(true);
  }
  function currentRecipe() { return { version: 1, name: $('recipeName').value || 'My conversion flow', batch: $('batchRecipe').checked, naming: $('outputTemplate').value || '{name}', steps }; }
  function saveDraft() {
    try { localStorage.setItem('usc-workspace-draft', JSON.stringify({ recipe: currentRecipe(), recipeId, selected, text: $('sourceText').value, jobName: $('jobName').value })); } catch (_) {}
    previewName();
  }
  function previewName() {
    try { const source = state.assets.find(a => a.id === selected[0])?.name || 'example.png'; $('namingPreview').textContent = `Example: ${window.WORKSPACE_UTILS.naming($('outputTemplate').value, { name: 'result.png', source, tool: steps.at(-1)?.toolId || 'conversion', index: 1 })}`; }
    catch (error) { $('namingPreview').textContent = error.message; }
  }
  function defaultStep(id) { const tool = tools.find(t => t.id === id) || tools[0]; return { toolId: tool.id, select: '*', options: Object.fromEntries(tool.fields.map(field => [field.key, field.value])) }; }
  function loadRecipe(recipe, id = null, clearText = false) {
    recipeId = id; steps = structuredClone(recipe.steps || [defaultStep('json-format')]);
    $('recipeName').value = recipe.name || 'My conversion flow'; $('batchRecipe').checked = !!recipe.batch; $('outputTemplate').value = recipe.naming || '{name}';
    if (clearText) $('sourceText').value = '';
    renderSteps(); saveDraft(); switchTab('build');
  }
  function renderSteps() {
    $('pipelineSteps').replaceChildren();
    steps.forEach((step, index) => {
      const tool = tools.find(t => t.id === step.toolId); if (!tool) return;
      const card = el('article', 'pipeline-step'), heading = el('div', 'step-heading'), controls = el('div', 'step-controls');
      heading.append(el('span', 'step-number', `STEP ${String(index + 1).padStart(2, '0')}`));
      for (const [title, label, disabled, action] of [
        ['↑', 'Move step up', index === 0, () => { [steps[index - 1], steps[index]] = [steps[index], steps[index - 1]]; renderSteps(); saveDraft(); }],
        ['↓', 'Move step down', index === steps.length - 1, () => { [steps[index + 1], steps[index]] = [steps[index], steps[index + 1]]; renderSteps(); saveDraft(); }],
        ['Remove', 'Remove step', steps.length === 1, () => { steps.splice(index, 1); renderSteps(); saveDraft(); }]
      ]) { const b = button(title, action, ''); b.disabled = disabled; b.setAttribute('aria-label', `${label} ${index + 1}`); controls.append(b); }
      heading.append(controls); card.append(heading);
      const select = el('select'); select.setAttribute('aria-label', `Conversion tool for step ${index + 1}`);
      for (const group of [...new Set(tools.map(t => t.group))]) { const optgroup = el('optgroup'); optgroup.label = group; for (const entry of tools.filter(t => t.group === group)) { const option = el('option', '', entry.name); option.value = entry.id; optgroup.append(option); } select.append(optgroup); }
      select.value = tool.id; select.addEventListener('change', () => { steps[index] = defaultStep(select.value); renderSteps(); saveDraft(); }); card.append(select, el('p', 'step-description', tool.description));
      if (index === 0 && tool.sample) card.append(button('Load this tool’s example', () => { $('sourceText').value = tool.sample; selected = []; renderSelected(); saveDraft(); }));
      const options = el('div', 'step-options');
      for (const field of tool.fields) {
        const container = el('div', 'step-field'), label = el('label', '', field.label), input = el(field.type === 'select' ? 'select' : field.type === 'textarea' ? 'textarea' : 'input');
        input.id = `step-${index}-${field.key}`; label.htmlFor = input.id;
        if (field.type === 'select') for (const [value, title] of field.choices) { const option = el('option', '', title); option.value = value; input.append(option); }
        else if (field.type === 'textarea') { input.maxLength = field.maxLength || 1000000; input.spellcheck = false; }
        else { input.type = field.type; if (field.type === 'number') { input.min = field.min; input.max = field.max; input.step = field.step; } else input.maxLength = field.maxLength || 2000; }
        input.value = step.options[field.key] ?? field.value;
        input.addEventListener('change', () => { step.options[field.key] = input.value; saveDraft(); });
        container.append(label, input); options.append(container);
      }
      card.append(options);
      const filter = el('div', 'step-selector'), label = el('label', '', index ? 'Use previous outputs matching (* = all)' : 'Use input filenames matching (* = all)');
      const input = el('input'); input.id = `step-${index}-filter`; input.value = step.select || '*'; input.maxLength = 160; label.htmlFor = input.id;
      input.addEventListener('input', () => { step.select = input.value || '*'; saveDraft(); }); filter.append(label, input); card.append(filter); $('pipelineSteps').append(card);
    });
    $('addStep').disabled = steps.length >= 8;
  }
  function renderSelected() {
    $('selectedAssets').replaceChildren();
    if (!selected.length) $('selectedAssets').append(el('li', '', 'No files selected. Import files, choose from the library, or paste text below.'));
    selected.forEach((id, index) => {
      const asset = state.assets.find(a => a.id === id); if (!asset) return;
      const row = el('li'); row.append(el('span', '', `${index + 1}. ${asset.relativePath || asset.name}`));
      const up = button('↑', () => { [selected[index - 1], selected[index]] = [selected[index], selected[index - 1]]; renderSelected(); renderLibrary(true); saveDraft(); }, ''); up.disabled = index === 0; up.setAttribute('aria-label', `Move ${asset.name} up`);
      const down = button('↓', () => { [selected[index + 1], selected[index]] = [selected[index], selected[index + 1]]; renderSelected(); renderLibrary(true); saveDraft(); }, ''); down.disabled = index === selected.length - 1; down.setAttribute('aria-label', `Move ${asset.name} down`);
      const remove = button('×', () => { selected = selected.filter(value => value !== id); renderSelected(); renderLibrary(true); saveDraft(); }, ''); remove.setAttribute('aria-label', `Deselect ${asset.name}`);
      row.append(up, down, remove); $('selectedAssets').append(row);
    });
    previewName();
  }
  function visibleAssets() { const query = $('librarySearch').value.trim().toLowerCase(); return state.assets.filter(a => `${a.name} ${a.relativePath} ${a.format}`.toLowerCase().includes(query)); }
  function renderLibrary(force = false) {
    const key = JSON.stringify([state.assets, selected, $('librarySearch').value]); if (!force && key === lastLibrary) return; lastLibrary = key;
    $('libraryList').replaceChildren(); const matches = visibleAssets();
    $('libraryStats').textContent = `${state.assets.length} files · ${size(state.assets.reduce((n, a) => n + a.size, 0))} of 2 GB · ${selected.length} selected for the recipe`;
    if (!matches.length) $('libraryList').append(el('p', 'empty-state', state.assets.length ? 'No files match this search.' : 'Import files or a folder to start your local library. Files can be reused across recipes and jobs.'));
    for (const asset of matches) {
      const row = el('div', 'library-row'), check = el('input'); check.type = 'checkbox'; check.checked = selected.includes(asset.id); check.setAttribute('aria-label', `Select ${asset.relativePath || asset.name}`);
      check.addEventListener('change', () => { if (check.checked) selected.push(asset.id); else selected = selected.filter(id => id !== asset.id); renderSelected(); renderLibrary(true); saveDraft(); });
      const info = el('div'); info.append(el('strong', '', asset.name), el('small', '', `${asset.relativePath} · ${asset.format} · ${size(asset.size)}`), el('small', '', `SHA-256 ${asset.sha256.slice(0, 20)}…`));
      const actions = el('div', 'library-actions'), download = el('a', '', 'Download'); download.href = `/api/workspace/assets/${asset.id}/download`; download.download = asset.name;
      actions.append(download, button('Remove', async () => { if (!confirm(`Remove the library copy of ${asset.name}? The original file on your computer is kept.`)) return; await api(`/assets/${asset.id}`, 'DELETE'); selected = selected.filter(id => id !== asset.id); await refresh(); renderSelected(); saveDraft(); }));
      row.append(check, info, actions); $('libraryList').append(row);
    }
  }
  function renderJobs(force = false) {
    const filter = $('jobFilter').value, key = JSON.stringify([state.jobs, filter]); if (!force && key === lastJobs) return; lastJobs = key;
    const open = new Set([...$('jobList').querySelectorAll('details[open]')].map(d => d.dataset.job)); $('jobList').replaceChildren();
    const jobs = state.jobs.filter(j => filter === 'all' || (filter === 'active' ? ['running', 'queued'].includes(j.status) : filter === 'failed' ? ['failed', 'partial', 'interrupted', 'cancelled'].includes(j.status) : j.status === filter));
    if (!jobs.length) $('jobList').append(el('p', 'empty-state', 'No jobs in this view. Build a recipe and add it to the background queue.'));
    for (const job of jobs) {
      const card = el('article', 'job-card'), heading = el('div', 'job-heading'), title = el('div');
      title.append(el('h3', '', job.name), el('p', 'job-meta', `${new Date(job.createdAt).toLocaleString()} · ${job.recipe.steps.length} steps · ${job.assetIds.length} source files${job.recipe.batch ? ' · per-file batch' : ''}`));
      heading.append(title, el('span', `job-status ${job.status}`, job.status)); card.append(heading);
      if (['running', 'queued'].includes(job.status)) { const progress = el('progress', 'job-progress'); progress.max = 100; progress.value = job.progress; progress.setAttribute('aria-label', `${job.name} progress`); card.append(progress, el('p', 'job-stage', job.stage)); }
      if (job.error) card.append(el('p', 'job-error', job.error));
      const actions = el('div', 'job-actions');
      if (['queued', 'running'].includes(job.status)) actions.append(button('Cancel job', async () => { await api(`/jobs/${job.id}/cancel`, 'POST', {}); await refresh(); }));
      else { actions.append(button('Retry as new job', async () => { await api(`/jobs/${job.id}/retry`, 'POST', {}); await refresh(); })); actions.append(button('Delete job & outputs', async () => { if (!confirm(`Delete ${job.name} and its generated outputs? Library files are kept.`)) return; await api(`/jobs/${job.id}`, 'DELETE'); await refresh(); })); }
      actions.append(button('Load recipe', () => loadRecipe(job.recipe)));
      if (job.results.length || job.batches) {
        const zip = el('a', '', 'Download ZIP + report'); zip.href = `/api/workspace/jobs/${job.id}/zip`; const report = el('a', '', 'Report'); report.href = `/api/workspace/jobs/${job.id}/report`; actions.append(zip, report);
      }
      card.append(actions);
      if (job.results.length) {
        const details = el('details', 'job-results'); details.dataset.job = job.id; details.open = open.has(job.id);
        details.append(el('summary', '', `${job.results.length} output files · ${size(job.results.reduce((n, r) => n + r.bytes, 0))}`));
        for (const result of job.results) { const row = el('div', 'job-output'), link = el('a', '', 'Download ↓'); link.href = result.url; link.download = result.name; row.append(el('span', '', `${result.name} · ${size(result.bytes)}`), link); details.append(row); }
        card.append(details);
      }
      $('jobList').append(card);
    }
  }
  function renderRecipes() {
    const key = JSON.stringify(state.recipes); if (key === lastRecipes) return; lastRecipes = key; $('recipeList').replaceChildren();
    if (!state.recipes.length) $('recipeList').append(el('p', 'empty-state', 'Save your conversion flow to reuse it here. Recipes can be exported and shared without including your files.'));
    for (const recipe of state.recipes) {
      const row = el('div', 'recipe-row'), info = el('div'), actions = el('div', 'recipe-actions');
      info.append(el('h3', '', recipe.name), el('p', '', recipe.steps.map(s => tools.find(t => t.id === s.toolId)?.name || s.toolId).join(' → ')));
      const download = el('a', '', 'Export JSON'); download.href = `/api/workspace/recipes/${recipe.id}/export`;
      actions.append(button('Load recipe', () => loadRecipe(recipe, recipe.id), 'outline-button'), button('Rename', async () => { const name = prompt('Recipe name', recipe.name); if (!name?.trim()) return; await api(`/recipes/${recipe.id}`, 'PUT', { ...recipe, name: name.trim() }); if (recipeId === recipe.id) $('recipeName').value = name.trim(); await refresh(); saveDraft(); }), download, button('Delete', async () => { if (!confirm(`Delete recipe ${recipe.name}? Existing jobs and files are kept.`)) return; await api(`/recipes/${recipe.id}`, 'DELETE'); if (recipeId === recipe.id) recipeId = null; await refresh(); saveDraft(); }));
      row.append(info, actions); $('recipeList').append(row);
    }
  }
  async function refresh() {
    if (refreshing) return; refreshing = true;
    try { state = await api('/state'); selected = selected.filter(id => state.assets.some(a => a.id === id));
      const running = state.jobs.filter(j => j.status === 'running').length, queued = state.jobs.filter(j => j.status === 'queued').length;
      $('queueSummary').textContent = `${running} running · ${queued} queued\n${state.jobs.filter(j => j.status === 'completed').length} completed jobs`;
      $('libraryCount').textContent = state.assets.length; $('jobCount').textContent = state.jobs.length;
      renderLibrary(); renderJobs(); renderRecipes();
    } finally { refreshing = false; }
  }
  async function importFiles(incoming) {
    if (importing || !incoming.length) return; importing = true;
    for (const node of document.querySelectorAll('.import-buttons button,.library-toolbar button')) node.disabled = true;
    try {
      const files = [...incoming].sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name, undefined, { numeric: true }));
      if (files.some(f => f.size > 100 * 1024 * 1024)) throw new Error('Each file must be 100 MB or smaller.');
      let importedCount = 0;
      for (let start = 0; start < files.length; start += 20) {
        const chunk = files.slice(start, start + 20), form = new FormData(); form.append('paths', JSON.stringify(chunk.map(f => f.webkitRelativePath || f.name))); chunk.forEach(f => form.append('files', f));
        const response = await fetch('/api/workspace/assets', { method: 'POST', body: form }); const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Import failed.');
        selected.push(...data.assets.map(a => a.id)); importedCount += data.assets.length; notice(`Imported ${importedCount} of ${files.length} files…`);
      }
      await refresh(); renderSelected(); saveDraft(); notice(`Imported ${files.length} files. Review their order before running your recipe.`);
    } finally { importing = false; for (const node of document.querySelectorAll('.import-buttons button,.library-toolbar button')) node.disabled = false; }
  }
  document.querySelectorAll('[data-tab]').forEach((tab, index, all) => { tab.addEventListener('click', () => switchTab(tab.dataset.tab)); tab.addEventListener('keydown', event => { if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return; event.preventDefault(); const next = all[(index + (event.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length]; switchTab(next.dataset.tab); next.focus(); }); });
  for (const id of ['recipeName', 'sourceText', 'outputTemplate', 'jobName', 'batchRecipe']) $(id).addEventListener('input', saveDraft);
  $('librarySearch').addEventListener('input', () => renderLibrary(true)); $('jobFilter').addEventListener('change', () => renderJobs(true));
  for (const id of ['importFiles', 'libraryImportFiles']) $(id).addEventListener('click', () => $('filesPicker').click());
  for (const id of ['importFolder', 'libraryImportFolder']) $(id).addEventListener('click', () => $('folderPicker').click());
  for (const id of ['filesPicker', 'folderPicker']) $(id).addEventListener('change', async event => { try { await importFiles(event.target.files); } catch (error) { showError(error); await refresh().catch(() => {}); renderSelected(); } finally { event.target.value = ''; } });
  $('chooseLibrary').addEventListener('click', () => switchTab('library')); $('useSelected').addEventListener('click', () => { renderSelected(); switchTab('build'); });
  $('selectAllAssets').addEventListener('click', () => { selected = [...new Set([...selected, ...visibleAssets().map(a => a.id)])]; renderSelected(); renderLibrary(true); saveDraft(); });
  $('clearSelected').addEventListener('click', () => { selected = []; renderSelected(); renderLibrary(true); saveDraft(); });
  $('newRecipe').addEventListener('click', () => loadRecipe({ name: 'My conversion flow', steps: [defaultStep('json-format')] }, null, true));
  $('addStep').addEventListener('click', () => { if (steps.length < 8) { steps.push(defaultStep('json-format')); renderSteps(); saveDraft(); } });
  async function saveRecipe(copy) { const saved = await api(recipeId && !copy ? `/recipes/${recipeId}` : '/recipes', recipeId && !copy ? 'PUT' : 'POST', currentRecipe()); recipeId = saved.id; await refresh(); saveDraft(); notice(`Saved recipe “${saved.name}”.`); }
  $('saveRecipe').addEventListener('click', () => saveRecipe(false).catch(showError)); $('saveRecipeCopy').addEventListener('click', () => saveRecipe(true).catch(showError));
  $('importRecipe').addEventListener('click', () => $('recipePicker').click());
  $('recipePicker').addEventListener('change', async event => { try { const file = event.target.files[0]; if (!file) return; if (file.size > 1024 * 1024) throw new Error('Recipe JSON must be under 1 MB.'); const recipe = await api('/recipes', 'POST', JSON.parse(await file.text())); await refresh(); loadRecipe(recipe, recipe.id); notice(`Imported recipe “${recipe.name}”.`); } catch (error) { showError(error); } finally { event.target.value = ''; } });
  $('queueJob').addEventListener('click', async () => {
    $('queueJob').disabled = true;
    try { const job = await api('/jobs', 'POST', { recipe: currentRecipe(), assetIds: selected, text: $('sourceText').value, name: $('jobName').value }); await refresh(); switchTab('jobs'); notice(`Queued “${job.name}”. The local server will keep working while you use other tools.`); }
    catch (error) { showError(error); } finally { $('queueJob').disabled = false; }
  });
  async function init() {
    try { await refresh();
      const hash = location.hash.slice(1), requested = tools.find(t => t.id === hash);
      if (requested) loadRecipe({ name: requested.name, steps: [defaultStep(requested.id)] });
      else if (draft?.recipe) { selected = (draft.selected || []).filter(id => state.assets.some(a => a.id === id)); $('sourceText').value = draft.text || ''; $('jobName').value = draft.jobName || ''; loadRecipe(draft.recipe, draft.recipeId); }
      else loadRecipe({ name: 'My conversion flow', steps: [defaultStep('json-format')] });
      renderSelected();
    } catch (error) { showError(error); }
  }
  init(); setInterval(() => refresh().catch(error => { $('queueSummary').textContent = 'Local server unavailable. Restart the app to reconnect.'; }), 2000);
})();
