(function (root) {
  'use strict';
  const STORAGE_KEY = 'usc-tool-library-v1';
  const categories = [
    { id: 'text', name: 'Text & writing', icon: 'text', description: 'Format, count, compare and clean up words.', ids: ['markdown-html', 'html-text', 'text-case', 'text-count', 'text-clean', 'text-sort', 'text-dedupe', 'text-replace', 'text-diff', 'text-slug', 'text-reverse', 'text-number', 'text-wrap', 'text-truncate', 'unicode-normalize', 'text-extract', 'word-frequency'] },
    { id: 'pdf', name: 'PDF tools', icon: 'pdf', description: 'Compress, combine, extract and prepare documents.', ids: ['images-pdf', 'pdf-merge', 'pdf-split', 'pdf-rotate', 'pdf-metadata', 'pdf-render', 'pdf-text', 'pdf-watermark', 'pdf-number', 'pdf-nup', 'pdf-stamp', 'pdf-compress', 'pdf-blank', 'pdf-resize', 'pdf-grayscale'] },
    { id: 'images', name: 'Images & design', icon: 'image', description: 'Build image assets, read QR codes and work with color.', ids: ['photo-sheet', 'responsive-pack', 'sprite-atlas', 'qr-decode', 'qr-generate', 'color-convert', 'contrast-check'] },
    { id: 'video', name: 'Video & subtitles', icon: 'video', description: 'Edit clips, assemble videos and adjust subtitles.', ids: ['video-frame', 'video-contact', 'video-reverse', 'video-transform', 'video-audio', 'video-join', 'video-grid', 'slideshow', 'subtitle-convert', 'subtitle-shift'] },
    { id: 'audio', name: 'Audio tools', icon: 'audio', description: 'Mix, master, join and reshape recordings.', ids: ['audio-waveform', 'audio-fade', 'audio-silence', 'audio-split', 'audio-join', 'audio-mix', 'podcast-master'] },
    { id: 'documents', name: 'Documents & sheets', icon: 'document', description: 'Convert Word files and organize spreadsheets.', ids: ['docx-extract', 'markdown-docx', 'spreadsheet-convert', 'spreadsheet-clean', 'spreadsheet-merge'] },
    { id: 'developer', name: 'Data & developer', icon: 'code', description: 'Transform structured data, format code and inspect URLs.', ids: ['json-csv', 'json-yaml', 'json-xml', 'csv-tsv', 'json-format', 'regex-lab', 'identifier-case', 'json-diff', 'json-pointer', 'json-flatten', 'json-lines', 'csv-query', 'sql-format', 'code-format', 'css-minify', 'javascript-minify', 'url-inspect', 'uuid-generate'] },
    { id: 'security', name: 'Hashes & security', icon: 'shield', description: 'Hash, encrypt, generate secrets and inspect certificates.', ids: ['checksums', 'jwt-inspect', 'text-hash', 'hmac', 'aes-encrypt', 'password-generate', 'token-generate', 'scrypt-password', 'bcrypt-password', 'certificate-inspect'] },
    { id: 'encoding', name: 'Encoding & archives', icon: 'archive', description: 'Encode text and bytes, compress files and open ZIPs.', ids: ['base64', 'url-codec', 'html-entities', 'text-encoding', 'gzip', 'archive-explorer', 'text-bytes', 'morse-code', 'caesar-cipher'] },
    { id: 'numbers', name: 'Numbers & dates', icon: 'calculator', description: 'Convert measurements, timestamps and time zones.', ids: ['unit-convert', 'timestamp-convert'] }
  ];
  // Small, local SVG glyphs. No icon fonts or external requests are needed.
  const icons = {
    grid: { paths: ['M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z'] },
    list: { paths: ['M8 5h13 M8 12h13 M8 19h13 M3 5h.01 M3 12h.01 M3 19h.01'] },
    star: { paths: ['m12 3 2.8 5.7 6.3.9-4.6 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.6l6.2-.9Z'] },
    recent: { paths: ['M3 11a9 9 0 1 1 2.6 7 M3 4v7h7 M12 7v5l3 2'] },
    search: { paths: ['M21 21l-5-5'], circles: [[10.5, 10.5, 6.5]] },
    back: { paths: ['m10 5-7 7 7 7 M3 12h18'] },
    close: { paths: ['m6 6 12 12 M6 18 18 6'] },
    chevron: { paths: ['m9 5 7 7-7 7'] },
    text: { label: 'Aa' },
    count: { paths: ['M4 4h16 M4 10h10 M4 16h7 M17 13v8 M14 16l3-3 3 3'] },
    clean: { paths: ['m14 3 7 7-10 10H5l-3-3Z M9 8l7 7 M12 20h9'] },
    sort: { paths: ['M4 5h13 M4 11h9 M4 17h5 M19 10v11 m-3-3 3 3 3-3'] },
    copy: { paths: ['M9 8h11v13H9z M15 8V3H4v13h5'] },
    replace: { paths: ['M4 7h15 m-3-3 3 3-3 3 M20 17H5 m3-3-3 3 3 3'] },
    compare: { paths: ['M3 4h7v16H3z M14 4h7v16h-7z M6 9h1 M6 13h1 M17 9h1 M16 13h3'] },
    link: { paths: ['m10 14 4-4 M8 16l-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0 M16 8l2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0'], viewBox: '-1 -1 27 27' },
    reverse: { paths: ['M4 6h16 M4 12h10 M4 18h16 m0-9-3 3 3 3 M17 12h5'] },
    numbered: { paths: ['M9 5h12 M9 12h12 M9 19h12 M3 3v4 M2 10h3v2H2v2h3 M2 17h3v4H2 M3 19h2'] },
    wrap: { paths: ['M3 5h18 M3 10h13a4 4 0 0 1 0 8h-5 m3-3-3 3 3 3 M3 15h4 M3 20h4'] },
    truncate: { paths: ['M3 6h18 M3 12h12 M3 18h6 M14 18h.01 M18 18h.01 M22 18h.01'] },
    unicode: { label: 'Ü' },
    extract: { paths: ['M4 3h12l4 4v7 M4 3v18h7 M8 8h6 M8 12h4 M16 13v8 m-4-4 4 4 4-4'] },
    chart: { paths: ['M4 20V10h4v10 M10 20V4h4v16 M16 20v-7h4v7 M2 21h20'] },
    code: { paths: ['m8 5-6 7 6 7 m8-14 6 7-6 7 m-3-16-2 18'] },
    json: { label: '{}' },
    xml: { label: '</>' },
    table: { paths: ['M3 4h18v16H3z M3 9h18 M9 4v16 M15 9v11 M3 14h18'] },
    regex: { label: '.*' },
    database: { paths: ['M4 6v12c0 4 16 4 16 0V6 M4 12c0 4 16 4 16 0'], ellipses: [[12, 6, 8, 3]] },
    pdf: { paths: ['M5 3h9l5 5v13H5z M14 3v6h5 M8 14h8 M8 18h5'] },
    merge: { paths: ['M5 3v5c0 4 7 2 7 7v6 M19 3v5c0 4-7 2-7 7 m-3 3 3 3 3-3'] },
    split: { paths: ['M12 21v-8 M12 13 5 6 M12 13l7-7 M2 8V3h5 M17 3h5v5'] },
    rotate: { paths: ['M4 10a8 8 0 1 1 1 8 M4 3v7h7'] },
    info: { paths: ['M12 11v6 M12 7h.01'], circles: [[12, 12, 9]] },
    image: { paths: ['M3 3h18v18H3z m0 14 5-5 4 4 4-6 5 7'], circles: [[8, 8, 1.5]] },
    stamp: { paths: ['M8 3h8v7l3 5v3H5v-3l3-5z M3 21h18'] },
    compress: { paths: ['M3 3h6v6 M9 9 3 3 M21 3h-6v6 M15 9l6-6 M3 21h6v-6 M9 15l-6 6 M21 21h-6v-6 M15 15l6 6'] },
    resize: { paths: ['M9 3H3v6 M3 3l7 7 M15 21h6v-6 M21 21l-7-7 M14 3h7v7 M3 14v7h7'] },
    grayscale: { paths: ['M12 3v18 M12 3a9 9 0 0 1 0 18Z'], circles: [[12, 12, 9]] },
    video: { paths: ['M3 5h13v14H3z M16 10l5-4v12l-5-4'] },
    play: { paths: ['m9 6 9 6-9 6Z'], circles: [[12, 12, 10]] },
    subtitle: { paths: ['M3 5h18v14H3z M6 11h5 M14 11h4 M6 15h3 M12 15h6'] },
    clock: { paths: ['M12 6v6l4 2'], circles: [[12, 12, 9]] },
    audio: { paths: ['M4 9v6 M8 5v14 M12 2v20 M16 5v14 M20 9v6'] },
    fade: { paths: ['M3 19 21 5 M5 15v4 M9 11v8 M13 8v11 M17 5v14 M21 3v16'] },
    mute: { paths: ['M11 4 5 9H2v6h3l6 5z M16 9l6 6 M16 15l6-6'] },
    sliders: { paths: ['M5 3v8 M5 15v6 M12 3v3 M12 10v11 M19 3v12 M19 19v2 M2 11h6v4H2z M9 6h6v4H9z M16 15h6v4h-6z'] },
    document: { paths: ['M5 3h10l4 4v14H5z M9 11h6 M9 15h6 M9 18h4'] },
    archive: { paths: ['M3 4h18v5H3z M5 9v12h14V9 M12 9v2 M12 14v2 M11 18h2'] },
    binary: { label: '01' },
    morse: { paths: ['M3 8h.01 M8 8h.01 M13 8h7 M3 16h7 M15 16h.01 M20 16h.01'] },
    shield: { paths: ['M12 3 3 6v6c0 5 9 9 9 9s9-4 9-9V6Z m-4 9 3 3 5-6'] },
    hash: { paths: ['m10 3-4 18 M18 3l-4 18 M3 9h18 M2 15h18'] },
    key: { paths: ['m10 14 10-10 M15 9l3 3 M18 6l3 3'], circles: [[7, 17, 4]] },
    lock: { paths: ['M5 10h14v11H5z M8 10V7a4 4 0 0 1 8 0v3 M12 15v3'] },
    password: { paths: ['M3 6h18v12H3z M6 12h.01 M10 12h.01 M14 12h.01 M18 12h.01'] },
    certificate: { paths: ['M5 3h14v12 M5 3v17h6 M9 7h6 M9 11h3 M15 17l-2 5 4-2 4 2-2-5'], circles: [[17, 14, 4]] },
    random: { paths: ['M3 5h3c5 0 7 14 12 14h3 m-3-3 3 3-3 3 M3 19h3c2 0 3-2 4-5 M14 9c1-2 2-4 4-4h3 m-3-3 3 3-3 3'] },
    qr: { paths: ['M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h3v3h4v4h-7z M20 14h1 M6 6h1 M17 6h1 M6 17h1'] },
    palette: { paths: ['M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 1-4c-2-1-1-3 1-3h3a4 4 0 0 0 3-4 9 9 0 0 0-9-7Z'], circles: [[7, 10, 1], [11, 7, 1], [16, 8, 1], [7, 15, 1]] },
    contrast: { paths: ['M12 3v18 M12 3a9 9 0 0 1 0 18Z'], circles: [[12, 12, 9]] },
    calculator: { paths: ['M5 3h14v18H5z M8 6h8v4H8z M8 14h1 M15 14h1 M8 18h1 M15 18h1'] }
  };
  const iconTools = {
    text: ['text-case', 'identifier-case'], count: ['text-count'], clean: ['text-clean', 'spreadsheet-clean'], sort: ['text-sort'], copy: ['text-dedupe'], replace: ['text-replace'], compare: ['text-diff', 'json-diff'], link: ['text-slug', 'url-codec', 'url-inspect'], reverse: ['text-reverse', 'video-reverse'], numbered: ['text-number', 'pdf-number'], wrap: ['text-wrap'], truncate: ['text-truncate'], unicode: ['unicode-normalize', 'text-encoding'], extract: ['text-extract', 'pdf-text', 'docx-extract'], chart: ['word-frequency'], code: ['html-text', 'code-format', 'css-minify', 'javascript-minify'], xml: ['markdown-html', 'json-xml', 'html-entities'], json: ['json-format', 'json-yaml', 'json-pointer', 'json-flatten', 'json-lines'], table: ['json-csv', 'csv-tsv', 'csv-query', 'spreadsheet-convert'], regex: ['regex-lab'], database: ['sql-format'], pdf: ['images-pdf'], merge: ['pdf-merge', 'spreadsheet-merge', 'video-join', 'audio-join'], split: ['pdf-split', 'audio-split'], rotate: ['pdf-rotate', 'video-transform'], info: ['pdf-metadata', 'jwt-inspect'], image: ['pdf-render', 'video-frame', 'photo-sheet', 'responsive-pack', 'sprite-atlas'], stamp: ['pdf-watermark', 'pdf-stamp'], grid: ['pdf-nup', 'video-contact', 'video-grid'], compress: ['pdf-compress', 'gzip'], cleanPdf: ['pdf-blank'], resize: ['pdf-resize'], grayscale: ['pdf-grayscale'], video: ['slideshow'], subtitle: ['subtitle-convert'], clock: ['subtitle-shift', 'timestamp-convert'], audio: ['video-audio', 'audio-waveform'], fade: ['audio-fade'], mute: ['audio-silence'], sliders: ['audio-mix', 'podcast-master'], document: ['markdown-docx'], archive: ['archive-explorer'], binary: ['base64', 'text-bytes'], morse: ['morse-code'], random: ['caesar-cipher', 'uuid-generate', 'token-generate'], hash: ['checksums', 'text-hash'], key: ['hmac', 'scrypt-password', 'bcrypt-password'], lock: ['aes-encrypt'], password: ['password-generate'], certificate: ['certificate-inspect'], qr: ['qr-generate', 'qr-decode'], palette: ['color-convert'], contrast: ['contrast-check'], calculator: ['unit-convert']
  };
  icons.cleanPdf = { paths: [...icons.pdf.paths, 'm15 18 2 2 4-5'] };
  const metadata = Object.create(null);
  for (const category of categories) for (const id of category.ids) {
    if (metadata[id]) throw new Error(`Duplicate library category for ${id}`);
    metadata[id] = { category: category.id, icon: category.icon };
  }
  for (const [icon, ids] of Object.entries(iconTools)) for (const id of ids) {
    if (!metadata[id] || !icons[icon]) throw new Error(`Invalid library icon mapping: ${id}`);
    metadata[id].icon = icon;
  }
  const aliases = {
    'text-case': 'uppercase lower case capitalize sentence title case change case', 'text-count': 'word count character count letter count reading time', 'text-dedupe': 'unique lines duplicates distinct', 'text-diff': 'compare difference checker side by side', 'json-diff': 'compare objects difference checker', 'pdf-compress': 'reduce pdf size shrink smaller optimize', 'archive-explorer': 'unzip extract archive zip', 'aes-encrypt': 'encrypt decrypt password encryption', 'text-hash': 'md5 sha256 sha512 checksum hash', 'qr-decode': 'scan read qr barcode', 'color-convert': 'colour color hex rgb hsl cmyk', 'contrast-check': 'colour color wcag accessibility', 'markdown-docx': 'word document docx', 'docx-extract': 'word document docx html text', 'uuid-generate': 'guid identifier random uuid'
  };
  function categoryOf(tool) { return categories.find(c => c.id === metadata[tool.id]?.category); }
  function createPreferences(tools, storage) {
    const valid = new Set(tools.map(t => t.id));
    let data, available = true;
    const unique = (values, max) => [...new Set(Array.isArray(values) ? values.filter(id => typeof id === 'string' && valid.has(id)) : [])].slice(0, max);
    function normalize(value) { return { version: 1, favorites: unique(value?.favorites, tools.length), recent: unique(value?.recent, 12), display: value?.display === 'list' ? 'list' : 'grid', sort: value?.sort === 'name' ? 'name' : 'category' }; }
    function reload() {
      let raw; try { raw = storage.getItem(STORAGE_KEY); available = true; } catch (_) { data = normalize(null); available = false; return; }
      try { data = normalize(JSON.parse(raw || 'null')); } catch (_) { data = normalize(null); }
    }
    function persist() { try { storage.setItem(STORAGE_KEY, JSON.stringify(data)); available = true; } catch (_) { available = false; } }
    reload();
    return {
      get state() { return { ...data, favorites: [...data.favorites], recent: [...data.recent] }; },
      get available() { return available; }, reload,
      toggleFavorite(id) { if (!valid.has(id)) return; data.favorites = data.favorites.includes(id) ? data.favorites.filter(v => v !== id) : [...data.favorites, id]; persist(); },
      recordUse(id) { if (!valid.has(id)) return; data.recent = [id, ...data.recent.filter(v => v !== id)].slice(0, 12); persist(); },
      clearRecent() { data.recent = []; persist(); },
      setDisplay(value) { if (['grid', 'list'].includes(value)) { data.display = value; persist(); } },
      setSort(value) { if (['category', 'name'].includes(value)) { data.sort = value; persist(); } }
    };
  }
  function selectTools(tools, { view = 'all', query = '', sort = 'category' } = {}, preferences = { favorites: [], recent: [] }) {
    const terms = query.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().trim().split(/\s+/).filter(Boolean);
    let result = tools.filter(tool => {
      if (terms.length) {
        const haystack = `${tool.name} ${tool.description} ${tool.id.replace(/-/g, ' ')} ${categoryOf(tool)?.name || ''} ${aliases[tool.id] || ''}`.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
        return terms.every(term => haystack.includes(term));
      }
      if (view === 'favorites') return preferences.favorites.includes(tool.id);
      if (view === 'recent') return preferences.recent.includes(tool.id);
      return view === 'all' || metadata[tool.id]?.category === view;
    });
    if (!terms.length && view === 'recent') return result.sort((a, b) => preferences.recent.indexOf(a.id) - preferences.recent.indexOf(b.id));
    const rank = tool => { const name = tool.name.toLowerCase(), id = tool.id.replace(/-/g, ' '); return terms.reduce((score, term) => score + (name.startsWith(term) ? 5 : name.includes(term) ? 3 : id.includes(term) ? 2 : 0), 0); };
    result.sort((a, b) => terms.length && sort !== 'name' ? rank(b) - rank(a) || a.name.localeCompare(b.name) : sort === 'category' ? categories.findIndex(c => c.id === metadata[a.id]?.category) - categories.findIndex(c => c.id === metadata[b.id]?.category) || a.name.localeCompare(b.name) : a.name.localeCompare(b.name));
    return result;
  }
  const api = { STORAGE_KEY, categories, metadata, icons, aliases, categoryOf, createPreferences, selectTools };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TOOL_LIBRARY = api;
})(typeof window === 'object' ? window : globalThis);
