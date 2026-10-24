(() => {
  'use strict';
  const tools = window.CONVERTER_TOOLS;
  const $ = id => document.getElementById(id);
  let selected;
  let files = [];
  let busy = false;
  const fileSizes = n => n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
  const el = (tag, className, content) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  };
  function renderCatalog() {
    const query = $('toolSearch').value.trim().toLowerCase();
    const matches = tools.filter(tool => `${tool.name} ${tool.group} ${tool.description}`.toLowerCase().includes(query));
    $('toolList').replaceChildren();
    for (const group of [...new Set(matches.map(t => t.group))]) {
      const section = el('section', 'tool-group');
      section.append(el('h2', '', group));
      for (const tool of matches.filter(t => t.group === group)) {
        const button = el('button', 'tool-nav-button', tool.name);
        button.type = 'button';
        button.dataset.tool = tool.id;
        button.disabled = busy;
        if (tool.id === selected?.id) button.setAttribute('aria-current', 'true');
        button.addEventListener('click', () => chooseTool(tool.id));
        section.append(button);
      }
      $('toolList').append(section);
    }
    if (!matches.length) $('toolList').append(el('p', 'empty-search', 'No matching tools. Try PDF, audio, text, or JSON.'));
    $('toolCount').textContent = `${matches.length} of ${tools.length} tools · ${new Set(matches.map(t => t.group)).size} categories`;
  }
  function chooseTool(id) {
    if (busy) return;
    selected = tools.find(t => t.id === id) || tools[0];
    history.replaceState(null, '', `#${selected.id}`);
    $('toolGroup').textContent = selected.group.toUpperCase();
    $('toolName').textContent = selected.name;
    $('toolDescription').textContent = selected.description;
    $('sourceLabel').textContent = selected.input === 'text' ? 'TEXT OR FILE' : selected.input === 'multi' ? 'FILES IN ORDER' : 'YOUR FILE';
    $('targetLabel').textContent = selected.group === 'PDF' && selected.id !== 'pdf-metadata' ? 'PDF DOCUMENT' : 'CONVERTED FILE';
    $('toolFiles').accept = selected.accept === '*' ? '' : selected.accept;
    $('toolFiles').multiple = selected.input === 'multi' || selected.id === 'checksums';
    $('fileHelp').textContent = selected.input === 'multi' ? 'or drop files here · reorder below' : 'or drop a file here';
    $('textInputArea').hidden = selected.input !== 'text';
    $('loadExample').hidden = !selected.sample;
    $('toolText').value = '';
    $('toolFiles').value = '';
    files = [];
    renderFiles();
    $('toolOptions').replaceChildren();
    for (const field of selected.fields) {
      const container = el('div', 'option');
      const label = el('label', '', field.label);
      label.htmlFor = `option-${field.key}`;
      const input = el(field.type === 'select' ? 'select' : 'input');
      input.id = `option-${field.key}`;
      input.name = field.key;
      if (field.type === 'select') {
        for (const [value, title] of field.choices) {
          const option = el('option', '', title);
          option.value = value;
          input.append(option);
        }
      } else {
        input.type = field.type;
        if (field.type === 'number') {
          input.min = field.min; input.max = field.max; input.step = field.step;
          input.required = true;
        } else input.maxLength = 2000;
      }
      input.value = field.value;
      container.append(label, input);
      $('toolOptions').append(container);
    }
    $('optionsSection').hidden = !selected.fields.length;
    $('toolError').hidden = true;
    $('resultsSection').hidden = true;
    $('runStatus').textContent = 'Ready when you are.';
    $('runTool').textContent = selected.id === 'checksums' ? 'Calculate checksums' : selected.id === 'pdf-metadata' ? 'Run metadata tool' : 'Convert';
    renderCatalog();
    document.title = `${selected.name} — UltraSuperConvertor`;
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
  function setBusy(value) {
    busy = value;
    $('toolForm').setAttribute('aria-busy', String(value));
    for (const control of $('toolForm').querySelectorAll('button,input,select,textarea')) control.disabled = value;
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
      card.append(header);
      if (typeof result.preview === 'string') {
        const details = el('details'); details.open = data.results.length === 1;
        details.append(el('summary', '', 'Preview source'), el('pre', '', result.preview));
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
  $('toolFiles').addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });
  for (const name of ['dragenter', 'dragover']) $('fileDrop').addEventListener(name, e => { e.preventDefault(); if (!busy) $('fileDrop').classList.add('dragging'); });
  for (const name of ['dragleave', 'drop']) $('fileDrop').addEventListener(name, e => { e.preventDefault(); $('fileDrop').classList.remove('dragging'); if (name === 'drop') addFiles(e.dataTransfer.files); });
  $('loadExample').addEventListener('click', () => { files = []; renderFiles(); $('toolText').value = selected.sample || ''; $('toolError').hidden = true; });
  $('toolForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    $('toolError').hidden = true;
    if (selected.input !== 'text' && !files.length) return showError('Choose an input file first.');
    if (selected.input === 'text' && !files.length && !$('toolText').value) return showError('Paste some text or choose an input file.');
    const form = new FormData();
    form.append('toolId', selected.id);
    form.append('text', $('toolText').value);
    form.append('options', JSON.stringify(Object.fromEntries(selected.fields.map(field => [field.key, $(`option-${field.key}`).value]))));
    files.forEach(file => form.append('files', file));
    setBusy(true);
    $('runStatus').textContent = 'Converting locally… Media tools may take a few minutes.';
    $('resultsSection').hidden = true;
    try {
      const response = await fetch('/api/toolbox/run', { method: 'POST', body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Conversion failed. Check your input.');
      renderResults(data);
      $('runStatus').textContent = 'Done. Your downloads are ready below.';
    } catch (error) {
      showError(error.message === 'Failed to fetch' ? 'Cannot reach the local server. Start UltraSuperConvertor and try again.' : error.message);
      $('runStatus').textContent = 'Update your input or settings and try again.';
    } finally { setBusy(false); }
  });
  window.addEventListener('hashchange', () => chooseTool(location.hash.slice(1)));
  chooseTool(location.hash.slice(1));
})();
