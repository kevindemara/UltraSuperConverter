/* ==========================================================================
   ULTRASUPERCONVERTOR // QUANTUM MEDIA FRONTEND CONTROLLER
   ========================================================================== */

(() => {
  'use strict';

  // ---- State ----
  let currentPreset = 'web-ultra';
  let serverPid = '--';
  const itemsMap = new Map(); // id -> item object

  // ---- Preset Configurations ----
  const PRESETS = {
    'web-ultra': {
      badge: 'WEB ULTRA',
      imageFormat: 'webp',
      videoFormat: 'mp4',
      quality: 80,
      crf: 26,
      resizeMode: 'maxDimension',
      maxDimension: 1920,
      videoResolution: '1080',
      stripMetadata: true,
      progressive: true,
      lossless: false,
      sharpen: false,
      targetSizeKB: '',
      targetSizeMB: '',
      fps: 'original',
      audioMode: 'keep',
      normalizeAudio: false
    },
    'social-hd': {
      badge: 'SOCIAL 1080P',
      imageFormat: 'jpg',
      videoFormat: 'mp4',
      quality: 88,
      crf: 21,
      resizeMode: 'maxDimension',
      maxDimension: 1920,
      videoResolution: '1080',
      stripMetadata: true,
      progressive: true,
      lossless: false,
      sharpen: true,
      targetSizeKB: '',
      targetSizeMB: '',
      fps: '60',
      audioMode: 'keep',
      normalizeAudio: true
    },
    'discord-chat': {
      badge: '< 8MB TARGET',
      imageFormat: 'webp',
      videoFormat: 'mp4',
      quality: 75,
      crf: 28,
      resizeMode: 'maxDimension',
      maxDimension: 1600,
      videoResolution: '720',
      stripMetadata: true,
      progressive: true,
      lossless: false,
      sharpen: false,
      targetSizeKB: '950',
      targetSizeMB: '7.5',
      fps: '30',
      audioMode: 'keep',
      normalizeAudio: false
    },
    'email-light': {
      badge: 'EMAIL COMPACT',
      imageFormat: 'webp',
      videoFormat: 'mp4',
      quality: 70,
      crf: 30,
      resizeMode: 'maxDimension',
      maxDimension: 1280,
      videoResolution: '720',
      stripMetadata: true,
      progressive: true,
      lossless: false,
      sharpen: false,
      targetSizeKB: '400',
      targetSizeMB: '4',
      fps: '30',
      audioMode: 'keep',
      normalizeAudio: false
    },
    'ecommerce': {
      badge: '1:1 STUDIO',
      imageFormat: 'webp',
      videoFormat: 'mp4',
      quality: 90,
      crf: 22,
      resizeMode: 'dimensions',
      width: 1600,
      height: 1600,
      fitMode: 'contain',
      videoResolution: '1080',
      stripMetadata: true,
      progressive: true,
      lossless: false,
      sharpen: true,
      targetSizeKB: '',
      targetSizeMB: '',
      fps: 'original',
      audioMode: 'keep',
      normalizeAudio: false
    },
    'nextgen-avif': {
      badge: 'AVIF / WEBM',
      imageFormat: 'avif',
      videoFormat: 'webm',
      quality: 76,
      crf: 28,
      resizeMode: 'maxDimension',
      maxDimension: 1920,
      videoResolution: '1080',
      stripMetadata: true,
      progressive: true,
      lossless: false,
      sharpen: false,
      targetSizeKB: '',
      targetSizeMB: '',
      fps: 'original',
      audioMode: 'keep',
      normalizeAudio: false
    },
    'archival-master': {
      badge: 'ARCHIVAL PRO',
      imageFormat: 'png',
      videoFormat: 'mkv',
      quality: 100,
      crf: 15,
      resizeMode: 'none',
      maxDimension: 4096,
      videoResolution: 'original',
      stripMetadata: false,
      progressive: true,
      lossless: true,
      sharpen: false,
      targetSizeKB: '',
      targetSizeMB: '',
      fps: 'original',
      audioMode: 'keep',
      normalizeAudio: false
    },
    'video-gif': {
      badge: 'VIDEO TO GIF',
      imageFormat: 'gif',
      videoFormat: 'gif',
      quality: 80,
      crf: 26,
      resizeMode: 'maxDimension',
      maxDimension: 640,
      videoResolution: '480',
      stripMetadata: true,
      progressive: true,
      lossless: false,
      sharpen: false,
      targetSizeKB: '',
      targetSizeMB: '',
      fps: '15',
      audioMode: 'mute',
      normalizeAudio: false
    },
    'audio-extract': {
      badge: 'AUDIO EXTRACT',
      imageFormat: 'webp',
      videoFormat: 'mp3',
      quality: 85,
      crf: 24,
      resizeMode: 'none',
      maxDimension: 1920,
      videoResolution: 'original',
      stripMetadata: false,
      progressive: true,
      lossless: false,
      sharpen: false,
      targetSizeKB: '',
      targetSizeMB: '',
      fps: 'original',
      audioMode: 'extract',
      normalizeAudio: true
    },
    'thumbnail-micro': {
      badge: '480PX MICRO',
      imageFormat: 'webp',
      videoFormat: 'mp4',
      quality: 68,
      crf: 31,
      resizeMode: 'maxDimension',
      maxDimension: 480,
      videoResolution: '480',
      stripMetadata: true,
      progressive: true,
      lossless: false,
      sharpen: true,
      targetSizeKB: '80',
      targetSizeMB: '1.5',
      fps: '24',
      audioMode: 'keep',
      normalizeAudio: false
    }
  };

  // ---- Discrete Display Transition Helper ----
  let supportsDisplayTransition;
  function canTransitionDisplay() {
    if (supportsDisplayTransition !== undefined) return supportsDisplayTransition;
    if (!window.CSS?.supports?.('transition-behavior', 'allow-discrete') || !document.body) {
      return false;
    }
    const probe = document.createElement('div');
    probe.style.cssText = 'transition: display 1s allow-discrete !important; display: block;';
    document.body.appendChild(probe);
    getComputedStyle(probe).display;
    probe.style.display = 'none';
    supportsDisplayTransition = getComputedStyle(probe).display === 'block';
    probe.remove();
    return supportsDisplayTransition;
  }

  async function hideElement(el) {
    if (canTransitionDisplay()) {
      el.hidden = true;
    } else {
      el.setAttribute('data-closing', '');
    }
    const animations = el.getAnimations();
    if (animations.length > 0) {
      await Promise.race([
        Promise.allSettled(animations.map((a) => a.finished)),
        new Promise((r) => setTimeout(r, 2000))
      ]);
    }
    if (el.hasAttribute('data-closing')) {
      el.removeAttribute('data-closing');
      el.hidden = true;
    }
  }

  async function removeElement(el) {
    await hideElement(el);
    el.remove();
  }

  // ---- Dialog Light-Dismiss Helper ----
  function setupDialogLightDismiss(dialog) {
    if (!dialog) return;
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      dialog.addEventListener('click', (event) => {
        if (event.target !== dialog) return;
        const rect = dialog.getBoundingClientRect();
        const isDialogContent =
          rect.top <= event.clientY &&
          event.clientY <= rect.top + rect.height &&
          rect.left <= event.clientX &&
          event.clientX <= rect.left + rect.width;
        if (isDialogContent) return;
        dialog.close();
      });
    }
  }

  // ---- Format Bytes Helper ----
  function formatBytes(bytes) {
    if (bytes === undefined || bytes === null || isNaN(bytes)) return '0 B';
    const abs = Math.abs(bytes);
    if (abs < 1024) return `${bytes} B`;
    if (abs < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  // ---- DOM References ----
  const presetCards = document.querySelectorAll('.preset-card');
  const activePresetBadge = document.getElementById('activePresetBadge');
  const imageFormatEl = document.getElementById('imageFormat');
  const videoFormatEl = document.getElementById('videoFormat');
  const qualitySlider = document.getElementById('qualitySlider');
  const qualityValue = document.getElementById('qualityValue');
  const crfSlider = document.getElementById('crfSlider');
  const crfValue = document.getElementById('crfValue');
  const resizeModeEl = document.getElementById('resizeMode');
  const resizeMaxDimBox = document.getElementById('resizeMaxDimBox');
  const resizeExactBox = document.getElementById('resizeExactBox');
  const resizeScaleBox = document.getElementById('resizeScaleBox');
  const maxDimensionEl = document.getElementById('maxDimension');
  const videoResolutionEl = document.getElementById('videoResolution');
  const inputWidthEl = document.getElementById('inputWidth');
  const inputHeightEl = document.getElementById('inputHeight');
  const fitModeEl = document.getElementById('fitMode');
  const scaleSlider = document.getElementById('scaleSlider');
  const scaleValue = document.getElementById('scaleValue');
  const chkStripMeta = document.getElementById('chkStripMeta');
  const chkProgressive = document.getElementById('chkProgressive');
  const chkLossless = document.getElementById('chkLossless');
  const chkSharpen = document.getElementById('chkSharpen');
  const targetSizeKBEl = document.getElementById('targetSizeKB');
  const targetSizeMBEl = document.getElementById('targetSizeMB');
  const rotateSelect = document.getElementById('rotateSelect');
  const brightnessInput = document.getElementById('brightnessInput');
  const saturationInput = document.getElementById('saturationInput');
  const chkFlipH = document.getElementById('chkFlipH');
  const chkFlipV = document.getElementById('chkFlipV');
  const chkGrayscale = document.getElementById('chkGrayscale');
  const chkNormalizeAudio = document.getElementById('chkNormalizeAudio');
  const fpsSelect = document.getElementById('fpsSelect');
  const speedSelect = document.getElementById('speedSelect');
  const audioModeSelect = document.getElementById('audioModeSelect');
  const trimStartEl = document.getElementById('trimStart');
  const trimEndEl = document.getElementById('trimEnd');
  const watermarkTextEl = document.getElementById('watermarkText');
  const filenameSuffixEl = document.getElementById('filenameSuffix');

  const btnToggleAdvanced = document.getElementById('btnToggleAdvanced');
  const advancedDrawer = document.getElementById('advancedDrawer');
  const btnResetSettings = document.getElementById('btnResetSettings');

  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const btnBrowseFiles = document.getElementById('btnBrowseFiles');
  const btnLoadDemo = document.getElementById('btnLoadDemo');
  const heroTiltWrap = document.getElementById('heroTiltWrap');

  const queueList = document.getElementById('queueList');
  const emptyQueueState = document.getElementById('emptyQueueState');
  const queueFilterInfo = document.getElementById('queueFilterInfo');
  const btnClearQueue = document.getElementById('btnClearQueue');
  const btnDownloadZip = document.getElementById('btnDownloadZip');
  const btnProcessAll = document.getElementById('btnProcessAll');
  const btnProcessLabel = document.getElementById('btnProcessLabel');

  const overallProgressWrap = document.getElementById('overallProgressWrap');
  const overallProgressBar = document.getElementById('overallProgressBar');
  const overallProgressText = document.getElementById('overallProgressText');
  const overallProgressPct = document.getElementById('overallProgressPct');

  const statQueueCount = document.getElementById('statQueueCount');
  const statBytesSaved = document.getElementById('statBytesSaved');
  const engineStatusDot = document.getElementById('engineStatusDot');
  const engineStatusText = document.getElementById('engineStatusText');

  const compareDialog = document.getElementById('compareDialog');
  const btnCloseCompare = document.getElementById('btnCloseCompare');
  const compareBeforeImg = document.getElementById('compareBeforeImg');
  const compareAfterImg = document.getElementById('compareAfterImg');
  const beforeClipLayer = document.getElementById('beforeClipLayer');
  const splitDivider = document.getElementById('splitDivider');
  const compareSlider = document.getElementById('compareSlider');
  const compareTelemetryBar = document.getElementById('compareTelemetryBar');

  const btnOpenFolder = document.getElementById('btnOpenFolder');
  const btnStopInstance = document.getElementById('btnStopInstance');
  const shutdownDialog = document.getElementById('shutdownDialog');
  const shutdownPidDisplay = document.getElementById('shutdownPidDisplay');
  const btnCancelShutdown = document.getElementById('btnCancelShutdown');
  const btnDismissShutdown = document.getElementById('btnDismissShutdown');
  const btnConfirmShutdown = document.getElementById('btnConfirmShutdown');
  const offlineOverlay = document.getElementById('offlineOverlay');

  // Initialize Dialog Light Dismiss Fallback
  setupDialogLightDismiss(compareDialog);
  setupDialogLightDismiss(shutdownDialog);

  // ---- Apply a Smart Preset ----
  function applyPreset(presetKey) {
    const p = PRESETS[presetKey];
    if (!p) return;
    currentPreset = presetKey;

    presetCards.forEach((btn) => {
      const active = btn.dataset.preset === presetKey;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-checked', String(active));
    });

    activePresetBadge.textContent = p.badge;
    imageFormatEl.value = p.imageFormat;
    videoFormatEl.value = p.videoFormat;
    qualitySlider.value = p.quality;
    qualityValue.textContent = `${p.quality}%`;
    crfSlider.value = p.crf;
    updateCrfLabel(p.crf);
    resizeModeEl.value = p.resizeMode;
    if (p.maxDimension) maxDimensionEl.value = p.maxDimension;
    if (p.videoResolution) videoResolutionEl.value = p.videoResolution;
    if (p.width) inputWidthEl.value = p.width;
    if (p.height) inputHeightEl.value = p.height;
    if (p.fitMode) fitModeEl.value = p.fitMode;
    chkStripMeta.checked = p.stripMetadata;
    chkProgressive.checked = p.progressive;
    chkLossless.checked = p.lossless;
    chkSharpen.checked = p.sharpen;
    targetSizeKBEl.value = p.targetSizeKB || '';
    targetSizeMBEl.value = p.targetSizeMB || '';
    fpsSelect.value = p.fps || 'original';
    audioModeSelect.value = p.audioMode || 'keep';
    chkNormalizeAudio.checked = !!p.normalizeAudio;

    syncResizeVisibility();
  }

  function updateCrfLabel(val) {
    const n = parseInt(val, 10);
    let desc = 'Balanced';
    if (n <= 18) desc = 'Studio Master';
    else if (n <= 23) desc = 'High Fidelity';
    else if (n <= 27) desc = 'Web Optimal';
    else if (n <= 32) desc = 'Compact Size';
    else desc = 'Ultra Compressed';
    crfValue.textContent = `CRF ${n} (${desc})`;
  }

  function syncResizeVisibility() {
    const mode = resizeModeEl.value;
    resizeMaxDimBox.hidden = mode !== 'maxDimension';
    resizeExactBox.hidden = mode !== 'dimensions';
    resizeScaleBox.hidden = mode !== 'scale';
  }

  // ---- Gather Current Settings Object ----
  function collectSettings() {
    return {
      preset: currentPreset,
      imageFormat: imageFormatEl.value,
      videoFormat: videoFormatEl.value,
      audioFormat: videoFormatEl.value,
      quality: parseInt(qualitySlider.value, 10) || 80,
      crf: parseInt(crfSlider.value, 10) || 26,
      resizeMode: resizeModeEl.value,
      maxDimension: parseInt(maxDimensionEl.value, 10) || 1920,
      videoResolution: videoResolutionEl.value,
      width: parseInt(inputWidthEl.value, 10) || null,
      height: parseInt(inputHeightEl.value, 10) || null,
      fitMode: fitModeEl.value,
      scalePercent: parseInt(scaleSlider.value, 10) || 50,
      stripMetadata: chkStripMeta.checked,
      progressive: chkProgressive.checked,
      lossless: chkLossless.checked,
      sharpen: chkSharpen.checked,
      targetSizeKB: targetSizeKBEl.value,
      targetSizeMB: targetSizeMBEl.value,
      rotate: parseInt(rotateSelect.value, 10) || 0,
      brightness: parseFloat(brightnessInput.value) || 1.0,
      saturation: parseFloat(saturationInput.value) || 1.0,
      flipH: chkFlipH.checked,
      flipV: chkFlipV.checked,
      grayscale: chkGrayscale.checked,
      normalizeAudio: chkNormalizeAudio.checked,
      fps: fpsSelect.value,
      speed: parseFloat(speedSelect.value) || 1.0,
      audioMode: audioModeSelect.value,
      trimStart: trimStartEl.value,
      trimEnd: trimEndEl.value,
      watermarkText: watermarkTextEl.value,
      filenameSuffix: filenameSuffixEl.value
    };
  }

  // ---- Event Listeners for Controls ----
  presetCards.forEach((btn) => {
    btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
  });

  qualitySlider.addEventListener('input', () => {
    qualityValue.textContent = `${qualitySlider.value}%`;
  });

  crfSlider.addEventListener('input', () => {
    updateCrfLabel(crfSlider.value);
  });

  scaleSlider.addEventListener('input', () => {
    scaleValue.textContent = `${scaleSlider.value}%`;
  });

  resizeModeEl.addEventListener('change', syncResizeVisibility);

  btnResetSettings.addEventListener('click', () => applyPreset('web-ultra'));

  // Collapsible Accordion Toggle
  btnToggleAdvanced.addEventListener('click', () => {
    const isExpanded = btnToggleAdvanced.getAttribute('aria-expanded') === 'true';
    const nextState = !isExpanded;
    btnToggleAdvanced.setAttribute('aria-expanded', String(nextState));
    advancedDrawer.classList.toggle('is-expanded', nextState);
  });

  // 3D Perspective Hover Tilt on Hero Visual
  if (heroTiltWrap) {
    dropzone.addEventListener('mousemove', (e) => {
      const rect = heroTiltWrap.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      heroTiltWrap.style.transform = `perspective(700px) rotateY(${(x * 7).toFixed(2)}deg) rotateX(${(-y * 7).toFixed(2)}deg)`;
    });
    dropzone.addEventListener('mouseleave', () => {
      heroTiltWrap.style.transform = 'none';
    });
  }

  // ---- Upload & Drag-and-Drop ----
  btnBrowseFiles.addEventListener('click', (e) => {
    e.stopPropagation();
    fileInput.click();
  });

  dropzone.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    fileInput.click();
  });

  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fileInput.click();
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      uploadFiles(fileInput.files);
      fileInput.value = '';
    }
  });

  ['dragenter', 'dragover'].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('drag-over');
    });
  });

  ['dragleave', 'drop'].forEach((evt) => {
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('drag-over');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    if (e.dataTransfer?.files?.length > 0) {
      uploadFiles(e.dataTransfer.files);
    }
  });

  async function uploadFiles(fileList) {
    const formData = new FormData();
    for (const f of fileList) {
      formData.append('files', f);
    }
    btnBrowseFiles.disabled = true;
    btnBrowseFiles.querySelector('span').textContent = `INGESTING ${fileList.length} FILE(S)...`;
    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.items) {
        data.items.forEach((item) => upsertQueueItem(item));
        updateGlobalStats();
      }
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      btnBrowseFiles.disabled = false;
      btnBrowseFiles.querySelector('span').textContent = 'SELECT MEDIA FILES';
    }
  }

  // ---- Load Built-In Demo Media Suite ----
  btnLoadDemo.addEventListener('click', async (e) => {
    e.stopPropagation();
    btnLoadDemo.disabled = true;
    const labelSpan = btnLoadDemo.querySelector('span');
    const origText = labelSpan.textContent;
    labelSpan.textContent = 'SYNTHESIZING 4K IMAGES & 1080P VIDEO...';
    try {
      const res = await fetch('/api/generate-demo', { method: 'POST' });
      const data = await res.json();
      if (data.items) {
        data.items.forEach((item) => upsertQueueItem(item));
        updateGlobalStats();
      }
    } catch (err) {
      console.error('Failed to generate demo media:', err);
    } finally {
      btnLoadDemo.disabled = false;
      labelSpan.textContent = origText;
    }
  });

  // ---- Queue Rendering & Card Updates ----
  function upsertQueueItem(item) {
    itemsMap.set(item.id, item);
    emptyQueueState.hidden = itemsMap.size > 0;

    let card = document.getElementById(`card-${item.id}`);
    if (!card) {
      card = document.createElement('article');
      card.id = `card-${item.id}`;
      card.className = 'queue-item-card';
      queueList.prepend(card);
    }

    card.className = `queue-item-card status-${item.status}`;

    const dimInfo = item.width && item.height ? `${item.width}×${item.height}` : (item.duration ? `${item.duration.toFixed(1)}s` : 'STREAM');
    const thumbSrc = item.thumbUrl || '/assets/logo-opt.png?v=3';

    // Studio Config Badges (Crop / Watermark / Trim)
    let studioBadges = '';
    const sc = item.studioConfig || {};
    if (sc.cropRect && (sc.cropRect.w < 0.99 || sc.cropRect.h < 0.99)) {
      studioBadges += `<span class="meta-chip chip-studio">✂ CROPPED (${Math.round(sc.cropRect.w * 100)}×${Math.round(sc.cropRect.h * 100)}%)</span>`;
    }
    if (sc.watermarkText && sc.watermarkText.trim()) {
      studioBadges += `<span class="meta-chip chip-studio">🏷️ WM: "${sc.watermarkText.trim().slice(0, 12)}"</span>`;
    }
    if (sc.trimStart !== undefined || sc.trimEnd !== undefined) {
      const ts = sc.trimStart || 0;
      const te = sc.trimEnd || item.duration || 0;
      studioBadges += `<span class="meta-chip chip-studio">⏱ TRIM: ${Number(ts).toFixed(1)}s → ${Number(te).toFixed(1)}s</span>`;
    }

    let outputHtml = '';
    if (item.status === 'completed' && item.output) {
      const out = item.output;
      const outDim = out.width && out.height ? ` • ${out.width}×${out.height}` : '';
      const isSaved = out.savedBytes >= 0;
      const savingsText = isSaved
        ? `-${out.savedPercent}% (${formatBytes(out.savedBytes)} SAVED)`
        : `+${Math.abs(out.savedPercent)}% (FORMAT CONVERTED)`;

      outputHtml = `
        <span class="meta-chip chip-output">→ ${out.format} • ${formatBytes(out.size)}${outDim}</span>
        <span class="meta-chip chip-savings ${isSaved ? '' : 'size-increased'}">${savingsText}</span>
        <span class="meta-chip">${out.elapsedMs}ms</span>
      `;
    } else if (item.status === 'error') {
      outputHtml = `<span class="meta-chip" style="background:#ffe4e6;color:#be123c;border-color:#fda4af;">ERROR: ${item.error || 'Failed'}</span>`;
    }

    const isComparableImage = item.mediaType === 'image' && item.output && !['ICO', 'BMP', 'TIFF'].includes(item.output.format);
    const isComparableVideo = item.mediaType === 'video' && item.output && ['MP4', 'WEBM', 'MOV', 'GIF', 'WEBP'].includes(item.output.format);
    const showCompareBtn = item.status === 'completed' && (isComparableImage || isComparableVideo);

    card.innerHTML = `
      <div class="item-thumb-box">
        <img src="${thumbSrc}" alt="${item.originalName}" class="item-thumb-img" loading="lazy" />
        <span class="item-type-badge">${item.originalFormat}</span>
      </div>

      <div class="item-info">
        <div class="item-title-row">
          <h3 class="item-filename" title="${item.originalName}">${item.originalName}</h3>
        </div>
        <div class="item-meta-pills">
          <span class="meta-chip">${item.mediaType.toUpperCase()}</span>
          <span class="meta-chip">${formatBytes(item.originalSize)}</span>
          <span class="meta-chip">${dimInfo}</span>
          ${studioBadges}
          ${outputHtml}
        </div>
        <div class="item-progress-row">
          <progress max="100" ${item.status === 'processing' && item.progress < 10 ? '' : `value="${item.status === 'completed' ? 100 : item.progress}"`} aria-label="Conversion progress for ${item.originalName}"></progress>
          <span class="item-progress-label">${item.status.toUpperCase()} ${item.progress ? `${item.progress}%` : ''}</span>
        </div>
      </div>

      <div class="item-actions">
        ${item.mediaType === 'image' ? `
          <button type="button" class="btn-tech btn-outline btn-studio-crop" data-id="${item.id}" title="Interactive Crop, Aspect Ratio & Visual Watermark Positioner">
            <span>✂ CROP / WM</span>
          </button>
        ` : ''}
        ${item.mediaType === 'video' ? `
          <button type="button" class="btn-tech btn-outline btn-studio-trim" data-id="${item.id}" title="Visual Video Timeline Scrubber & Trim Handles">
            <span>⏱ TIMELINE TRIM</span>
          </button>
        ` : ''}
        ${showCompareBtn ? `
          <button type="button" class="btn-tech btn-outline btn-compare-item" data-id="${item.id}" title="Inspect Before/After Quality">
            <span>COMPARE</span>
          </button>
        ` : ''}
        ${item.status === 'completed' && item.output ? `
          <a href="${item.output.url}" download="${item.output.fileName}" class="btn-tech btn-primary">
            <span>DOWNLOAD</span>
          </a>
        ` : `
          <button type="button" class="btn-tech btn-secondary btn-run-single" data-id="${item.id}" ${item.status === 'processing' ? 'disabled' : ''}>
            <span>${item.status === 'processing' ? 'RUNNING...' : 'CONVERT'}</span>
          </button>
        `}
        <button type="button" class="btn-tech btn-ghost btn-remove-item" data-id="${item.id}" title="Remove from queue" aria-label="Remove ${item.originalName}">
          ✕
        </button>
      </div>
    `;

    // Bind card buttons
    const cropBtn = card.querySelector('.btn-studio-crop');
    if (cropBtn) {
      cropBtn.addEventListener('click', () => openImageStudio(item));
    }
    const trimBtn = card.querySelector('.btn-studio-trim');
    if (trimBtn) {
      trimBtn.addEventListener('click', () => openVideoTrimmer(item));
    }
    const runBtn = card.querySelector('.btn-run-single');
    if (runBtn) {
      runBtn.addEventListener('click', () => processItems([item.id]));
    }
    const cmpBtn = card.querySelector('.btn-compare-item');
    if (cmpBtn) {
      cmpBtn.addEventListener('click', () => openComparator(item));
    }
    const rmBtn = card.querySelector('.btn-remove-item');
    if (rmBtn) {
      rmBtn.addEventListener('click', () => deleteQueueItem(item.id));
    }
  }

  async function deleteQueueItem(id) {
    try {
      await fetch(`/api/items/${id}`, { method: 'DELETE' });
    } catch (_) {}
    itemsMap.delete(id);
    const card = document.getElementById(`card-${id}`);
    if (card) {
      await removeElement(card);
    }
    emptyQueueState.hidden = itemsMap.size > 0;
    updateGlobalStats();
  }

  btnClearQueue.addEventListener('click', async () => {
    try {
      await fetch('/api/items/all', { method: 'DELETE' });
    } catch (_) {}
    itemsMap.clear();
    const cards = Array.from(queueList.querySelectorAll('.queue-item-card'));
    await Promise.all(cards.map((c) => removeElement(c)));
    emptyQueueState.hidden = false;
    overallProgressWrap.hidden = true;
    updateGlobalStats();
  });

  // ---- Batch & Single Processing ----
  btnProcessAll.addEventListener('click', () => {
    const allIds = Array.from(itemsMap.keys());
    if (allIds.length > 0) processItems(allIds);
  });

  async function processItems(itemIds) {
    const settings = collectSettings();
    btnProcessAll.disabled = true;
    btnProcessLabel.textContent = `PROCESSING ${itemIds.length} ITEM(S)...`;
    overallProgressWrap.hidden = false;
    overallProgressBar.value = 10;
    overallProgressPct.textContent = '10%';
    overallProgressText.textContent = `TRANSCODING ${itemIds.length} FILE(S) WITH [${settings.preset.toUpperCase()}]...`;

    try {
      const res = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds, settings })
      });
      const data = await res.json();
      if (data.items) {
        data.items.forEach((item) => upsertQueueItem(item));
      }
      overallProgressBar.value = 100;
      overallProgressPct.textContent = '100%';
      overallProgressText.textContent = 'BATCH PROCESSING COMPLETE // ALL OUTPUTS READY';
    } catch (err) {
      console.error('Batch process error:', err);
      overallProgressText.textContent = `ERROR: ${err.message}`;
    } finally {
      updateGlobalStats();
      btnProcessAll.disabled = itemsMap.size === 0;
      btnProcessLabel.textContent = 'EXECUTE BATCH CONVERSION';
    }
  }

  // ---- Download All as ZIP ----
  btnDownloadZip.addEventListener('click', () => {
    window.location.href = '/api/download-zip';
  });

  // ---- Output Folder Browser Modal & Windows Explorer Launcher ----
  const outputFolderDialog = document.getElementById('outputFolderDialog');
  const outputFolderPathText = document.getElementById('outputFolderPathText');
  const outputFolderCountText = document.getElementById('outputFolderCountText');
  const outputFilesList = document.getElementById('outputFilesList');
  const btnCopyOutputPath = document.getElementById('btnCopyOutputPath');
  const btnTriggerWindowsExplorer = document.getElementById('btnTriggerWindowsExplorer');
  const btnCloseOutputDialog = document.getElementById('btnCloseOutputDialog');
  const btnClearOutputsFolder = document.getElementById('btnClearOutputsFolder');

  if (outputFolderDialog) {
    setupDialogLightDismiss(outputFolderDialog);
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  async function refreshOutputFolderModal() {
    try {
      const res = await fetch('/api/outputs');
      const data = await res.json();
      if (outputFolderPathText && data.path) {
        outputFolderPathText.textContent = data.path;
      }
      const files = data.files || [];
      if (outputFolderCountText) {
        outputFolderCountText.textContent = `${files.length} SAVED FILE${files.length === 1 ? '' : 'S'}`;
      }
      if (!outputFilesList) return;

      if (files.length === 0) {
        outputFilesList.innerHTML = `
          <div style="padding:28px;text-align:center;border:1.5px dashed rgba(9,13,22,0.18);border-radius:10px;background:#f8fafc;color:#475569;">
            <strong style="display:block;color:#090d16;margin-bottom:4px;">No converted output files saved on disk yet</strong>
            <span style="font-size:0.8rem;">Once you convert or compress files in the queue, every finished file is automatically saved to <code>outputs/</code> and appears here for instant access.</span>
          </div>
        `;
        return;
      }

      outputFilesList.innerHTML = files
        .map((f) => {
          const isImg = ['PNG', 'JPG', 'JPEG', 'WEBP', 'AVIF', 'GIF', 'SVG', 'ICO', 'BMP'].includes(f.ext);
          const dateStr = new Date(f.modifiedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          return `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 14px;background:#f8fafc;border:1.5px solid rgba(9,13,22,0.12);border-radius:8px;">
              <div style="display:flex;align-items:center;gap:12px;min-width:0;">
                ${
                  isImg
                    ? `<img src="${f.url}" alt="" style="width:42px;height:42px;object-fit:cover;border-radius:6px;border:1px solid rgba(9,13,22,0.15);background:#090d16;flex-shrink:0;" />`
                    : `<div style="width:42px;height:42px;border-radius:6px;background:#090d16;color:#00d2ff;display:grid;place-items:center;font-family:var(--font-mono);font-size:0.7rem;font-weight:800;flex-shrink:0;">${escapeHtml(f.ext || 'FILE')}</div>`
                }
                <div style="min-width:0;">
                  <div style="font-weight:700;font-size:0.84rem;color:#090d16;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</div>
                  <div style="font-family:var(--font-mono);font-size:0.72rem;color:#475569;">
                    <strong style="color:#0055ff;">${escapeHtml(f.ext)}</strong> &bull; ${formatBytes(f.size)} &bull; Saved at ${dateStr}
                  </div>
                </div>
              </div>
              <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
                <a href="${f.url}" download="${escapeHtml(f.name)}" class="btn-tech btn-emerald btn-xs" style="text-decoration:none;">
                  <span>⬇ DOWNLOAD</span>
                </a>
                <button type="button" class="btn-tech btn-outline btn-xs btn-del-output" data-filename="${escapeHtml(f.name)}">
                  <span>✕</span>
                </button>
              </div>
            </div>
          `;
        })
        .join('');

      outputFilesList.querySelectorAll('.btn-del-output').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const fname = btn.dataset.filename;
          await fetch(`/api/outputs/${encodeURIComponent(fname)}`, { method: 'DELETE' });
          await refreshOutputFolderModal();
        });
      });
    } catch (err) {
      console.error('Failed to load outputs:', err);
    }
  }

  const deleteOutputsConfirmBox = document.getElementById('deleteOutputsConfirmBox');
  const btnCancelClearOutputs = document.getElementById('btnCancelClearOutputs');
  const btnConfirmClearOutputs = document.getElementById('btnConfirmClearOutputs');

  function setDeleteConfirmVisible(visible) {
    if (!deleteOutputsConfirmBox) return;
    deleteOutputsConfirmBox.hidden = !visible;
    deleteOutputsConfirmBox.style.display = visible ? 'flex' : 'none';
  }

  btnOpenFolder.addEventListener('click', async () => {
    setDeleteConfirmVisible(false);
    await refreshOutputFolderModal();
    outputFolderDialog?.showModal();
  });

  btnCloseOutputDialog?.addEventListener('click', () => {
    setDeleteConfirmVisible(false);
    outputFolderDialog?.close();
  });

  btnCopyOutputPath?.addEventListener('click', async () => {
    const pathStr = outputFolderPathText?.textContent || '';
    if (!pathStr) return;
    try {
      await navigator.clipboard.writeText(pathStr);
      const sp = btnCopyOutputPath.querySelector('span');
      if (sp) {
        sp.textContent = '✓ PATH COPIED!';
        setTimeout(() => {
          sp.textContent = '📋 COPY FOLDER PATH';
        }, 1800);
      }
    } catch (_) {}
  });

  btnTriggerWindowsExplorer?.addEventListener('click', async () => {
    const sp = btnTriggerWindowsExplorer.querySelector('span');
    if (sp) sp.textContent = 'OPENING EXPLORER...';
    await fetch('/api/open-folder', { method: 'POST' }).catch(() => {});
    if (sp) sp.textContent = '✓ OPENED IN EXPLORER';
    setTimeout(() => {
      if (sp) sp.textContent = '📂 LAUNCH EXPLORER';
    }, 1800);
  });

  btnClearOutputsFolder?.addEventListener('click', () => {
    setDeleteConfirmVisible(true);
  });

  btnCancelClearOutputs?.addEventListener('click', () => {
    setDeleteConfirmVisible(false);
  });

  btnConfirmClearOutputs?.addEventListener('click', async () => {
    await fetch('/api/outputs/all', { method: 'DELETE' });
    setDeleteConfirmVisible(false);
    await refreshOutputFolderModal();
  });

  // ---- GitHub Update Checker & 1-Click Auto-Updater ----
  const btnCheckUpdates = document.getElementById('btnCheckUpdates');
  const updateDialog = document.getElementById('updateDialog');
  const btnCloseUpdateDialog = document.getElementById('btnCloseUpdateDialog');
  const updateLocalVerText = document.getElementById('updateLocalVerText');
  const updateRemoteVerText = document.getElementById('updateRemoteVerText');
  const updateStatusBadge = document.getElementById('updateStatusBadge');
  const updateStatusBanner = document.getElementById('updateStatusBanner');
  const updateTerminalLog = document.getElementById('updateTerminalLog');
  const btnRecheckUpdates = document.getElementById('btnRecheckUpdates');
  const btnApplyUpdateNow = document.getElementById('btnApplyUpdateNow');

  if (updateDialog) {
    setupDialogLightDismiss(updateDialog);
  }

  async function runUpdateCheck({ silent = false } = {}) {
    if (!silent) {
      if (updateStatusBadge) {
        updateStatusBadge.textContent = 'SCANNING REPO...';
        updateStatusBadge.style.color = '#00d2ff';
      }
      if (updateStatusBanner) {
        updateStatusBanner.innerHTML = 'Checking <code>kevindemara/UltraSuperConvertor</code> on GitHub for new releases or commits...';
        updateStatusBanner.style.background = '#f8fafc';
        updateStatusBanner.style.borderColor = 'rgba(9,13,22,0.14)';
      }
    }

    try {
      const res = await fetch('/api/update/check');
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Update check failed');

      const localLabel = `v${data.localVersion}${data.localSha ? ` (${data.localSha})` : ''}`;
      const remoteLabel = `v${data.remoteVersion}${data.remoteSha ? ` (${data.remoteSha})` : ''}`;
      if (updateLocalVerText) updateLocalVerText.textContent = localLabel;
      if (updateRemoteVerText) updateRemoteVerText.textContent = remoteLabel;

      const btnSpan = btnCheckUpdates?.querySelector('span');
      if (data.updateAvailable) {
        if (btnSpan) btnSpan.textContent = '⚡ UPDATE AVAILABLE';
        if (btnCheckUpdates) btnCheckUpdates.style.borderColor = '#0055ff';
        if (updateStatusBadge) {
          updateStatusBadge.textContent = 'UPDATE AVAILABLE';
          updateStatusBadge.style.color = '#10b981';
        }
        if (updateStatusBanner) {
          updateStatusBanner.style.background = '#ecfdf5';
          updateStatusBanner.style.borderColor = '#10b981';
          updateStatusBanner.innerHTML = `
            <strong style="color:#065f46;display:block;margin-bottom:4px;">⚡ A newer version is available on GitHub!</strong>
            <div style="font-size:0.8rem;color:#1e293b;">
              Latest Commit: <code>${escapeHtml(data.remoteSha || 'main')}</code> — ${escapeHtml(data.latestMessage || 'New update available')}
            </div>
          `;
        }
        if (btnApplyUpdateNow) {
          const sp = btnApplyUpdateNow.querySelector('span');
          if (sp) sp.textContent = '🚀 AUTO-UPDATE & RESTART NOW';
        }
      } else {
        if (btnSpan) btnSpan.textContent = '↻ CHECK UPDATES';
        if (updateStatusBadge) {
          updateStatusBadge.textContent = '✓ UP TO DATE';
          updateStatusBadge.style.color = '#10b981';
        }
        if (updateStatusBanner) {
          updateStatusBanner.style.background = '#f8fafc';
          updateStatusBanner.style.borderColor = 'rgba(9,13,22,0.14)';
          updateStatusBanner.innerHTML = `
            <strong style="color:#059669;display:block;margin-bottom:4px;">✓ Your UltraSuperConvertor instance is up to date!</strong>
            <div style="font-size:0.8rem;color:#475569;">
              Running latest version <code>${escapeHtml(localLabel)}</code>${data.latestMessage ? ` — <em>"${escapeHtml(data.latestMessage)}"</em>` : ''}
            </div>
          `;
        }
        if (btnApplyUpdateNow) {
          const sp = btnApplyUpdateNow.querySelector('span');
          if (sp) sp.textContent = '⚡ FORCE SYNC / RE-PULL MAIN';
        }
      }
    } catch (err) {
      if (!silent && updateStatusBanner) {
        updateStatusBadge.textContent = 'OFFLINE / ERROR';
        updateStatusBadge.style.color = '#f59e0b';
        updateStatusBanner.innerHTML = `<span style="color:#b91c1c;">Could not reach GitHub API: ${escapeHtml(err.message)}</span>`;
      }
    }
  }

  btnCheckUpdates?.addEventListener('click', () => {
    if (updateTerminalLog) updateTerminalLog.hidden = true;
    updateDialog?.showModal();
    runUpdateCheck({ silent: false });
  });

  btnCloseUpdateDialog?.addEventListener('click', () => updateDialog?.close());
  btnRecheckUpdates?.addEventListener('click', () => runUpdateCheck({ silent: false }));

  btnApplyUpdateNow?.addEventListener('click', async () => {
    if (!btnApplyUpdateNow) return;
    btnApplyUpdateNow.disabled = true;
    const sp = btnApplyUpdateNow.querySelector('span');
    if (sp) sp.textContent = 'PULLING FROM GITHUB...';
    if (updateTerminalLog) {
      updateTerminalLog.hidden = false;
      updateTerminalLog.textContent = '[UPDATER] Downloading and applying latest code from GitHub (kevindemara/UltraSuperConvertor)...\n';
    }

    try {
      const res = await fetch('/api/update/apply', { method: 'POST' });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'Update failed');

      if (updateTerminalLog) {
        updateTerminalLog.textContent += `${data.log || 'Updated!'}\n[UPDATER] Waiting for server restart...`;
      }
      if (sp) sp.textContent = '✓ UPDATED! RELOADING...';

      setTimeout(() => {
        window.location.reload();
      }, 2200);
    } catch (err) {
      if (updateTerminalLog) {
        updateTerminalLog.textContent += `\n[ERROR] ${err.message}`;
      }
      if (sp) sp.textContent = 'RETRY AUTO-UPDATE';
      btnApplyUpdateNow.disabled = false;
    }
  });

  // Perform a silent background update check shortly after load
  setTimeout(() => runUpdateCheck({ silent: true }), 1500);

  // ---- Interactive Before / After Split-Screen & Synchronized Dual-Video Comparator ----
  const compareStage = document.getElementById('compareStage');
  const videoCompareStage = document.getElementById('videoCompareStage');
  const videoCompareModeGroup = document.getElementById('videoCompareModeGroup');
  const btnVidModeSide = document.getElementById('btnVidModeSide');
  const btnVidModeSplit = document.getElementById('btnVidModeSplit');
  const videoMonitorsWrap = document.getElementById('videoMonitorsWrap');
  const vidBeforePane = document.getElementById('vidBeforePane');
  const compareBeforeVideo = document.getElementById('compareBeforeVideo');
  const compareAfterVideo = document.getElementById('compareAfterVideo');
  const vidSplitDivider = document.getElementById('vidSplitDivider');
  const vidCompareSlider = document.getElementById('vidCompareSlider');
  const btnSyncPlayPause = document.getElementById('btnSyncPlayPause');
  const syncPlayLabel = document.getElementById('syncPlayLabel');
  const syncTimecode = document.getElementById('syncTimecode');
  const syncScrubber = document.getElementById('syncScrubber');
  const btnSyncSpeed = document.getElementById('btnSyncSpeed');
  const btnSyncMute = document.getElementById('btnSyncMute');

  function formatTimecode(sec) {
    const s = Math.max(0, Number(sec) || 0);
    const mins = Math.floor(s / 60);
    const rem = (s % 60).toFixed(2).padStart(5, '0');
    return `${String(mins).padStart(2, '0')}:${rem}`;
  }

  function openComparator(item) {
    if (!item || !item.output) return;

    compareTelemetryBar.innerHTML = `
      <div><strong>FILE:</strong> ${item.originalName}</div>
      <div><strong>ORIGINAL:</strong> ${item.originalFormat} (${formatBytes(item.originalSize)})</div>
      <div><strong>OPTIMIZED:</strong> ${item.output.format} (${formatBytes(item.output.size)})</div>
      <div style="color:#34d399;"><strong>DELTA:</strong> ${item.output.savedBytes >= 0 ? `-${item.output.savedPercent}% (${formatBytes(item.output.savedBytes)} saved)` : `+${Math.abs(item.output.savedPercent)}%`}</div>
    `;

    const isVideoCompare = item.mediaType === 'video' && ['MP4', 'WEBM', 'MOV'].includes(item.output.format);

    if (isVideoCompare) {
      compareStage.hidden = true;
      videoCompareStage.hidden = false;
      videoCompareModeGroup.hidden = false;

      compareBeforeVideo.src = item.inputUrl;
      compareAfterVideo.src = `${item.output.url}?t=${Date.now()}`;
      compareBeforeVideo.muted = true; // Mute original so audio doesn't double-echo
      compareAfterVideo.muted = false;
      compareBeforeVideo.playbackRate = 1.0;
      compareAfterVideo.playbackRate = 1.0;
      btnSyncSpeed.querySelector('span').textContent = '1.0× SPEED';
      btnSyncMute.querySelector('span').textContent = '🔊 AUDIO ON';
      syncPlayLabel.textContent = '▶ PLAY BOTH';

      setVideoCompareMode('side');
    } else {
      compareStage.hidden = false;
      videoCompareStage.hidden = true;
      videoCompareModeGroup.hidden = true;
      compareBeforeVideo.pause();
      compareAfterVideo.pause();

      compareBeforeImg.src = item.thumbUrl || item.inputUrl;
      compareAfterImg.src = `${item.output.url}?t=${Date.now()}`;
      compareSlider.value = 50;
      updateSplitPosition(50);
    }

    compareDialog.showModal();
  }

  function setVideoCompareMode(mode) {
    const isSplit = mode === 'split';
    btnVidModeSide.classList.toggle('active', !isSplit);
    btnVidModeSplit.classList.toggle('active', isSplit);
    videoMonitorsWrap.className = `video-compare-monitors ${isSplit ? 'mode-split' : 'mode-side'}`;
    vidSplitDivider.hidden = !isSplit;
    vidCompareSlider.hidden = !isSplit;
    if (isSplit) {
      vidCompareSlider.value = 50;
      updateVideoSplitPosition(50);
    } else {
      vidBeforePane.style.clipPath = 'none';
    }
  }

  function updateVideoSplitPosition(pct) {
    const rightInset = 100 - pct;
    vidBeforePane.style.clipPath = `inset(0 ${rightInset}% 0 0)`;
    vidSplitDivider.style.left = `${pct}%`;
  }

  btnVidModeSide?.addEventListener('click', () => setVideoCompareMode('side'));
  btnVidModeSplit?.addEventListener('click', () => setVideoCompareMode('split'));
  vidCompareSlider?.addEventListener('input', () => updateVideoSplitPosition(parseFloat(vidCompareSlider.value)));

  btnSyncPlayPause?.addEventListener('click', async () => {
    if (compareAfterVideo.paused) {
      compareBeforeVideo.currentTime = compareAfterVideo.currentTime;
      await Promise.allSettled([compareBeforeVideo.play(), compareAfterVideo.play()]);
      syncPlayLabel.textContent = '⏸ PAUSE BOTH';
    } else {
      compareBeforeVideo.pause();
      compareAfterVideo.pause();
      syncPlayLabel.textContent = '▶ PLAY BOTH';
    }
  });

  compareAfterVideo?.addEventListener('timeupdate', () => {
    const dur = compareAfterVideo.duration || compareBeforeVideo.duration || 1;
    const cur = compareAfterVideo.currentTime || 0;
    syncScrubber.value = ((cur / dur) * 100).toFixed(2);
    syncTimecode.textContent = `${formatTimecode(cur)} / ${formatTimecode(dur)}`;
    if (Math.abs(compareBeforeVideo.currentTime - cur) > 0.18) {
      compareBeforeVideo.currentTime = cur;
    }
  });

  syncScrubber?.addEventListener('input', () => {
    const dur = compareAfterVideo.duration || compareBeforeVideo.duration || 1;
    const targetTime = (parseFloat(syncScrubber.value) / 100) * dur;
    compareAfterVideo.currentTime = targetTime;
    compareBeforeVideo.currentTime = targetTime;
    syncTimecode.textContent = `${formatTimecode(targetTime)} / ${formatTimecode(dur)}`;
  });

  btnSyncSpeed?.addEventListener('click', () => {
    const nextRate = compareAfterVideo.playbackRate === 1.0 ? 0.5 : 1.0;
    compareAfterVideo.playbackRate = nextRate;
    compareBeforeVideo.playbackRate = nextRate;
    btnSyncSpeed.querySelector('span').textContent = `${nextRate.toFixed(1)}× SPEED`;
  });

  btnSyncMute?.addEventListener('click', () => {
    compareAfterVideo.muted = !compareAfterVideo.muted;
    btnSyncMute.querySelector('span').textContent = compareAfterVideo.muted ? '🔇 MUTED' : '🔊 AUDIO ON';
  });

  function updateSplitPosition(pct) {
    const rightInset = 100 - pct;
    beforeClipLayer.style.clipPath = `inset(0 ${rightInset}% 0 0)`;
    splitDivider.style.left = `${pct}%`;
  }

  compareSlider.addEventListener('input', () => {
    updateSplitPosition(parseFloat(compareSlider.value));
  });

  btnCloseCompare.addEventListener('click', () => {
    compareBeforeVideo?.pause();
    compareAfterVideo?.pause();
    compareDialog.close();
  });

  compareDialog.addEventListener('close', () => {
    compareBeforeVideo?.pause();
    compareAfterVideo?.pause();
  });

  // ==========================================================================
  // 1. INTERACTIVE IMAGE CROP, ASPECT RATIO & VISUAL WATERMARK POSITIONER
  // ==========================================================================
  const imageStudioDialog = document.getElementById('imageStudioDialog');
  const btnCloseImageStudio = document.getElementById('btnCloseImageStudio');
  const studioPreviewImg = document.getElementById('studioPreviewImg');
  const studioImageContainer = document.getElementById('studioImageContainer');
  const cropBoxOverlay = document.getElementById('cropBoxOverlay');
  const cropRatioGroup = document.getElementById('cropRatioGroup');
  const btnResetCropBox = document.getElementById('btnResetCropBox');
  const cropPixelReadout = document.getElementById('cropPixelReadout');
  const canvasWatermarkPill = document.getElementById('canvasWatermarkPill');
  const canvasWatermarkText = document.getElementById('canvasWatermarkText');
  const studioWmText = document.getElementById('studioWmText');
  const studioWmStyle = document.getElementById('studioWmStyle');
  const studioWmScale = document.getElementById('studioWmScale');
  const studioWmScaleVal = document.getElementById('studioWmScaleVal');
  const studioWmOpacity = document.getElementById('studioWmOpacity');
  const studioWmOpacityVal = document.getElementById('studioWmOpacityVal');
  const btnStudioApplyAll = document.getElementById('btnStudioApplyAll');
  const btnStudioSaveSingle = document.getElementById('btnStudioSaveSingle');
  const btnStudioConvertNow = document.getElementById('btnStudioConvertNow');

  setupDialogLightDismiss(imageStudioDialog);

  let activeStudioItem = null;
  let cropState = { x: 0, y: 0, w: 1, h: 1 }; // Normalized 0..1
  let cropRatioLock = 'free';
  let wmState = {
    text: '',
    x: 0.84,
    y: 0.88,
    scale: 1.0,
    opacity: 0.9,
    style: 'obsidian'
  };

  function openImageStudio(item) {
    activeStudioItem = item;
    const sc = item.studioConfig || {};
    cropState = sc.cropRect ? { ...sc.cropRect } : { x: 0, y: 0, w: 1, h: 1 };
    cropRatioLock = 'free';
    cropRatioGroup.querySelectorAll('.seg-btn').forEach((b) => {
      b.classList.toggle('active', b.dataset.ratio === 'free');
    });

    wmState = {
      text: sc.watermarkText !== undefined ? sc.watermarkText : (watermarkTextEl.value || ''),
      x: sc.watermarkX !== undefined ? sc.watermarkX : 0.84,
      y: sc.watermarkY !== undefined ? sc.watermarkY : 0.88,
      scale: sc.watermarkScale !== undefined ? sc.watermarkScale : 1.0,
      opacity: sc.watermarkOpacity !== undefined ? sc.watermarkOpacity : 0.9,
      style: sc.watermarkStyle || 'obsidian'
    };

    studioWmText.value = wmState.text;
    studioWmStyle.value = wmState.style;
    studioWmScale.value = Math.round(wmState.scale * 100);
    studioWmScaleVal.textContent = `${Math.round(wmState.scale * 100)}%`;
    studioWmOpacity.value = Math.round(wmState.opacity * 100);
    studioWmOpacityVal.textContent = `${Math.round(wmState.opacity * 100)}%`;

    studioPreviewImg.src = item.thumbUrl || item.inputUrl;
    renderCropBox();
    renderCanvasWatermark();
    imageStudioDialog.showModal();
  }

  function renderCropBox() {
    cropBoxOverlay.style.left = `${(cropState.x * 100).toFixed(2)}%`;
    cropBoxOverlay.style.top = `${(cropState.y * 100).toFixed(2)}%`;
    cropBoxOverlay.style.width = `${(cropState.w * 100).toFixed(2)}%`;
    cropBoxOverlay.style.height = `${(cropState.h * 100).toFixed(2)}%`;

    const srcW = activeStudioItem?.width || 1920;
    const srcH = activeStudioItem?.height || 1080;
    const pxW = Math.round(cropState.w * srcW);
    const pxH = Math.round(cropState.h * srcH);
    const pxX = Math.round(cropState.x * srcW);
    const pxY = Math.round(cropState.y * srcH);
    cropPixelReadout.textContent = `CROP: ${pxW}×${pxH} PX @ (${pxX}, ${pxY})`;
  }

  function renderCanvasWatermark() {
    const txt = (studioWmText.value || '').trim();
    wmState.text = txt;
    wmState.style = studioWmStyle.value;
    wmState.scale = (parseInt(studioWmScale.value, 10) || 100) / 100;
    wmState.opacity = (parseInt(studioWmOpacity.value, 10) || 90) / 100;

    if (!txt) {
      canvasWatermarkPill.hidden = true;
      return;
    }
    canvasWatermarkPill.hidden = false;
    canvasWatermarkText.textContent = txt;
    canvasWatermarkPill.className = `canvas-watermark-pill style-${wmState.style}`;
    canvasWatermarkPill.style.left = `${(wmState.x * 100).toFixed(2)}%`;
    canvasWatermarkPill.style.top = `${(wmState.y * 100).toFixed(2)}%`;
    canvasWatermarkPill.style.opacity = String(wmState.opacity);
    canvasWatermarkPill.style.transform = `translate(-50%, -50%) scale(${wmState.scale.toFixed(2)})`;
  }

  // Aspect ratio buttons
  cropRatioGroup?.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    if (btn.id === 'btnResetCropBox') {
      cropState = { x: 0, y: 0, w: 1, h: 1 };
      cropRatioLock = 'free';
      cropRatioGroup.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b.dataset.ratio === 'free'));
      renderCropBox();
      return;
    }
    const r = btn.dataset.ratio;
    if (!r) return;
    cropRatioLock = r;
    cropRatioGroup.querySelectorAll('.seg-btn').forEach((b) => b.classList.toggle('active', b === btn));

    if (r !== 'free') {
      const targetRatio = parseFloat(r);
      const srcW = activeStudioItem?.width || 1920;
      const srcH = activeStudioItem?.height || 1080;
      const imgAspect = srcW / srcH;
      // Normalized w/h ratio relative to image
      const normRatio = targetRatio / imgAspect;
      let newW = 0.85;
      let newH = newW / normRatio;
      if (newH > 0.85) {
        newH = 0.85;
        newW = newH * normRatio;
      }
      newW = Math.min(1, newW);
      newH = Math.min(1, newH);
      cropState = {
        x: (1 - newW) / 2,
        y: (1 - newH) / 2,
        w: newW,
        h: newH
      };
      renderCropBox();
    }
  });

  // Pointer dragging for Crop Frame (Pan & 4-Corner Resize)
  let cropDragMode = null; // 'move' | 'nw' | 'ne' | 'sw' | 'se'
  let cropStartMouse = { x: 0, y: 0 };
  let cropStartRect = { x: 0, y: 0, w: 1, h: 1 };

  cropBoxOverlay?.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    const handle = e.target.closest('.crop-handle');
    cropDragMode = handle ? handle.dataset.handle : 'move';
    cropStartMouse = { x: e.clientX, y: e.clientY };
    cropStartRect = { ...cropState };
    cropBoxOverlay.setPointerCapture(e.pointerId);
  });

  cropBoxOverlay?.addEventListener('pointermove', (e) => {
    if (!cropDragMode) return;
    const rect = studioImageContainer.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dx = (e.clientX - cropStartMouse.x) / rect.width;
    const dy = (e.clientY - cropStartMouse.y) / rect.height;

    if (cropDragMode === 'move') {
      cropState.x = Math.max(0, Math.min(1 - cropStartRect.w, cropStartRect.x + dx));
      cropState.y = Math.max(0, Math.min(1 - cropStartRect.h, cropStartRect.y + dy));
    } else {
      let { x, y, w, h } = cropStartRect;
      if (cropDragMode.includes('e')) w = Math.max(0.08, Math.min(1 - x, w + dx));
      if (cropDragMode.includes('s')) h = Math.max(0.08, Math.min(1 - y, h + dy));
      if (cropDragMode.includes('w')) {
        const nx = Math.max(0, Math.min(x + w - 0.08, x + dx));
        w = w + (x - nx);
        x = nx;
      }
      if (cropDragMode.includes('n')) {
        const ny = Math.max(0, Math.min(y + h - 0.08, y + dy));
        h = h + (y - ny);
        y = ny;
      }
      if (cropRatioLock !== 'free') {
        const targetRatio = parseFloat(cropRatioLock);
        const srcW = activeStudioItem?.width || 1920;
        const srcH = activeStudioItem?.height || 1080;
        const normRatio = targetRatio / (srcW / srcH);
        h = Math.min(1 - y, w / normRatio);
        w = h * normRatio;
      }
      cropState = { x, y, w, h };
    }
    renderCropBox();
  });

  cropBoxOverlay?.addEventListener('pointerup', () => {
    cropDragMode = null;
  });

  // Pointer dragging for Live Watermark Pill on Canvas
  let wmDragging = false;
  canvasWatermarkPill?.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    wmDragging = true;
    canvasWatermarkPill.setPointerCapture(e.pointerId);
  });

  canvasWatermarkPill?.addEventListener('pointermove', (e) => {
    if (!wmDragging) return;
    const rect = studioImageContainer.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    wmState.x = Math.max(0.05, Math.min(0.95, (e.clientX - rect.left) / rect.width));
    wmState.y = Math.max(0.05, Math.min(0.95, (e.clientY - rect.top) / rect.height));
    renderCanvasWatermark();
  });

  canvasWatermarkPill?.addEventListener('pointerup', () => {
    wmDragging = false;
  });

  // Watermark Inputs & Quick Snap Anchors
  studioWmText?.addEventListener('input', renderCanvasWatermark);
  studioWmStyle?.addEventListener('change', renderCanvasWatermark);
  studioWmScale?.addEventListener('input', () => {
    studioWmScaleVal.textContent = `${studioWmScale.value}%`;
    renderCanvasWatermark();
  });
  studioWmOpacity?.addEventListener('input', () => {
    studioWmOpacityVal.textContent = `${studioWmOpacity.value}%`;
    renderCanvasWatermark();
  });

  document.querySelectorAll('.snap-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      wmState.x = parseFloat(btn.dataset.x);
      wmState.y = parseFloat(btn.dataset.y);
      if (!studioWmText.value.trim()) {
        studioWmText.value = 'ULTRASUPERCONVERTOR';
      }
      renderCanvasWatermark();
    });
  });

  async function saveImageStudioConfig(applyToAll = false, convertImmediately = false) {
    if (!activeStudioItem) return;
    const studioConfig = {
      cropRect: { ...cropState },
      watermarkText: wmState.text,
      watermarkX: wmState.x,
      watermarkY: wmState.y,
      watermarkScale: wmState.scale,
      watermarkOpacity: wmState.opacity,
      watermarkStyle: wmState.style
    };
    if (wmState.text) {
      watermarkTextEl.value = wmState.text;
    }

    try {
      const res = await fetch(`/api/items/${activeStudioItem.id}/studio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studioConfig, applyToAll })
      });
      const data = await res.json();
      if (data.items) {
        data.items.forEach((it) => upsertQueueItem(it));
      } else if (data.item) {
        upsertQueueItem(data.item);
      }
    } catch (err) {
      console.error('Failed to save studio config:', err);
    }

    imageStudioDialog.close();
    if (convertImmediately) {
      await processItems([activeStudioItem.id]);
    }
  }

  btnStudioSaveSingle?.addEventListener('click', () => saveImageStudioConfig(false, false));
  btnStudioApplyAll?.addEventListener('click', () => saveImageStudioConfig(true, false));
  btnStudioConvertNow?.addEventListener('click', () => saveImageStudioConfig(false, true));
  btnCloseImageStudio?.addEventListener('click', () => imageStudioDialog.close());

  // ==========================================================================
  // 2. INTERACTIVE VIDEO TIMELINE SCRUBBER & VISUAL TRIM HANDLES
  // ==========================================================================
  const videoTrimmerDialog = document.getElementById('videoTrimmerDialog');
  const btnCloseVideoTrimmer = document.getElementById('btnCloseVideoTrimmer');
  const trimmerVideoEl = document.getElementById('trimmerVideoEl');
  const trimmerCurrentTime = document.getElementById('trimmerCurrentTime');
  const trimmerClipDuration = document.getElementById('trimmerClipDuration');
  const btnTrimmerPlayPause = document.getElementById('btnTrimmerPlayPause');
  const btnTrimmerStepBack = document.getElementById('btnTrimmerStepBack');
  const btnTrimmerStepFwd = document.getElementById('btnTrimmerStepFwd');
  const chkTrimmerLoop = document.getElementById('chkTrimmerLoop');
  const btnSetInAtPlayhead = document.getElementById('btnSetInAtPlayhead');
  const btnSetOutAtPlayhead = document.getElementById('btnSetOutAtPlayhead');
  const btnResetTrimRange = document.getElementById('btnResetTrimRange');
  const trimInReadout = document.getElementById('trimInReadout');
  const trimOutReadout = document.getElementById('trimOutReadout');
  const filmstripTimeline = document.getElementById('filmstripTimeline');
  const filmstripFrames = document.getElementById('filmstripFrames');
  const trimMaskLeft = document.getElementById('trimMaskLeft');
  const trimMaskRight = document.getElementById('trimMaskRight');
  const trimSelectionBox = document.getElementById('trimSelectionBox');
  const trimHandleIn = document.getElementById('trimHandleIn');
  const trimHandleOut = document.getElementById('trimHandleOut');
  const timelinePlayhead = document.getElementById('timelinePlayhead');
  const btnSaveTrimOnly = document.getElementById('btnSaveTrimOnly');
  const btnTrimAndConvertNow = document.getElementById('btnTrimAndConvertNow');

  setupDialogLightDismiss(videoTrimmerDialog);

  const trimmerVideoStage = videoTrimmerDialog?.querySelector('.trimmer-video-stage');
  let activeTrimmerItem = null;
  let vidTotalDuration = 3.0;
  let trimInSec = 0.0;
  let trimOutSec = 3.0;

  function syncTrimmerViewportAspect(w, h) {
    const validW = Number(w) || 16;
    const validH = Number(h) || 9;
    const isPortrait = validH > validW;
    if (trimmerVideoStage) {
      trimmerVideoStage.style.setProperty('--video-aspect', `${validW} / ${validH}`);
      trimmerVideoStage.classList.toggle('is-portrait', isPortrait);
    }
    if (filmstripTimeline) {
      filmstripTimeline.classList.toggle('is-portrait', isPortrait);
    }
  }

  async function openVideoTrimmer(item) {
    activeTrimmerItem = item;
    vidTotalDuration = item.duration || 3.0;
    const sc = item.studioConfig || {};
    trimInSec = sc.trimStart !== undefined ? parseFloat(sc.trimStart) || 0 : 0;
    trimOutSec = sc.trimEnd !== undefined ? parseFloat(sc.trimEnd) || vidTotalDuration : vidTotalDuration;

    syncTrimmerViewportAspect(item.width || 16, item.height || 9);

    trimmerVideoEl.src = item.inputUrl;
    trimmerVideoEl.currentTime = trimInSec;
    btnTrimmerPlayPause.textContent = '▶ PLAY SEGMENT';
    filmstripFrames.innerHTML = '';

    renderTrimHandles();
    videoTrimmerDialog.showModal();

    // Load 6-frame filmstrip thumbnails from server
    try {
      const res = await fetch(`/api/video-frames/${item.id}`);
      const data = await res.json();
      if (data.duration) {
        vidTotalDuration = data.duration;
        if (!sc.trimEnd) trimOutSec = vidTotalDuration;
        renderTrimHandles();
      }
      if (Array.isArray(data.frames)) {
        filmstripFrames.innerHTML = data.frames
          .map((f) => `<img src="${f.url}" alt="Frame at ${f.time}s" />`)
          .join('');
      }
    } catch (err) {
      console.warn('Could not load filmstrip frames:', err);
    }
  }

  function renderTrimHandles() {
    const dur = Math.max(0.1, vidTotalDuration);
    const inPct = Math.max(0, Math.min(98, (trimInSec / dur) * 100));
    const outPct = Math.max(inPct + 2, Math.min(100, (trimOutSec / dur) * 100));

    trimMaskLeft.style.width = `${inPct.toFixed(2)}%`;
    trimMaskRight.style.width = `${(100 - outPct).toFixed(2)}%`;
    trimSelectionBox.style.left = `${inPct.toFixed(2)}%`;
    trimSelectionBox.style.right = `${(100 - outPct).toFixed(2)}%`;

    trimInReadout.textContent = `${trimInSec.toFixed(2)}s`;
    trimOutReadout.textContent = `${trimOutSec.toFixed(2)}s`;
    const clipLen = Math.max(0.1, trimOutSec - trimInSec);
    trimmerClipDuration.textContent = `CLIP LENGTH: ${formatTimecode(clipLen)}`;
  }

  function updateTrimmerPlayhead() {
    const dur = Math.max(0.1, vidTotalDuration);
    const cur = trimmerVideoEl.currentTime || 0;
    const pct = Math.max(0, Math.min(100, (cur / dur) * 100));
    timelinePlayhead.style.left = `${pct.toFixed(2)}%`;
    trimmerCurrentTime.textContent = `PLAYHEAD: ${formatTimecode(cur)}`;

    if (!trimmerVideoEl.paused && cur >= trimOutSec) {
      if (chkTrimmerLoop.checked) {
        trimmerVideoEl.currentTime = trimInSec;
      } else {
        trimmerVideoEl.pause();
        btnTrimmerPlayPause.textContent = '▶ PLAY SEGMENT';
      }
    }
  }

  trimmerVideoEl?.addEventListener('timeupdate', updateTrimmerPlayhead);
  trimmerVideoEl?.addEventListener('loadedmetadata', () => {
    if (trimmerVideoEl.videoWidth && trimmerVideoEl.videoHeight) {
      syncTrimmerViewportAspect(trimmerVideoEl.videoWidth, trimmerVideoEl.videoHeight);
    }
    if (trimmerVideoEl.duration && isFinite(trimmerVideoEl.duration)) {
      vidTotalDuration = trimmerVideoEl.duration;
      if (trimOutSec > vidTotalDuration) trimOutSec = vidTotalDuration;
      renderTrimHandles();
      updateTrimmerPlayhead();
    }
  });

  btnTrimmerPlayPause?.addEventListener('click', async () => {
    if (trimmerVideoEl.paused) {
      if (trimmerVideoEl.currentTime < trimInSec || trimmerVideoEl.currentTime >= trimOutSec) {
        trimmerVideoEl.currentTime = trimInSec;
      }
      await trimmerVideoEl.play();
      btnTrimmerPlayPause.textContent = '⏸ PAUSE';
    } else {
      trimmerVideoEl.pause();
      btnTrimmerPlayPause.textContent = '▶ PLAY SEGMENT';
    }
  });

  btnTrimmerStepBack?.addEventListener('click', () => {
    trimmerVideoEl.pause();
    trimmerVideoEl.currentTime = Math.max(0, trimmerVideoEl.currentTime - 0.1);
    updateTrimmerPlayhead();
  });

  btnTrimmerStepFwd?.addEventListener('click', () => {
    trimmerVideoEl.pause();
    trimmerVideoEl.currentTime = Math.min(vidTotalDuration, trimmerVideoEl.currentTime + 0.1);
    updateTrimmerPlayhead();
  });

  btnSetInAtPlayhead?.addEventListener('click', () => {
    trimInSec = Math.min(trimOutSec - 0.1, Math.max(0, trimmerVideoEl.currentTime));
    renderTrimHandles();
  });

  btnSetOutAtPlayhead?.addEventListener('click', () => {
    trimOutSec = Math.max(trimInSec + 0.1, Math.min(vidTotalDuration, trimmerVideoEl.currentTime));
    renderTrimHandles();
  });

  btnResetTrimRange?.addEventListener('click', () => {
    trimInSec = 0;
    trimOutSec = vidTotalDuration;
    trimmerVideoEl.currentTime = 0;
    renderTrimHandles();
    updateTrimmerPlayhead();
  });

  // Pointer Dragging on Filmstrip Timeline (In Handle, Out Handle, or Scrubbing Playhead)
  let trimDragTarget = null; // 'in' | 'out' | 'scrub'

  filmstripTimeline?.addEventListener('pointerdown', (e) => {
    if (e.target.closest('#trimHandleIn')) {
      trimDragTarget = 'in';
    } else if (e.target.closest('#trimHandleOut')) {
      trimDragTarget = 'out';
    } else {
      trimDragTarget = 'scrub';
      applyTimelinePointer(e);
    }
    filmstripTimeline.setPointerCapture(e.pointerId);
  });

  filmstripTimeline?.addEventListener('pointermove', (e) => {
    if (!trimDragTarget) return;
    applyTimelinePointer(e);
  });

  filmstripTimeline?.addEventListener('pointerup', () => {
    trimDragTarget = null;
  });

  function applyTimelinePointer(e) {
    const rect = filmstripTimeline.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const timeSec = ratio * vidTotalDuration;

    if (trimDragTarget === 'in') {
      trimInSec = Math.max(0, Math.min(trimOutSec - 0.15, timeSec));
      trimmerVideoEl.currentTime = trimInSec;
      renderTrimHandles();
    } else if (trimDragTarget === 'out') {
      trimOutSec = Math.min(vidTotalDuration, Math.max(trimInSec + 0.15, timeSec));
      trimmerVideoEl.currentTime = trimOutSec;
      renderTrimHandles();
    } else if (trimDragTarget === 'scrub') {
      trimmerVideoEl.currentTime = timeSec;
      updateTrimmerPlayhead();
    }
  }

  async function saveVideoTrimConfig(convertImmediately = false) {
    if (!activeTrimmerItem) return;
    trimmerVideoEl.pause();
    const studioConfig = {
      trimStart: trimInSec.toFixed(2),
      trimEnd: trimOutSec.toFixed(2)
    };
    trimStartEl.value = studioConfig.trimStart;
    trimEndEl.value = studioConfig.trimEnd;

    try {
      const res = await fetch(`/api/items/${activeTrimmerItem.id}/studio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studioConfig, applyToAll: false })
      });
      const data = await res.json();
      if (data.item) upsertQueueItem(data.item);
    } catch (err) {
      console.error('Failed to save video trim config:', err);
    }

    videoTrimmerDialog.close();
    if (convertImmediately) {
      await processItems([activeTrimmerItem.id]);
    }
  }

  btnSaveTrimOnly?.addEventListener('click', () => saveVideoTrimConfig(false));
  btnTrimAndConvertNow?.addEventListener('click', () => saveVideoTrimConfig(true));
  btnCloseVideoTrimmer?.addEventListener('click', () => {
    trimmerVideoEl.pause();
    videoTrimmerDialog.close();
  });
  videoTrimmerDialog?.addEventListener('close', () => trimmerVideoEl?.pause());

  // ---- Stop Instance / Server Shutdown Flow ----
  btnStopInstance.addEventListener('click', () => {
    shutdownPidDisplay.textContent = serverPid;
    shutdownDialog.showModal();
  });

  btnCancelShutdown.addEventListener('click', () => shutdownDialog.close());
  btnDismissShutdown.addEventListener('click', () => shutdownDialog.close());

  btnConfirmShutdown.addEventListener('click', async () => {
    btnConfirmShutdown.disabled = true;
    try {
      await fetch('/api/shutdown', { method: 'POST' });
    } catch (_) {}
    shutdownDialog.close();
    showOfflineState();
  });

  function showOfflineState() {
    engineStatusDot.classList.remove('online');
    engineStatusDot.classList.add('offline');
    engineStatusText.textContent = 'OFFLINE';
    offlineOverlay.hidden = false;
  }

  // ---- Global Telemetry & Stats Updater ----
  function updateGlobalStats() {
    const all = Array.from(itemsMap.values());
    const completed = all.filter((i) => i.status === 'completed' && i.output);

    statQueueCount.textContent = `${all.length} FILE${all.length === 1 ? '' : 'S'}`;
    queueFilterInfo.textContent = `${all.length} TOTAL • ${completed.length} COMPLETED`;

    btnClearQueue.disabled = all.length === 0;
    btnProcessAll.disabled = all.length === 0;
    btnDownloadZip.disabled = completed.length === 0;

    let totalOrig = 0;
    let totalSaved = 0;
    for (const c of completed) {
      totalOrig += c.originalSize;
      totalSaved += Math.max(0, c.output.savedBytes);
    }
    const pct = totalOrig > 0 ? Math.round((totalSaved / totalOrig) * 1000) / 10 : 0;
    statBytesSaved.textContent = `${formatBytes(totalSaved)} (${pct}%)`;
  }

  // ---- Connect Real-Time SSE Stream & Load Initial State ----
  async function initApp() {
    applyPreset('web-ultra');

    try {
      const res = await fetch('/api/state');
      const data = await res.json();
      if (data.engine?.pid) {
        serverPid = data.engine.pid;
      }
      if (Array.isArray(data.items)) {
        data.items.reverse().forEach((item) => upsertQueueItem(item));
        updateGlobalStats();
      }
    } catch (err) {
      console.warn('Initial state fetch warning:', err);
    }

    // Subscribe to Server-Sent Events for live progress
    const evtSource = new EventSource('/api/events');
    evtSource.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'job-progress') {
          const item = itemsMap.get(msg.payload.id);
          if (item) {
            item.status = msg.payload.status;
            item.progress = msg.payload.progress;
            upsertQueueItem(item);
          }
        } else if (msg.type === 'job-completed' || msg.type === 'job-error') {
          upsertQueueItem(msg.payload.item);
          updateGlobalStats();
        } else if (msg.type === 'system-shutdown') {
          showOfflineState();
          evtSource.close();
        }
      } catch (_) {}
    };
  }

  initApp();
})();
