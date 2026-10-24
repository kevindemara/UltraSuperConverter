(() => {
  'use strict';
  const tools = [...window.CONVERTER_TOOLS, ...window.ADVANCED_TOOLS, ...window.UTILITY_TOOLS];
  const $ = id => document.getElementById(id);
  let selected;
  let files = [];
  let busy = false;
  const library = window.TOOL_LIBRARY;
  const preferences = library.createPreferences(tools, { getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) });
  let libraryView = 'all';
  const fileSizes = n => n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
  const el = (tag, className, content) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  };
  function icon(name) {
    const ns = 'http://www.w3.org/2000/svg', definition = library.icons[name] || library.icons.grid;
    const svg = document.createElementNS(ns, 'svg');
    for (const [key, value] of Object.entries({ viewBox: definition.viewBox || '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.7', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' })) svg.setAttribute(key, value);
    for (const path of definition.paths || []) { const child = document.createElementNS(ns, 'path'); child.setAttribute('d', path); svg.append(child); }
    for (const [cx, cy, r] of definition.circles || []) { const child = document.createElementNS(ns, 'circle'); child.setAttribute('cx', cx); child.setAttribute('cy', cy); child.setAttribute('r', r); svg.append(child); }
    for (const [cx, cy, rx, ry] of definition.ellipses || []) { const child = document.createElementNS(ns, 'ellipse'); for (const [key, value] of Object.entries({ cx, cy, rx, ry })) child.setAttribute(key, value); svg.append(child); }
    if (definition.label) { const text = document.createElementNS(ns, 'text'); for (const [key, value] of Object.entries({ x: '12', y: '16.5', 'text-anchor': 'middle', 'font-family': 'Consolas,monospace', 'font-size': definition.label.length > 2 ? '10' : '15', 'font-weight': '600', fill: 'currentColor', stroke: 'none' })) text.setAttribute(key, value); text.textContent = definition.label; svg.append(text); }
    return svg;
  }
  const viewHash = view => ['all', 'favorites', 'recent'].includes(view) ? view : `category-${view}`;
  function navigateView(view, preserveSearch = false) {
    if (busy) return;
    if (!preserveSearch) $('toolSearch').value = '';
    const hash = viewHash(view);
    if (location.hash.slice(1) === hash) showDirectory(view); else location.hash = hash;
  }
  function navigateTool(id) {
    if (busy) return;
    if (location.hash.slice(1) === id) chooseTool(id); else location.hash = id;
  }
  function renderNavigation() {
    const state = preferences.state;
    const active = $('workbench').hidden ? ($('toolSearch').value.trim() ? 'all' : libraryView) : library.categoryOf(selected)?.id;
    const navButton = (id, label, count, glyph, category = '') => {
      const button = el('button', `library-nav-button${category ? ` category-${category}` : ''}`); button.type = 'button'; button.disabled = busy;
      button.append(icon(glyph), el('span', 'nav-label', label), el('span', 'nav-count', count));
      button.setAttribute('aria-pressed', String(active === id)); button.dataset.view = id;
      button.addEventListener('click', () => navigateView(id)); return button;
    };
    $('personalNavigation').replaceChildren(navButton('all', 'All tools', tools.length, 'grid'), navButton('favorites', 'Favorites', state.favorites.length, 'star'), navButton('recent', 'Recent', state.recent.length, 'recent'));
    $('categoryNavigation').replaceChildren(...library.categories.map(category => navButton(category.id, category.name, tools.filter(t => library.metadata[t.id].category === category.id).length, category.icon, category.id)));
    $('preferenceNote').textContent = preferences.available ? 'Favorites and recent tool names are saved in this browser. Your inputs aren’t saved.' : 'Browser storage is unavailable. Favorites and recents will last for this visit.';
  }
  function updateCurrentFavorite() {
    if (!selected) return;
    const favorite = preferences.state.favorites.includes(selected.id), button = $('favoriteCurrent');
    button.replaceChildren(icon('star'), document.createTextNode(favorite ? 'Favorited' : 'Favorite'));
    button.classList.toggle('is-favorite', favorite); button.setAttribute('aria-pressed', String(favorite));
    button.setAttribute('aria-label', `${favorite ? 'Remove' : 'Add'} ${selected.name} ${favorite ? 'from' : 'to'} favorites`);
  }
  function toggleFavorite(tool, restoreFocus = false) {
    preferences.toggleFavorite(tool.id); renderCatalog(); updateCurrentFavorite();
    $('libraryAnnouncement').textContent = `${tool.name} ${preferences.state.favorites.includes(tool.id) ? 'added to' : 'removed from'} favorites.`;
    if (restoreFocus) {
      const replacement = [...$('toolList').querySelectorAll('[data-favorite-tool]')].find(button => button.dataset.favoriteTool === tool.id);
      (replacement || $('directoryTitle')).focus({ preventScroll: true });
    }
  }
  function toolCard(tool) {
    const category = library.categoryOf(tool), favorite = preferences.state.favorites.includes(tool.id);
    const card = el('article', `tool-card category-${category.id}`), open = el('button', 'tool-card-open'); open.type = 'button'; open.disabled = busy;
    open.setAttribute('aria-label', `Open ${tool.name}`); open.title = tool.name;
    const badge = el('span', 'tool-card-icon'); badge.append(icon(library.metadata[tool.id].icon));
    const copy = el('span', 'tool-card-copy'); copy.append(el('strong', 'tool-card-name', tool.name), el('span', 'tool-card-description', tool.description));
    const details = el('span', 'tool-card-details'); details.append(el('span', 'tool-card-category', category.name), el('span', '', { text: 'Paste text or file', file: 'Upload a file', multi: 'Multiple files', none: 'No file needed' }[tool.input]));
    open.append(badge, copy, details); open.addEventListener('click', () => navigateTool(tool.id));
    const star = el('button', `tool-favorite${favorite ? ' is-favorite' : ''}`); star.type = 'button'; star.dataset.favoriteTool = tool.id;
    star.append(icon('star')); star.setAttribute('aria-pressed', String(favorite)); star.setAttribute('aria-label', `${favorite ? 'Remove' : 'Add'} ${tool.name} ${favorite ? 'from' : 'to'} favorites`); star.title = favorite ? 'Remove favorite' : 'Add favorite'; star.addEventListener('click', () => toggleFavorite(tool, true));
    card.append(open, star); return card;
  }
  function renderCatalog() {
    const state = preferences.state, query = $('toolSearch').value.trim(), category = library.categories.find(c => c.id === libraryView);
    const matches = library.selectTools(tools, { view: libraryView, query, sort: state.sort }, state);
    $('directoryTitle').textContent = query ? 'Search results' : category?.name || { all: 'All tools', favorites: 'Favorites', recent: 'Recently used' }[libraryView];
    if (!$('toolDirectory').hidden) document.title = `${$('directoryTitle').textContent} — UltraSuperConverter`;
    $('directoryDescription').textContent = query ? 'Search across every category by tool, format, or task.' : category?.description || { all: 'Search, choose a category, or favorite the tools you use most.', favorites: 'Your saved tools, ready whenever you need them.', recent: 'Your last 12 successfully used tools. Only tool names are remembered.' }[libraryView];
    $('toolCount').textContent = `${matches.length} ${matches.length === 1 ? 'tool' : 'tools'}${query ? ' found' : libraryView === 'all' ? ' in 10 categories' : ''}`;
    $('clearRecent').hidden = libraryView !== 'recent' || !!query || !state.recent.length;
    $('toolSort').value = libraryView === 'recent' && !query ? 'recent' : state.sort;
    $('toolSort').disabled = busy || libraryView === 'recent' && !query;
    $('recentOrderOption').hidden = libraryView !== 'recent' || !!query;
    $('gridView').setAttribute('aria-pressed', String(state.display === 'grid')); $('listView').setAttribute('aria-pressed', String(state.display === 'list'));
    $('toolList').classList.toggle('compact-view', state.display === 'list'); $('toolList').replaceChildren();
    const grouped = libraryView === 'all' && !query && state.sort === 'category';
    if (grouped) {
      for (const category of library.categories) {
        const entries = matches.filter(tool => library.metadata[tool.id].category === category.id); if (!entries.length) continue;
        const section = el('section', `directory-group category-${category.id}`), heading = el('div', 'directory-group-heading'), title = el('h2');
        title.append(icon(category.icon), document.createTextNode(category.name)); heading.append(title, el('span', '', entries.length));
        const grid = el('div', 'tool-card-grid'); grid.append(...entries.map(toolCard)); section.append(heading, grid); $('toolList').append(section);
      }
    } else if (matches.length) { const grid = el('div', 'tool-card-grid'); grid.append(...matches.map(toolCard)); $('toolList').append(grid); }
    else {
      const empty = el('div', 'library-empty'); empty.append(icon(query ? 'search' : libraryView === 'favorites' ? 'star' : 'recent'));
      empty.append(el('h2', '', query ? 'No tools found' : libraryView === 'favorites' ? 'Make room for your favorites' : 'Your recent tools will appear here'));
      empty.append(el('p', '', query ? 'Try a name, format, or task like “compress PDF”.' : libraryView === 'favorites' ? 'Click the star on any tool to keep it a click away.' : 'Run a tool successfully and find it here next time.'));
      const action = el('button', 'outline-library-button', query ? 'Clear search' : 'Explore all tools'); action.type = 'button'; action.addEventListener('click', () => { if (query) { $('toolSearch').value = ''; renderCatalog(); $('toolSearch').focus(); } else navigateView('all'); }); empty.append(action); $('toolList').append(empty);
    }
    renderNavigation();
  }
  function showDirectory(view = 'all', focus = true) {
    libraryView = view; $('workbench').hidden = true; $('toolDirectory').hidden = false; renderCatalog();
    document.title = `${$('directoryTitle').textContent} — UltraSuperConverter`;
    if (focus) { window.scrollTo({ top: 0 }); $('directoryTitle').focus({ preventScroll: true }); }
  }
  function showWorkbench() {
    $('toolDirectory').hidden = true; $('workbench').hidden = false;
    const category = library.categoryOf(selected); $('currentToolIcon').className = `current-tool-icon category-${category.id}`; $('currentToolIcon').replaceChildren(icon(library.metadata[selected.id].icon));
    updateCurrentFavorite(); renderNavigation(); window.scrollTo({ top: 0 }); $('toolName').focus({ preventScroll: true });
    document.title = `${selected.name} — UltraSuperConverter`;
  }
  function chooseTool(id) {
    if (busy) return;
    const next = tools.find(t => t.id === id) || tools.find(t => t.id === 'text-case');
    if (selected?.id === next.id) { showWorkbench(); return; }
    const preservedText = selected?.input === 'text' && next.input === 'text' && !selected.sensitive && !next.sensitive ? $('toolText').value : '';
    selected = next;
    history.replaceState(null, '', `#${selected.id}`);
    $('toolGroup').textContent = library.categoryOf(selected).name.toUpperCase();
    $('toolName').textContent = selected.name;
    $('toolDescription').textContent = selected.description;
    $('openInWorkspace').href = `/workspace.html#${selected.id}`;
    $('openInWorkspace').hidden = !!selected.sensitive;
    $('sourceLabel').textContent = selected.input === 'text' ? 'TEXT OR FILE' : selected.input === 'multi' ? 'FILES IN ORDER' : 'YOUR FILE';
    $('targetLabel').textContent = selected.group === 'PDF' && selected.id !== 'pdf-metadata' ? 'PDF DOCUMENT' : 'CONVERTED FILE';
    $('toolFiles').accept = selected.accept === '*' ? '' : selected.accept;
    $('toolFiles').multiple = selected.input === 'multi' || selected.id === 'checksums';
    $('fileHelp').textContent = selected.input === 'multi' ? 'or drop files here · reorder below' : 'or drop a file here';
    $('textInputArea').hidden = selected.input !== 'text';
    $('fileDrop').hidden = selected.input === 'none';
    $('sensitiveNote').hidden = !selected.sensitive;
    $('caseActions').hidden = selected.id !== 'text-case';
    $('inputLimits').textContent = selected.input === 'none' ? 'No source file is needed. Set the options below.' : window.UTILITY_TOOLS.some(t => t.id === selected.id) ? selected.id === 'aes-encrypt' ? 'Pasted text: 1 MB. Binary files: 32 MB. Encrypted envelopes: 48 MB.' : 'Pasted utility text: 1 MB. Input files: up to 100 MB, with tool-specific limits shown in the description.' : 'Up to 20 files · 100 MB per file · 500 MB per batch. Text input: 10 MB.';
    $('loadExample').hidden = !selected.sample;
    $('toolText').value = preservedText;
    $('toolFiles').value = '';
    files = [];
    renderFiles();
    $('toolOptions').replaceChildren();
    for (const field of selected.fields) {
      const container = el('div', 'option');
      const label = el('label', '', field.label);
      label.htmlFor = `option-${field.key}`;
      const input = el(field.type === 'select' ? 'select' : field.type === 'textarea' ? 'textarea' : 'input');
      input.id = `option-${field.key}`;
      input.name = field.key;
      if (field.type === 'select') {
        for (const [value, title] of field.choices) {
          const option = el('option', '', title);
          option.value = value;
          input.append(option);
        }
      } else if (field.type === 'textarea') {
        input.maxLength = field.maxLength || 1000000;
        input.spellcheck = false;
        input.rows = field.key === 'other' ? 12 : 4;
        container.classList.add('option-wide');
      } else {
        input.type = field.type;
        if (field.type === 'number') {
          input.min = field.min; input.max = field.max; input.step = field.step;
          input.required = true;
        } else input.maxLength = field.maxLength || 2000;
        if (field.secret) input.autocomplete = 'off';
      }
      input.value = field.value;
      container.append(label, input);
      $('toolOptions').append(container);
    }
    $('optionsSection').hidden = !selected.fields.length;
    $('toolForm').classList.toggle('comparison-mode', ['text-diff', 'json-diff'].includes(selected.id));
    $('toolError').hidden = true;
    $('resultsSection').hidden = true;
    $('runStatus').textContent = 'Ready when you are.';
    $('runTool').textContent = selected.id === 'checksums' || selected.id === 'text-hash' ? 'Calculate hashes' : selected.input === 'none' ? 'Generate / run' : ['text-count', 'contrast-check'].includes(selected.id) ? 'Analyze' : selected.id.endsWith('diff') ? 'Compare texts' : 'Run tool';
    updateTextStats();
    renderCatalog();
    showWorkbench();
    document.title = `${selected.name} — UltraSuperConverter`;
  }
  function renderFiles() {
    $('fileList').replaceChildren();
    files.forEach((file, index) => {
      const row = el('li');
      row.append(el('span', 'filename', `${index + 1}. ${file.name}`), el('span', 'file-size', fileSizes(file.size)));
      for (const [symbol, label, action, disabled] of [
        ['↑', `Move ${file.name} up`, () => { [files[index - 1], files[index]] = [files[index], files[index - 1]]; renderFiles(); }, index === 0],
        ['↓', `Move ${file.name} down`, () => { [files[index + 1], files[index]] = [files[index], files[index + 1]]; renderFiles(); }, index === files.length - 1],
        ['×', `Remove ${file.name}`, () => { files.splice(index, 1); renderFiles(); }, false]
      ]) {
        if (files.length === 1 && symbol !== '×') continue;
        const button = el('button', '', symbol);
        button.type = 'button'; button.disabled = disabled || busy; button.setAttribute('aria-label', label);
        button.addEventListener('click', action);
        row.append(button);
      }
      $('fileList').append(row);
    });
  }
  function addFiles(incoming) {
    if (busy) return;
    const next = Array.from(incoming);
    if (!next.length) return;
    const multi = selected.input === 'multi' || selected.id === 'checksums';
    const candidates = multi ? [...files, ...next] : next;
    if (!multi && candidates.length > 1) return showError('This tool accepts one input file.');
    if (candidates.length > 20) return showError('Choose at most 20 files.');
    if (candidates.some(f => f.size > 100 * 1024 * 1024)) return showError('Each toolbox input file is limited to 100 MB.');
    if (candidates.reduce((n, f) => n + f.size, 0) > 500 * 1024 * 1024) return showError('A toolbox batch is limited to 500 MB total.');
    files = candidates;
    $('toolError').hidden = true;
    renderFiles();
  }
  function showError(message) {
    $('toolError').textContent = message;
    $('toolError').hidden = false;
  }
  function updateTextStats() {
    const text = $('toolText').value;
    $('liveTextStats').replaceChildren();
    if (selected?.input !== 'text') return;
    if (text.length > 100000) { $('liveTextStats').textContent = 'Live counts pause above 100,000 characters. Use Word & character counter for the full report.'; return; }
    const stats = window.TEXT_CORE.stats(text);
    for (const [label, value] of [['words', stats.words], ['characters', stats.characters], ['UTF-8 bytes', stats.utf8Bytes], ['lines', stats.lines]]) {
      const cell = el('span'); cell.append(el('strong', '', value.toLocaleString()), document.createTextNode(` ${label}`)); $('liveTextStats').append(cell);
    }
  }
  function renderRichView(view) {
    const box = el('div', 'result-view');
    if (view.type === 'stats') {
      box.classList.add('statistics-view');
      for (const [label, value] of [['Words', view.values.words], ['Characters', view.values.characters], ['Without spaces', view.values.charactersWithoutSpaces], ['UTF-8 bytes', view.values.utf8Bytes], ['Sentences', view.values.sentences], ['Paragraphs', view.values.paragraphs], ['Read time (seconds)', view.values.readingSeconds], ['Speak time (seconds)', view.values.speakingSeconds]]) {
        const cell = el('div'); cell.append(el('strong', '', value.toLocaleString()), el('span', '', label)); box.append(cell);
      }
    } else if (view.type === 'diff') {
      box.append(el('p', 'diff-key', `${view.identical ? 'Identical texts' : 'Changes found'} · +${view.added} added · −${view.removed} removed (${view.mode})`));
      const content = el('pre', 'diff-content');
      for (const chunk of view.chunks) { const node = el(chunk.type === 'added' ? 'ins' : chunk.type === 'removed' ? 'del' : 'span', `diff-${chunk.type}`, chunk.text); if (chunk.type !== 'unchanged') node.setAttribute('aria-label', `${chunk.type}: ${chunk.text}`); content.append(node); }
      box.append(content);
    } else if (view.type === 'hashes') {
      for (const [algorithm, digest] of Object.entries(view.hashes)) {
        const row = el('div', 'hash-row'), value = el('code', '', digest), copy = el('button', 'output-action', 'Copy hash'); copy.type = 'button';
        copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(digest); copy.textContent = 'Copied'; } catch (error) { showError(error.message); } });
        row.append(el('strong', '', algorithm.toUpperCase()), value, copy); box.append(row);
      }
    } else if (view.type === 'color') {
      const swatch = el('div', 'color-swatch', view.hex); swatch.style.backgroundColor = view.hex; swatch.style.color = '#ffffff'; swatch.style.textShadow = '0 1px 4px #000'; box.append(swatch);
    } else if (view.type === 'contrast') {
      const sample = el('div', 'contrast-sample', 'Readable text starts with contrast.'); sample.style.color = view.foreground; sample.style.backgroundColor = view.background;
      box.append(sample, el('p', '', `${view.displayRatio} · Normal text AA: ${view.normalTextAA ? 'Pass' : 'Fail'} · Large text AA: ${view.largeTextAA ? 'Pass' : 'Fail'}`));
    }
    return box;
  }
  function setBusy(value) {
    busy = value;
    $('toolForm').setAttribute('aria-busy', String(value));
    for (const control of $('toolForm').querySelectorAll('button,input,select,textarea')) control.disabled = value;
    $('browseTools').disabled = value;
    renderFiles(); renderCatalog();
  }
  function renderResults(data) {
    $('resultList').replaceChildren();
    for (const result of data.results) {
      const card = el('article', 'result-card');
      const header = el('header');
      const link = el('a', 'download-link', 'Download ↓');
      link.href = result.url; link.download = result.name;
      header.append(el('strong', '', result.name), el('small', '', fileSizes(result.bytes)), link);
      if (typeof result.preview === 'string' && result.bytes <= 10 * 1024 * 1024) {
        const copy = el('button', 'output-action', 'Copy'); copy.type = 'button';
        copy.addEventListener('click', async () => { try { const response = await fetch(result.url); if (!response.ok) throw new Error('The result expired. Run the tool again.'); await navigator.clipboard.writeText(await response.text()); copy.textContent = 'Copied'; } catch (error) { showError(error.message); } }); header.append(copy);
        if (!selected.sensitive && selected.input === 'text') {
          const reuse = el('button', 'output-action', 'Use as input'); reuse.type = 'button';
          reuse.addEventListener('click', async () => { try { const response = await fetch(result.url); if (!response.ok) throw new Error('The result expired.'); $('toolText').value = await response.text(); files = []; renderFiles(); updateTextStats(); $('toolText').focus(); } catch (error) { showError(error.message); } }); header.append(reuse);
        }
      }
      card.append(header);
      if (result.view) card.append(renderRichView(result.view));
      if (typeof result.preview === 'string') {
        const details = el('details'); details.open = data.results.length === 1 && !result.view;
        details.append(el('summary', '', result.preview.length >= 100000 ? 'Preview source (first 100,000 characters)' : 'Preview source'), el('pre', '', result.preview));
        card.append(details);
      } else if (/\.(png|jpe?g)$/i.test(result.name)) {
        const image = el('img'); image.src = result.url; image.alt = `Converted result: ${result.name}`;
        card.append(image);
      }
      $('resultList').append(card);
    }
    $('resultCount').textContent = `${data.results.length} ${data.results.length === 1 ? 'file' : 'files'} ready`;
    $('resultsSection').hidden = false;
    $('resultsSection').scrollIntoView({ block: 'nearest', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
  $('toolSearch').addEventListener('input', renderCatalog);
  $('toolSort').addEventListener('change', () => { preferences.setSort($('toolSort').value); renderCatalog(); });
  $('gridView').addEventListener('click', () => { preferences.setDisplay('grid'); renderCatalog(); });
  $('listView').addEventListener('click', () => { preferences.setDisplay('list'); renderCatalog(); });
  $('clearRecent').addEventListener('click', () => { preferences.clearRecent(); renderCatalog(); $('directoryTitle').focus(); });
  $('favoriteCurrent').addEventListener('click', () => { if (selected) toggleFavorite(selected); });
  $('browseTools').addEventListener('click', () => navigateView(libraryView, true));
  $('toolFiles').addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });
  for (const name of ['dragenter', 'dragover']) $('fileDrop').addEventListener(name, e => { e.preventDefault(); if (!busy) $('fileDrop').classList.add('dragging'); });
  for (const name of ['dragleave', 'drop']) $('fileDrop').addEventListener(name, e => { e.preventDefault(); $('fileDrop').classList.remove('dragging'); if (name === 'drop') addFiles(e.dataTransfer.files); });
  $('loadExample').addEventListener('click', () => { files = []; renderFiles(); $('toolText').value = selected.sample || ''; $('toolError').hidden = true; updateTextStats(); });
  let statsTimer;
  $('toolText').addEventListener('input', () => { clearTimeout(statsTimer); statsTimer = setTimeout(updateTextStats, 180); });
  for (const button of document.querySelectorAll('[data-case]')) button.addEventListener('click', () => { $('option-mode').value = button.dataset.case; $('toolForm').requestSubmit(); });
  $('toolForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    $('toolError').hidden = true;
    if (['file', 'multi'].includes(selected.input) && !files.length) return showError('Choose an input file first.');
    if (selected.input === 'text' && !files.length && !$('toolText').value && selected.id !== 'text-count') return showError('Paste some text or choose an input file.');
    const options = Object.fromEntries(selected.fields.map(field => [field.key, $(`option-${field.key}`).value]));
    let request;
    if (files.length) {
      const form = new FormData(); form.append('toolId', selected.id); form.append('text', $('toolText').value); form.append('options', JSON.stringify(options)); files.forEach(file => form.append('files', file));
      request = { method: 'POST', body: form };
    } else request = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ toolId: selected.id, text: $('toolText').value, options }) };
    setBusy(true);
    $('runStatus').textContent = 'Converting locally… Media tools may take a few minutes.';
    $('resultsSection').hidden = true;
    try {
      const response = await fetch('/api/toolbox/run', request);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Conversion failed. Check your input.');
      renderResults(data);
      preferences.recordUse(selected.id);
      $('runStatus').textContent = 'Done. Your downloads are ready below.';
    } catch (error) {
      showError(error.message === 'Failed to fetch' ? 'Cannot reach the local server. Start UltraSuperConverter and try again.' : error.message);
      $('runStatus').textContent = 'Update your input or settings and try again.';
    } finally { setBusy(false); }
  });
  function route() {
    const hash = location.hash.slice(1);
    if (busy) { history.replaceState(null, '', `#${selected.id}`); return; }
    if (tools.some(t => t.id === hash)) chooseTool(hash);
    else { const category = hash.startsWith('category-') ? hash.slice('category-'.length) : ''; showDirectory(['all', 'favorites', 'recent'].includes(hash) ? hash : library.categories.some(c => c.id === category) ? category : 'all'); }
  }
  $('searchIcon').append(icon('search')); $('gridView').append(icon('grid')); $('listView').append(icon('list'));
  $('browseTools').append(icon('back'), document.createTextNode('Browse tools'));
  window.addEventListener('hashchange', route);
  window.addEventListener('storage', event => { if (event.key === library.STORAGE_KEY || event.key === null) { preferences.reload(); renderCatalog(); updateCurrentFavorite(); } });
  document.addEventListener('keydown', event => {
    const shortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k';
    const editable = event.target.closest?.('input,textarea,select,[contenteditable="true"]');
    if (busy || event.isComposing || !shortcut && (editable || event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey)) return;
    event.preventDefault(); showDirectory(libraryView, false); history.pushState(null, '', `#${viewHash(libraryView)}`); $('toolSearch').focus(); $('toolSearch').select();
  });
  const mobileNavigation = window.matchMedia('(max-width: 860px)');
  $('categoryMenu').open = !mobileNavigation.matches;
  mobileNavigation.addEventListener('change', () => { $('categoryMenu').open = !mobileNavigation.matches; });
  route();
})();
