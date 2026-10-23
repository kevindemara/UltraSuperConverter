const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;
const archiver = require('archiver');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execFile } = require('child_process');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3847;

// Directories
const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const UPLOADS_DIR = path.join(ROOT_DIR, 'uploads');
const OUTPUTS_DIR = path.join(ROOT_DIR, 'outputs');
const THUMBS_DIR = path.join(ROOT_DIR, 'uploads', 'thumbs');
const PID_FILE = path.join(ROOT_DIR, '.server.pid');

[PUBLIC_DIR, UPLOADS_DIR, OUTPUTS_DIR, THUMBS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Write PID file for start.cmd / stop.cmd management
try {
  fs.writeFileSync(PID_FILE, String(process.pid), 'utf8');
} catch (err) {
  console.warn('Could not write PID file:', err.message);
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(PUBLIC_DIR));
app.use('/uploads', express.static(UPLOADS_DIR));
app.use('/outputs', express.static(OUTPUTS_DIR));

// Disable sharp cache so files can be overwritten/cleaned up cleanly on Windows
sharp.cache(false);

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const id = crypto.randomBytes(6).toString('hex');
    const safeOrig = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${id}_${safeOrig}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 } // 2GB max per file
});

// In-memory store for uploaded items & conversion jobs
const mediaStore = new Map();
const sseClients = new Set();

function broadcastEvent(type, payload) {
  const data = `data: ${JSON.stringify({ type, payload, timestamp: Date.now() })}\n\n`;
  for (const res of sseClients) {
    try {
      res.write(data);
    } catch (_) {
      sseClients.delete(res);
    }
  }
}

// Classify file category
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.tiff', '.tif', '.svg', '.ico', '.bmp', '.jfif', '.heic']);
const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov', '.mkv', '.avi', '.flv', '.wmv', '.m4v', '.mpeg', '.mpg', '.3gp', '.ogv', '.ts']);
const AUDIO_EXTS = new Set(['.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg', '.opus', '.wma']);

function getMediaType(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (IMAGE_EXTS.has(ext)) return 'image';
  if (VIDEO_EXTS.has(ext)) return 'video';
  if (AUDIO_EXTS.has(ext)) return 'audio';
  return 'unknown';
}

// Probe video/audio with ffprobe
function probeMedia(filePath) {
  return new Promise((resolve) => {
    execFile(
      ffprobePath,
      ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath],
      { timeout: 15000 },
      (err, stdout) => {
        if (err || !stdout) return resolve({});
        try {
          const parsed = JSON.parse(stdout);
          const videoStream = (parsed.streams || []).find((s) => s.codec_type === 'video');
          const audioStream = (parsed.streams || []).find((s) => s.codec_type === 'audio');
          const duration = parseFloat(parsed.format?.duration || videoStream?.duration || audioStream?.duration || 0);
          let fps = null;
          if (videoStream?.r_frame_rate) {
            const parts = videoStream.r_frame_rate.split('/').map(Number);
            if (parts.length === 2 && parts[1] > 0) fps = Math.round((parts[0] / parts[1]) * 100) / 100;
          }

          let width = videoStream?.width || null;
          let height = videoStream?.height || null;

          // Account for rotation metadata on portrait phone videos (90 / -90 / 270 deg)
          let rotation = parseInt(videoStream?.tags?.rotate || '0', 10);
          if (!rotation && Array.isArray(videoStream?.side_data_list)) {
            const rotSide = videoStream.side_data_list.find((sd) => sd.rotation !== undefined);
            if (rotSide) rotation = parseInt(rotSide.rotation, 10) || 0;
          }
          if (width && height && (Math.abs(rotation) === 90 || Math.abs(rotation) === 270)) {
            const tmp = width;
            width = height;
            height = tmp;
          }

          resolve({
            width,
            height,
            duration: duration || null,
            videoCodec: videoStream?.codec_name || null,
            audioCodec: audioStream?.codec_name || null,
            fps,
            bitrate: parsed.format?.bit_rate ? parseInt(parsed.format.bit_rate, 10) : null,
            hasAudio: !!audioStream
          });
        } catch (_) {
          resolve({});
        }
      }
    );
  });
}

// Generate video thumbnail frame
function generateVideoThumbnail(videoPath, thumbPath, seekSeconds = 0.5) {
  return new Promise((resolve) => {
    execFile(
      ffmpegPath,
      [
        '-y',
        '-ss', String(seekSeconds),
        '-i', videoPath,
        '-frames:v', '1',
        '-vf', 'scale=480:-2',
        '-q:v', '4',
        thumbPath
      ],
      { timeout: 15000 },
      (err) => {
        if (err || !fs.existsSync(thumbPath)) {
          // Try at 0s if 0.5s failed
          execFile(
            ffmpegPath,
            ['-y', '-i', videoPath, '-frames:v', '1', '-vf', 'scale=480:-2', thumbPath],
            { timeout: 15000 },
            () => resolve(fs.existsSync(thumbPath))
          );
        } else {
          resolve(true);
        }
      }
    );
  });
}

// Inspect any uploaded file and register in mediaStore
async function inspectAndRegisterFile(fileObj) {
  const id = crypto.randomBytes(8).toString('hex');
  const ext = path.extname(fileObj.originalname).toLowerCase();
  const mediaType = getMediaType(fileObj.originalname);
  const stats = fs.statSync(fileObj.path);

  const item = {
    id,
    originalName: fileObj.originalname,
    storedName: path.basename(fileObj.path),
    inputPath: fileObj.path,
    inputUrl: `/uploads/${path.basename(fileObj.path)}`,
    thumbUrl: null,
    mediaType,
    originalFormat: ext.replace('.', '').toUpperCase() || 'BIN',
    originalSize: stats.size,
    width: null,
    height: null,
    duration: null,
    fps: null,
    codec: null,
    colorSpace: null,
    hasAlpha: false,
    status: 'ready', // ready | processing | completed | error
    progress: 0,
    error: null,
    output: null,
    createdAt: Date.now()
  };

  if (mediaType === 'image') {
    try {
      const meta = await sharp(fileObj.path, { animated: true }).metadata();
      item.width = meta.width || null;
      item.height = meta.height || null;
      item.colorSpace = meta.space || null;
      item.hasAlpha = !!meta.hasAlpha;
      item.codec = (meta.format || item.originalFormat).toUpperCase();

      // Create lightweight web thumbnail
      const thumbName = `thumb_${id}.webp`;
      const thumbPath = path.join(THUMBS_DIR, thumbName);
      await sharp(fileObj.path, { animated: false })
        .rotate()
        .resize(480, 480, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(thumbPath);
      item.thumbUrl = `/uploads/thumbs/${thumbName}`;
    } catch (err) {
      // Fallback for formats sharp might not read directly (like certain ICO/BMP)
      item.thumbUrl = item.inputUrl;
    }
  } else if (mediaType === 'video' || mediaType === 'audio') {
    const info = await probeMedia(fileObj.path);
    item.width = info.width;
    item.height = info.height;
    item.duration = info.duration;
    item.fps = info.fps;
    item.codec = (info.videoCodec || info.audioCodec || item.originalFormat).toUpperCase();
    item.hasAudio = info.hasAudio;

    if (mediaType === 'video') {
      const thumbName = `thumb_${id}.jpg`;
      const thumbPath = path.join(THUMBS_DIR, thumbName);
      const ok = await generateVideoThumbnail(fileObj.path, thumbPath, info.duration ? Math.min(1.0, info.duration * 0.2) : 0);
      if (ok) item.thumbUrl = `/uploads/thumbs/${thumbName}`;
    }
  }

  mediaStore.set(id, item);
  return item;
}

// Helper: Encode raw RGBA/RGB buffer to BMP
async function encodeBmpFromSharp(pipeline) {
  const { data, info } = await pipeline
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const width = info.width;
  const height = info.height;
  const rowSize = Math.floor((24 * width + 31) / 32) * 4;
  const pixelArraySize = rowSize * height;
  const fileSize = 54 + pixelArraySize;
  const buf = Buffer.alloc(fileSize);

  // BMP Header
  buf.write('BM', 0);
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(54, 10);
  // DIB Header (BITMAPINFOHEADER)
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(-height, 22); // top-down BMP
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(0, 30);
  buf.writeUInt32LE(pixelArraySize, 34);
  buf.writeInt32LE(2835, 38);
  buf.writeInt32LE(2835, 42);

  for (let y = 0; y < height; y++) {
    const dstRowOffset = 54 + y * rowSize;
    const srcRowOffset = y * width * 3;
    for (let x = 0; x < width; x++) {
      const r = data[srcRowOffset + x * 3];
      const g = data[srcRowOffset + x * 3 + 1];
      const b = data[srcRowOffset + x * 3 + 2];
      buf[dstRowOffset + x * 3] = b;
      buf[dstRowOffset + x * 3 + 1] = g;
      buf[dstRowOffset + x * 3 + 2] = r;
    }
  }
  return buf;
}

// Helper: Encode PNG buffer(s) into a valid Windows .ICO container
async function encodeIcoFromSharp(pipeline, targetSize = 256) {
  const size = Math.min(256, Math.max(16, targetSize || 256));
  const pngBuf = await pipeline
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();

  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // Type 1 = ICO
  header.writeUInt16LE(1, 4); // 1 image
  header.writeUInt8(size === 256 ? 0 : size, 6); // Width
  header.writeUInt8(size === 256 ? 0 : size, 7); // Height
  header.writeUInt8(0, 8); // Palette
  header.writeUInt8(0, 9); // Reserved
  header.writeUInt16LE(1, 10); // Color planes
  header.writeUInt16LE(32, 12); // Bits per pixel
  header.writeUInt32LE(pngBuf.length, 14); // Size of PNG data
  header.writeUInt32LE(22, 18); // Offset of PNG data

  return Buffer.concat([header, pngBuf]);
}

// Helper: Parse hex color to RGB object
function parseHexColor(hex, alpha = 1) {
  const clean = (hex || '#ffffff').replace('#', '');
  if (clean.length === 6) {
    return {
      r: parseInt(clean.slice(0, 2), 16) || 255,
      g: parseInt(clean.slice(2, 4), 16) || 255,
      b: parseInt(clean.slice(4, 6), 16) || 255,
      alpha
    };
  }
  return { r: 255, g: 255, b: 255, alpha };
}

// Process an Image item with full options + Interactive Crop + Visual Watermark Positioner + Target Size binary search
async function processImageItem(item, baseSettings) {
  const settings = { ...baseSettings, ...(item.studioConfig || {}) };
  const startTime = Date.now();
  item.status = 'processing';
  item.progress = 15;
  item.error = null;
  broadcastEvent('job-progress', { id: item.id, status: item.status, progress: item.progress });

  // Determine target format
  let outFormat = (settings.imageFormat || 'auto').toLowerCase();
  if (outFormat === 'auto') {
    if (settings.preset === 'web-ultra' || settings.preset === 'ecommerce' || settings.preset === 'email-light') {
      outFormat = 'webp';
    } else if (settings.preset === 'nextgen-avif') {
      outFormat = 'avif';
    } else {
      const orig = item.originalFormat.toLowerCase();
      outFormat = ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif', 'tiff', 'ico', 'bmp'].includes(orig) ? orig : 'webp';
    }
  }
  if (outFormat === 'jpeg') outFormat = 'jpg';

  const quality = Math.min(100, Math.max(1, parseInt(settings.quality, 10) || 80));
  const lossless = !!settings.lossless;
  const stripMetadata = settings.stripMetadata !== false;
  const progressive = settings.progressive !== false;

  const srcMeta = await sharp(item.inputPath).metadata();
  const srcW = srcMeta.width || item.width || 800;
  const srcH = srcMeta.height || item.height || 600;

  // Build base Sharp pipeline function so we can re-run if targetSizeKB binary search is active
  const buildPipeline = async (scaleFactor = 1.0) => {
    const isAnimated = outFormat === 'gif' || (outFormat === 'webp' && item.originalFormat === 'GIF');
    let pipe = sharp(item.inputPath, { animated: isAnimated });

    let activeW = srcW;
    let activeH = srcH;

    // 1. Interactive Studio Crop (normalized 0..1 coordinates: { x, y, w, h })
    if (settings.cropRect && !isAnimated) {
      const cr = settings.cropRect;
      const left = Math.max(0, Math.min(srcW - 4, Math.round((cr.x || 0) * srcW)));
      const top = Math.max(0, Math.min(srcH - 4, Math.round((cr.y || 0) * srcH)));
      const width = Math.max(4, Math.min(srcW - left, Math.round((cr.w || 1) * srcW)));
      const height = Math.max(4, Math.min(srcH - top, Math.round((cr.h || 1) * srcH)));
      if (width < srcW || height < srcH || left > 0 || top > 0) {
        pipe = pipe.extract({ left, top, width, height });
        activeW = width;
        activeH = height;
      }
    }

    // 2. Orientation & Flips
    const rotAngle = parseInt(settings.rotate, 10) || 0;
    pipe = pipe.rotate(rotAngle);
    if (rotAngle === 90 || rotAngle === 270) {
      const tmp = activeW;
      activeW = activeH;
      activeH = tmp;
    }

    if (settings.flipH) pipe = pipe.flop();
    if (settings.flipV) pipe = pipe.flip();

    // 3. Geometric Resizing
    const resizeMode = settings.resizeMode || 'none';
    const fitMode = settings.fitMode || 'inside';
    const bgHex = settings.backgroundColor || '#ffffff';
    const bgAlpha = (outFormat === 'jpg' || outFormat === 'bmp' || settings.transparentBg === false) ? 1 : 0;
    const bgObj = parseHexColor(bgHex, bgAlpha);

    let targetW = null;
    let targetH = null;

    if (resizeMode === 'dimensions') {
      targetW = parseInt(settings.width, 10) || null;
      targetH = parseInt(settings.height, 10) || null;
    } else if (resizeMode === 'scale' && activeW && activeH) {
      const pct = Math.min(400, Math.max(5, parseFloat(settings.scalePercent) || 100)) / 100;
      targetW = Math.max(1, Math.round(activeW * pct));
      targetH = Math.max(1, Math.round(activeH * pct));
    } else if (resizeMode === 'maxDimension') {
      const maxDim = parseInt(settings.maxDimension, 10) || 1920;
      if (activeW > maxDim || activeH > maxDim) {
        if (activeW >= activeH) {
          targetW = maxDim;
          targetH = Math.max(1, Math.round((activeH / activeW) * maxDim));
        } else {
          targetH = maxDim;
          targetW = Math.max(1, Math.round((activeW / activeH) * maxDim));
        }
      }
    }

    let finalCanvasW = targetW || activeW;
    let finalCanvasH = targetH || activeH;

    if (scaleFactor < 1.0) {
      finalCanvasW = Math.max(16, Math.round(finalCanvasW * scaleFactor));
      finalCanvasH = Math.max(16, Math.round(finalCanvasH * scaleFactor));
      targetW = finalCanvasW;
      targetH = finalCanvasH;
    }

    if (targetW || targetH) {
      pipe = pipe.resize(targetW, targetH, {
        fit: resizeMode === 'maxDimension' ? 'inside' : fitMode,
        withoutEnlargement: settings.withoutEnlargement !== false,
        background: bgObj
      });
    }

    // 4. Color & Filter adjustments
    const brightness = parseFloat(settings.brightness) || 1.0;
    const saturation = settings.saturation !== undefined ? parseFloat(settings.saturation) : 1.0;
    if (brightness !== 1.0 || saturation !== 1.0) {
      pipe = pipe.modulate({ brightness, saturation });
    }

    if (settings.grayscale) pipe = pipe.grayscale();
    if (settings.sharpen) pipe = pipe.sharpen({ sigma: 1.2 });
    const blurSigma = parseFloat(settings.blur) || 0;
    if (blurSigma >= 0.3) pipe = pipe.blur(Math.min(50, blurSigma));

    // Flatten if output is JPG
    if (outFormat === 'jpg') {
      pipe = pipe.flatten({ background: parseHexColor(bgHex, 1) });
    }

    // 5. Visual Watermark Overlay (supports arbitrary X/Y canvas coordinates, style, scale & opacity)
    const wmText = (settings.watermarkText || '').trim();
    if (wmText && !isAnimated) {
      const w = finalCanvasW;
      const h = finalCanvasH;
      const wmScale = Math.min(3.0, Math.max(0.4, parseFloat(settings.watermarkScale) || 1.0));
      const wmOpacity = Math.min(1.0, Math.max(0.1, parseFloat(settings.watermarkOpacity) || 0.9));
      const wmStyle = settings.watermarkStyle || 'obsidian';
      const wmX = settings.watermarkX !== undefined ? Math.min(0.96, Math.max(0.04, parseFloat(settings.watermarkX))) : 0.84;
      const wmY = settings.watermarkY !== undefined ? Math.min(0.96, Math.max(0.04, parseFloat(settings.watermarkY))) : 0.90;

      const fontSize = Math.max(12, Math.round(Math.min(w, h) * 0.036 * wmScale));
      const escaped = wmText
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

      const boxW = Math.round(escaped.length * fontSize * 0.64 + fontSize * 1.4);
      const boxH = Math.round(fontSize * 1.75);
      const centerX = Math.max(boxW / 2 + 4, Math.min(w - boxW / 2 - 4, Math.round(wmX * w)));
      const centerY = Math.max(boxH / 2 + 4, Math.min(h - boxH / 2 - 4, Math.round(wmY * h)));
      const rectX = Math.round(centerX - boxW / 2);
      const rectY = Math.round(centerY - boxH / 2);
      const textY = Math.round(centerY + fontSize * 0.35);

      let bgFill = 'rgba(9,13,22,0.82)';
      let textFill = '#ffffff';
      let strokeColor = '#00d2ff';

      if (wmStyle === 'light') {
        bgFill = 'rgba(255,255,255,0.88)';
        textFill = '#090d16';
        strokeColor = '#0055ff';
      } else if (wmStyle === 'cyber') {
        bgFill = 'rgba(0,85,255,0.88)';
        textFill = '#ffffff';
        strokeColor = '#00d2ff';
      } else if (wmStyle === 'minimal') {
        bgFill = 'rgba(0,0,0,0)';
        textFill = '#ffffff';
        strokeColor = 'rgba(9,13,22,0.8)';
      }

      const svgOverlay = Buffer.from(`
        <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
          <g opacity="${wmOpacity}">
            ${wmStyle !== 'minimal' ? `<rect x="${rectX}" y="${rectY}" width="${boxW}" height="${boxH}" rx="${Math.round(fontSize * 0.35)}" fill="${bgFill}" stroke="${strokeColor}" stroke-width="${Math.max(1.5, Math.round(fontSize * 0.08))}" />` : ''}
            <text x="${centerX}" y="${textY}" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-weight="800" font-size="${fontSize}px" fill="${textFill}" letter-spacing="1.5px" ${wmStyle === 'minimal' ? `stroke="#090d16" stroke-width="${Math.max(2, Math.round(fontSize * 0.12))}" paint-order="stroke"` : ''}>${escaped}</text>
          </g>
        </svg>
      `);
      pipe = pipe.composite([{ input: svgOverlay, top: 0, left: 0 }]);
    }

    if (!stripMetadata) {
      pipe = pipe.keepMetadata();
    }

    return pipe;
  };

  const encodeWithQuality = async (q, scaleFactor = 1.0) => {
    const pipe = await buildPipeline(scaleFactor);
    if (outFormat === 'webp') {
      return pipe.webp({ quality: q, lossless, effort: 4 }).toBuffer({ resolveWithObject: true });
    } else if (outFormat === 'avif') {
      return pipe.avif({ quality: q, lossless, effort: 4 }).toBuffer({ resolveWithObject: true });
    } else if (outFormat === 'jpg') {
      return pipe.jpeg({ quality: q, progressive, mozjpeg: true }).toBuffer({ resolveWithObject: true });
    } else if (outFormat === 'png') {
      const compressionLevel = Math.min(9, Math.max(0, Math.round((100 - q) / 10)));
      return pipe.png({ quality: q, compressionLevel, progressive, palette: !lossless && q < 95 }).toBuffer({ resolveWithObject: true });
    } else if (outFormat === 'gif') {
      return pipe.gif({ effort: 7 }).toBuffer({ resolveWithObject: true });
    } else if (outFormat === 'tiff') {
      return pipe.tiff({ quality: q, compression: 'lzw' }).toBuffer({ resolveWithObject: true });
    } else if (outFormat === 'ico') {
      const buf = await encodeIcoFromSharp(pipe, parseInt(settings.width, 10) || 256);
      return { data: buf, info: { width: Math.min(256, parseInt(settings.width, 10) || 256), height: Math.min(256, parseInt(settings.width, 10) || 256), format: 'ico' } };
    } else if (outFormat === 'bmp') {
      const buf = await encodeBmpFromSharp(pipe);
      const meta = await (await buildPipeline(scaleFactor)).metadata();
      return { data: buf, info: { width: meta.width, height: meta.height, format: 'bmp' } };
    } else {
      return pipe.webp({ quality: q }).toBuffer({ resolveWithObject: true });
    }
  };

  item.progress = 45;
  broadcastEvent('job-progress', { id: item.id, status: item.status, progress: item.progress });

  let result = await encodeWithQuality(quality, 1.0);

  // Target Max File Size (KB) auto-optimization binary search
  const targetSizeBytes = (parseFloat(settings.targetSizeKB) || 0) * 1024;
  if (targetSizeBytes > 0 && result.data.length > targetSizeBytes && ['webp', 'avif', 'jpg', 'png'].includes(outFormat)) {
    let low = 10;
    let high = quality - 5;
    let best = result;
    for (let step = 0; step < 5 && low <= high; step++) {
      const mid = Math.floor((low + high) / 2);
      const candidate = await encodeWithQuality(mid, 1.0);
      best = candidate;
      if (candidate.data.length <= targetSizeBytes) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    // If still larger than targetSizeBytes, step down resolution scale
    let scale = 0.85;
    while (best.data.length > targetSizeBytes && scale >= 0.35) {
      best = await encodeWithQuality(Math.max(25, low), scale);
      scale -= 0.18;
    }
    result = best;
  }

  item.progress = 85;
  broadcastEvent('job-progress', { id: item.id, status: item.status, progress: item.progress });

  // Build output filename
  const baseName = path.parse(item.originalName).name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const suffix = settings.filenameSuffix !== undefined ? settings.filenameSuffix : '_ultra';
  const outFileName = `${baseName}${suffix}_${item.id.slice(0, 4)}.${outFormat}`;
  const outPath = path.join(OUTPUTS_DIR, outFileName);

  fs.writeFileSync(outPath, result.data);

  // Inspect final dimensions if needed
  let finalW = result.info?.width || item.width;
  let finalH = result.info?.height || item.height;
  if (!finalW || !finalH) {
    try {
      const outMeta = await sharp(outPath).metadata();
      finalW = outMeta.width;
      finalH = outMeta.height;
    } catch (_) {}
  }

  const outSize = result.data.length;
  const savedBytes = item.originalSize - outSize;
  const savedPercent = item.originalSize > 0 ? Math.round((savedBytes / item.originalSize) * 1000) / 10 : 0;

  item.status = 'completed';
  item.progress = 100;
  item.output = {
    fileName: outFileName,
    url: `/outputs/${outFileName}`,
    format: outFormat.toUpperCase(),
    size: outSize,
    width: finalW,
    height: finalH,
    savedBytes,
    savedPercent,
    elapsedMs: Date.now() - startTime
  };

  broadcastEvent('job-completed', { id: item.id, item });
  return item;
}

// Helper: Parse time string (seconds or HH:MM:SS) to float seconds
function parseTimeSeconds(val) {
  if (val === undefined || val === null || val === '') return null;
  const str = String(val).trim();
  if (!str) return null;
  if (/^\d+(\.\d+)?$/.test(str)) return parseFloat(str);
  const parts = str.split(':').map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

// Process a Video or Audio item with FFmpeg and live progress
async function processVideoOrAudioItem(item, baseSettings) {
  const settings = { ...baseSettings, ...(item.studioConfig || {}) };
  const startTime = Date.now();
  item.status = 'processing';
  item.progress = 5;
  item.error = null;
  broadcastEvent('job-progress', { id: item.id, status: item.status, progress: item.progress });

  // Determine output format
  let outFormat = (settings.videoFormat || 'auto').toLowerCase();
  if (settings.audioMode === 'extract' || item.mediaType === 'audio') {
    outFormat = (settings.audioFormat || 'mp3').toLowerCase();
    if (!['mp3', 'aac', 'wav', 'flac', 'ogg', 'opus'].includes(outFormat)) {
      outFormat = 'mp3';
    }
  } else if (outFormat === 'auto') {
    if (settings.preset === 'video-gif') {
      outFormat = 'gif';
    } else if (settings.preset === 'audio-extract') {
      outFormat = 'mp3';
    } else {
      outFormat = 'mp4';
    }
  }

  const baseName = path.parse(item.originalName).name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const suffix = settings.filenameSuffix !== undefined ? settings.filenameSuffix : '_ultra';
  const outFileName = `${baseName}${suffix}_${item.id.slice(0, 4)}.${outFormat}`;
  const outPath = path.join(OUTPUTS_DIR, outFileName);

  const args = ['-y'];

  // Trim start / end calculation
  const startSec = parseTimeSeconds(settings.trimStart);
  const endSec = parseTimeSeconds(settings.trimEnd);
  let effectiveDuration = item.duration || 4;

  if (startSec !== null && startSec > 0) {
    args.push('-ss', startSec.toFixed(3));
    effectiveDuration = Math.max(0.2, effectiveDuration - startSec);
  }
  args.push('-i', item.inputPath);
  if (endSec !== null && endSec > 0) {
    const clipLen = startSec !== null && startSec > 0 ? Math.max(0.1, endSec - startSec) : endSec;
    args.push('-t', clipLen.toFixed(3));
    effectiveDuration = clipLen;
  }

  const isAudioOutput = ['mp3', 'aac', 'wav', 'flac', 'ogg', 'opus'].includes(outFormat);

  if (isAudioOutput) {
    args.push('-vn'); // No video
    const aBitrate = settings.audioBitrate || '192k';
    if (settings.normalizeAudio) {
      args.push('-af', 'loudnorm');
    }
    if (outFormat === 'mp3') {
      args.push('-c:a', 'libmp3lame', '-b:a', aBitrate);
    } else if (outFormat === 'aac') {
      args.push('-c:a', 'aac', '-b:a', aBitrate);
    } else if (outFormat === 'wav') {
      args.push('-c:a', 'pcm_s16le');
    } else if (outFormat === 'flac') {
      args.push('-c:a', 'flac');
    } else if (outFormat === 'ogg') {
      args.push('-c:a', 'libvorbis', '-b:a', aBitrate);
    } else if (outFormat === 'opus') {
      args.push('-c:a', 'libopus', '-b:a', aBitrate);
    }
  } else if (outFormat === 'gif' || outFormat === 'webp') {
    // High quality animated GIF / WebP (orientation-aware for portrait & landscape)
    const fps = parseInt(settings.fps, 10) || 15;
    const resTarget = parseInt(settings.videoResolution, 10) || 480;
    const isPortrait = item.height && item.width && item.height > item.width;
    const vfParts = [`fps=${fps}`];
    if (resTarget && resTarget > 0) {
      if (isPortrait) {
        vfParts.push(`scale='min(${resTarget},iw)':-2:flags=lanczos`);
      } else {
        vfParts.push(`scale=-2:'min(${resTarget},ih)':flags=lanczos`);
      }
    }
    if (outFormat === 'gif') {
      vfParts.push('split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer');
      args.push('-vf', vfParts.join(','));
      args.push('-loop', '0');
    } else {
      args.push('-vf', vfParts.join(','));
      args.push('-vcodec', 'libwebp', '-lossless', '0', '-compression_level', '4', '-q:v', String(settings.quality || 75), '-loop', '0', '-an');
    }
  } else {
    // Standard video transcode / compression / resize
    const vFilters = [];

    // Resolution scaling (orientation-aware so 1080p/720p preserves portrait aspect ratio)
    const vRes = settings.videoResolution || 'original';
    const isPortrait = item.height && item.width && item.height > item.width;
    if (vRes === 'custom' && (settings.width || settings.height)) {
      const w = parseInt(settings.width, 10) ? Math.floor(parseInt(settings.width, 10) / 2) * 2 : -2;
      const h = parseInt(settings.height, 10) ? Math.floor(parseInt(settings.height, 10) / 2) * 2 : -2;
      vFilters.push(`scale=${w}:${h}`);
    } else if (['2160', '1440', '1080', '720', '480', '360'].includes(String(vRes))) {
      const targetEdge = parseInt(vRes, 10);
      if (isPortrait) {
        vFilters.push(`scale='min(${targetEdge},iw)':-2`);
      } else {
        vFilters.push(`scale=-2:'min(${targetEdge},ih)'`);
      }
    } else {
      // Ensure even dimensions for YUV420p compatibility
      vFilters.push('scale=trunc(iw/2)*2:trunc(ih/2)*2');
    }

    // FPS adjustment
    if (settings.fps && settings.fps !== 'original') {
      const fpsNum = parseInt(settings.fps, 10);
      if (fpsNum > 0) vFilters.push(`fps=${fpsNum}`);
    }

    // Speed multiplier
    const speed = parseFloat(settings.speed) || 1.0;
    if (speed !== 1.0 && speed >= 0.25 && speed <= 4.0) {
      vFilters.push(`setpts=${(1 / speed).toFixed(3)}*PTS`);
    }

    if (vFilters.length > 0) {
      args.push('-vf', vFilters.join(','));
    }

    // Video Codec & CRF / Target Size Bitrate
    const crf = Math.min(42, Math.max(12, parseInt(settings.crf, 10) || 25));
    const vPreset = settings.videoPreset || 'faster';
    let codec = settings.videoCodec || 'auto';

    if (outFormat === 'webm') {
      codec = 'libvpx-vp9';
    } else if (codec === 'auto') {
      codec = 'libx264';
    }

    args.push('-c:v', codec);

    // Check if Target File Size (MB) is set
    const targetMB = parseFloat(settings.targetSizeMB) || 0;
    const durationSec = effectiveDuration || item.duration || 5;
    if (targetMB > 0 && durationSec > 0) {
      const totalBits = targetMB * 8 * 1024 * 1024 * 0.92; // 8% container safety margin
      const audioBitsPerSec = settings.audioMode === 'mute' ? 0 : 128 * 1000;
      const videoBitrateKbps = Math.max(120, Math.floor((totalBits / durationSec - audioBitsPerSec) / 1000));
      args.push('-b:v', `${videoBitrateKbps}k`, '-maxrate', `${Math.round(videoBitrateKbps * 1.25)}k`, '-bufsize', `${videoBitrateKbps * 2}k`);
    } else {
      args.push('-crf', String(crf));
      if (codec === 'libvpx-vp9') {
        args.push('-b:v', '0', '-deadline', 'realtime', '-cpu-used', '4');
      }
    }

    if (codec === 'libx264' || codec === 'libx265') {
      args.push('-preset', vPreset, '-pix_fmt', 'yuv420p');
    }

    // Audio handling
    if (settings.audioMode === 'mute' || !item.hasAudio) {
      args.push('-an');
    } else {
      const aFilters = [];
      if (speed !== 1.0 && speed >= 0.5 && speed <= 2.0) {
        aFilters.push(`atempo=${speed}`);
      }
      if (settings.normalizeAudio) {
        aFilters.push('loudnorm');
      }
      if (aFilters.length > 0) {
        args.push('-af', aFilters.join(','));
      }
      const aBitrate = settings.audioBitrate || '128k';
      if (outFormat === 'webm') {
        args.push('-c:a', 'libopus', '-b:a', aBitrate);
      } else {
        args.push('-c:a', 'aac', '-b:a', aBitrate);
      }
    }

    // FastStart for MP4/MOV
    if ((outFormat === 'mp4' || outFormat === 'mov') && settings.faststart !== false) {
      args.push('-movflags', '+faststart');
    }
  }

  args.push('-progress', 'pipe:1', '-nostats', outPath);

  await new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args);
    const totalDurationUs = (effectiveDuration || item.duration || 4) * 1_000_000;
    let stderrLog = '';

    proc.stdout.on('data', (chunk) => {
      const lines = chunk.toString().split(/\r?\n/);
      for (const line of lines) {
        if (line.startsWith('out_time_us=')) {
          const us = parseInt(line.split('=')[1], 10);
          if (!isNaN(us) && totalDurationUs > 0) {
            const pct = Math.min(96, Math.max(8, Math.round((us / totalDurationUs) * 100)));
            if (pct > item.progress) {
              item.progress = pct;
              broadcastEvent('job-progress', { id: item.id, status: item.status, progress: item.progress });
            }
          }
        }
      }
    });

    proc.stderr.on('data', (chunk) => {
      stderrLog += chunk.toString();
    });

    proc.on('close', (code) => {
      if (code === 0 && fs.existsSync(outPath)) {
        resolve();
      } else {
        reject(new Error(`FFmpeg exited with code ${code}: ${stderrLog.slice(-300)}`));
      }
    });

    proc.on('error', (err) => reject(err));
  });

  const outStats = fs.statSync(outPath);
  const outInfo = await probeMedia(outPath);
  const savedBytes = item.originalSize - outStats.size;
  const savedPercent = item.originalSize > 0 ? Math.round((savedBytes / item.originalSize) * 1000) / 10 : 0;

  item.status = 'completed';
  item.progress = 100;
  item.output = {
    fileName: outFileName,
    url: `/outputs/${outFileName}`,
    format: outFormat.toUpperCase(),
    size: outStats.size,
    width: outInfo.width || item.width,
    height: outInfo.height || item.height,
    duration: outInfo.duration || item.duration,
    savedBytes,
    savedPercent,
    elapsedMs: Date.now() - startTime
  };

  broadcastEvent('job-completed', { id: item.id, item });
  return item;
}

// ==================== API ROUTES ====================

// SSE stream for real-time telemetry and progress
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

// Get system telemetry & queue state
app.get('/api/state', (req, res) => {
  const items = Array.from(mediaStore.values()).sort((a, b) => b.createdAt - a.createdAt);
  res.json({
    engine: {
      name: 'UltraSuperConvertor Quantum Core v2.4',
      sharpVersion: sharp.versions.sharp,
      libvipsVersion: sharp.versions.vips,
      ffmpegReady: fs.existsSync(ffmpegPath),
      pid: process.pid,
      uptime: Math.round(process.uptime())
    },
    items
  });
});

// Upload 1 or multiple files
app.post('/api/upload', upload.array('files', 100), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }
    const registered = [];
    for (const f of req.files) {
      const item = await inspectAndRegisterFile(f);
      registered.push(item);
    }
    broadcastEvent('files-added', { items: registered });
    res.json({ items: registered });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Generate Built-In Demo Media Suite (Images + 1080p Test Video + Audio)
app.post('/api/generate-demo', async (req, res) => {
  try {
    const createdItems = [];
    const ts = Date.now();

    // 1. High-Res 2400x1600 Technical Optics Calibration Poster (PNG)
    const demoImg1Path = path.join(UPLOADS_DIR, `${ts}_demo_Quantum_Optics_Calibration_4K.png`);
    const svg1 = `
      <svg width="2400" height="1600" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#f8fafc"/>
            <stop offset="50%" stop-color="#e2e8f0"/>
            <stop offset="100%" stop-color="#cbd5e1"/>
          </linearGradient>
          <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stop-color="#090d16"/>
            <stop offset="55%" stop-color="#0055ff"/>
            <stop offset="100%" stop-color="#00d2ff"/>
          </linearGradient>
        </defs>
        <rect width="2400" height="1600" fill="url(#bg)"/>
        <!-- Grid lines -->
        <g stroke="#94a3b8" stroke-width="2" opacity="0.35">
          <line x1="0" y1="400" x2="2400" y2="400"/>
          <line x1="0" y1="800" x2="2400" y2="800"/>
          <line x1="0" y1="1200" x2="2400" y2="1200"/>
          <line x1="600" y1="0" x2="600" y2="1600"/>
          <line x1="1200" y1="0" x2="1200" y2="1600"/>
          <line x1="1800" y1="0" x2="1800" y2="1600"/>
        </g>
        <rect x="140" y="140" width="2120" height="1320" rx="32" fill="none" stroke="#090d16" stroke-width="8"/>
        <circle cx="1200" cy="800" r="460" fill="#090d16"/>
        <circle cx="1200" cy="800" r="340" fill="none" stroke="#00d2ff" stroke-width="14" stroke-dasharray="40 20"/>
        <circle cx="1200" cy="800" r="210" fill="url(#accent)"/>
        <polygon points="1200,520 1440,940 960,940" fill="none" stroke="#ffffff" stroke-width="16"/>
        <text x="220" y="270" font-family="Segoe UI, Arial, sans-serif" font-weight="900" font-size="72" fill="#090d16" letter-spacing="6">ULTRASUPERCONVERTOR // LAB TARGET 01</text>
        <text x="220" y="345" font-family="Consolas, monospace" font-weight="700" font-size="38" fill="#0055ff">2400x1600 UNCOMPRESSED RASTER REFERENCE PLATE // RGB 24-BIT</text>
        <text x="220" y="1380" font-family="Consolas, monospace" font-weight="700" font-size="36" fill="#0f172a">CHROMA: OKLCH-READY  |  SHARPNESS: ISO-12233  |  READY FOR WEB OPTIMIZATION</text>
      </svg>
    `;
    // Add slight noise so PNG is realistic multi-hundred KB / MB size
    await sharp(Buffer.from(svg1))
      .png({ compressionLevel: 1 })
      .toFile(demoImg1Path);
    createdItems.push(await inspectAndRegisterFile({
      originalname: 'Quantum_Optics_Calibration_2400x1600.png',
      path: demoImg1Path
    }));

    // 2. High-Res Product Studio Card (TIFF / Uncompressed-style PNG)
    const demoImg2Path = path.join(UPLOADS_DIR, `${ts}_demo_Industrial_Synth_Deck_Studio.tiff`);
    const svg2 = `
      <svg width="2000" height="2000" xmlns="http://www.w3.org/2000/svg">
        <rect width="2000" height="2000" fill="#f1f5f9"/>
        <rect x="200" y="200" width="1600" height="1600" rx="60" fill="#090d16"/>
        <rect x="300" y="320" width="1400" height="620" rx="28" fill="#1e293b" stroke="#38bdf8" stroke-width="6"/>
        <path d="M 380 650 Q 550 380 720 650 T 1060 650 T 1400 650 T 1620 650" fill="none" stroke="#00d2ff" stroke-width="18"/>
        <circle cx="520" cy="1320" r="150" fill="#0f172a" stroke="#f8fafc" stroke-width="14"/>
        <circle cx="1000" cy="1320" r="150" fill="#0f172a" stroke="#0055ff" stroke-width="14"/>
        <circle cx="1480" cy="1320" r="150" fill="#0f172a" stroke="#10b981" stroke-width="14"/>
        <text x="320" y="1680" font-family="Segoe UI, Arial, sans-serif" font-weight="800" font-size="68" fill="#ffffff" letter-spacing="4">TP-99 PHOTONIC TRANSCODER MODULE</text>
      </svg>
    `;
    await sharp(Buffer.from(svg2))
      .tiff({ compression: 'none' })
      .toFile(demoImg2Path);
    createdItems.push(await inspectAndRegisterFile({
      originalname: 'Industrial_Synth_Deck_Studio.tiff',
      path: demoImg2Path
    }));

    // 3. Synthesized 1080p 30fps MP4 Test Video with Audio via FFmpeg lavfi
    const demoVidPath = path.join(UPLOADS_DIR, `${ts}_demo_HyperStream_1080p_TestClip.mp4`);
    await new Promise((resolve) => {
      execFile(
        ffmpegPath,
        [
          '-y',
          '-f', 'lavfi', '-i', 'testsrc2=size=1920x1080:rate=30:duration=3',
          '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3',
          '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '15',
          '-c:a', 'aac', '-b:a', '192k',
          demoVidPath
        ],
        { timeout: 20000 },
        () => resolve()
      );
    });
    if (fs.existsSync(demoVidPath)) {
      createdItems.push(await inspectAndRegisterFile({
        originalname: 'HyperStream_1080p_TestClip.mp4',
        path: demoVidPath
      }));
    }

    broadcastEvent('files-added', { items: createdItems });
    res.json({ items: createdItems });
  } catch (err) {
    console.error('Demo generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Process Batch or Single Item
app.post('/api/process', async (req, res) => {
  try {
    const { itemIds, settings = {} } = req.body;
    const targets = Array.isArray(itemIds) && itemIds.length > 0
      ? itemIds.map((id) => mediaStore.get(id)).filter(Boolean)
      : Array.from(mediaStore.values());

    if (targets.length === 0) {
      return res.status(400).json({ error: 'No items in queue to process' });
    }

    // Respond immediately or process sequentially/concurrently and return results
    const results = [];
    for (const item of targets) {
      try {
        if (item.mediaType === 'image') {
          await processImageItem(item, settings);
        } else if (item.mediaType === 'video' || item.mediaType === 'audio') {
          await processVideoOrAudioItem(item, settings);
        } else {
          throw new Error(`Unsupported media type for ${item.originalName}`);
        }
        results.push(item);
      } catch (err) {
        console.error(`Error processing ${item.originalName}:`, err);
        item.status = 'error';
        item.error = err.message;
        broadcastEvent('job-error', { id: item.id, error: err.message, item });
        results.push(item);
      }
    }

    res.json({ items: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save per-item or batch-wide Studio Config (Interactive Crop, Watermark Position, Video Timeline Trim)
app.post('/api/items/:id/studio', (req, res) => {
  const { id } = req.params;
  const { studioConfig = {}, applyToAll = false } = req.body;

  if (applyToAll) {
    const updated = [];
    for (const item of mediaStore.values()) {
      item.studioConfig = { ...(item.studioConfig || {}), ...studioConfig };
      updated.push(item);
    }
    return res.json({ items: updated });
  }

  const item = mediaStore.get(id);
  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }
  item.studioConfig = { ...(item.studioConfig || {}), ...studioConfig };
  res.json({ item });
});

// Extract multi-frame filmstrip for Video Timeline Scrubber
app.get('/api/video-frames/:id', async (req, res) => {
  try {
    const item = mediaStore.get(req.params.id);
    if (!item || item.mediaType !== 'video') {
      return res.status(404).json({ error: 'Video item not found' });
    }
    const duration = item.duration || 3;
    const frameCount = 6;
    const frames = [];

    for (let i = 0; i < frameCount; i++) {
      const t = Math.min(Math.max(0, duration - 0.05), (duration * (i + 0.5)) / frameCount);
      const frameName = `strip_${item.id}_${i}.jpg`;
      const framePath = path.join(THUMBS_DIR, frameName);
      if (!fs.existsSync(framePath)) {
        await generateVideoThumbnail(item.inputPath, framePath, t.toFixed(2));
      }
      frames.push({
        index: i,
        time: Math.round(t * 100) / 100,
        url: `/uploads/thumbs/${frameName}`
      });
    }
    res.json({ duration, frames });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Remove a single item or clear queue
app.delete('/api/items/:id', (req, res) => {
  const { id } = req.params;
  if (id === 'all') {
    mediaStore.clear();
    return res.json({ cleared: true });
  }
  mediaStore.delete(id);
  res.json({ deleted: id });
});

// Download all completed outputs as a single ZIP archive
app.get('/api/download-zip', (req, res) => {
  const completed = Array.from(mediaStore.values()).filter((i) => i.status === 'completed' && i.output);
  let filesToZip = completed.map((i) => i.output.fileName);

  if (filesToZip.length === 0 && fs.existsSync(OUTPUTS_DIR)) {
    filesToZip = fs.readdirSync(OUTPUTS_DIR).filter((name) => name !== '.gitkeep');
  }

  if (filesToZip.length === 0) {
    return res.status(400).send('No completed files available to zip.');
  }

  const zipName = `UltraSuperConvertor_Batch_${Date.now()}.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.on('error', (err) => res.status(500).end(err.message));
  archive.pipe(res);

  for (const fileName of filesToZip) {
    const filePath = path.join(OUTPUTS_DIR, fileName);
    if (fs.existsSync(filePath)) {
      archive.file(filePath, { name: fileName });
    }
  }
  archive.finalize();
});

// List all saved files in the outputs directory
app.get('/api/outputs', (req, res) => {
  try {
    if (!fs.existsSync(OUTPUTS_DIR)) {
      fs.mkdirSync(OUTPUTS_DIR, { recursive: true });
    }
    const entries = fs.readdirSync(OUTPUTS_DIR, { withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile() && e.name !== '.gitkeep')
      .map((e) => {
        const fullPath = path.join(OUTPUTS_DIR, e.name);
        const st = fs.statSync(fullPath);
        const ext = path.extname(e.name).replace('.', '').toUpperCase();
        return {
          name: e.name,
          url: `/outputs/${encodeURIComponent(e.name)}`,
          size: st.size,
          modifiedAt: st.mtimeMs,
          ext
        };
      })
      .sort((a, b) => b.modifiedAt - a.modifiedAt);

    res.json({ path: OUTPUTS_DIR, files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a single output file or all output files
app.delete('/api/outputs/:name', (req, res) => {
  try {
    const target = req.params.name;
    if (target === 'all') {
      const entries = fs.readdirSync(OUTPUTS_DIR);
      for (const name of entries) {
        if (name !== '.gitkeep') {
          fs.unlinkSync(path.join(OUTPUTS_DIR, name));
        }
      }
      return res.json({ cleared: true });
    }
    const safeName = path.basename(target);
    const fullPath = path.join(OUTPUTS_DIR, safeName);
    if (fs.existsSync(fullPath) && safeName !== '.gitkeep') {
      fs.unlinkSync(fullPath);
    }
    res.json({ deleted: safeName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Open outputs directory in Windows Explorer (brought to foreground)
app.post('/api/open-folder', (req, res) => {
  if (!fs.existsSync(OUTPUTS_DIR)) {
    fs.mkdirSync(OUTPUTS_DIR, { recursive: true });
  }
  if (process.platform === 'win32') {
    const psCmd = `
      $path = '${OUTPUTS_DIR.replace(/'/g, "''")}'
      $ws = New-Object -ComObject WScript.Shell
      schtasks /Create /TN "USC_OpenExplorer" /TR "explorer.exe \`"$path\`"" /SC ONCE /ST 00:00 /F 2>$null | Out-Null
      schtasks /Run /TN "USC_OpenExplorer" 2>$null | Out-Null
      Start-Sleep -Milliseconds 500
      [void]$ws.AppActivate('outputs')
      schtasks /Delete /TN "USC_OpenExplorer" /F 2>$null | Out-Null
    `;
    execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psCmd], { timeout: 10000 }, () => {});
  }
  res.json({ opened: OUTPUTS_DIR });
});

// ==================== HTML SETUP WIZARD ROUTES ====================

app.use('/api/wizard', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/setup', (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'setup-wizard.html'));
});

app.get('/api/wizard/preflight', (req, res) => {
  const desktopDir = path.join(os.homedir(), 'Desktop');
  const shortcutPath = path.join(desktopDir, 'UltraSuperConvertor.lnk');
  res.json({
    pid: process.pid,
    nodeVersion: process.version,
    sharpReady: Boolean(sharp?.versions?.sharp),
    sharpVersion: sharp?.versions?.sharp || null,
    vipsVersion: sharp?.versions?.vips || null,
    ffmpegReady: Boolean(ffmpegPath && fs.existsSync(ffmpegPath)),
    desktopShortcutExists: fs.existsSync(shortcutPath)
  });
});

app.post('/api/wizard/install', async (req, res) => {
  try {
    const logs = [];
    logs.push(`[1/3] Node.js Runtime Verified: ${process.version}`);
    logs.push(`[2/3] Verifying npm packages in ${ROOT_DIR}...`);

    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    await new Promise((resolve) => {
      execFile(npmCmd, ['install', '--no-audit', '--no-fund'], { cwd: ROOT_DIR, timeout: 180000, shell: true }, (err, stdout, stderr) => {
        if (stdout) logs.push(stdout.trim());
        if (err && stderr) logs.push(stderr.trim());
        resolve();
      });
    });

    const ffmpegInstallScript = path.join(ROOT_DIR, 'node_modules', 'ffmpeg-static', 'install.js');
    if (!fs.existsSync(ffmpegPath) && fs.existsSync(ffmpegInstallScript)) {
      logs.push('[3/3] Downloading static FFmpeg binary...');
      await new Promise((resolve) => {
        execFile(process.execPath, [ffmpegInstallScript], { cwd: ROOT_DIR, timeout: 120000 }, () => resolve());
      });
    } else {
      logs.push(`[3/3] Static FFmpeg & Sharp (libvips ${sharp.versions.vips}) binaries verified.`);
    }

    [UPLOADS_DIR, THUMBS_DIR, OUTPUTS_DIR].forEach((dir) => {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    });

    res.json({ ok: true, log: logs.join('\n') });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.post('/api/wizard/shortcut', async (req, res) => {
  try {
    const { desktop = true, startMenu = true } = req.body || {};
    const startCmdPath = path.join(ROOT_DIR, 'start.cmd');
    const icoPath = path.join(ROOT_DIR, 'UltraSuperConvertor.ico');
    const created = [];

    const psCommands = ['$WshShell = New-Object -ComObject WScript.Shell'];

    if (desktop) {
      psCommands.push(`
        $DesktopDir = [Environment]::GetFolderPath('Desktop')
        $Shortcut = $WshShell.CreateShortcut((Join-Path $DesktopDir 'UltraSuperConvertor.lnk'))
        $Shortcut.TargetPath = '${startCmdPath.replace(/'/g, "''")}'
        $Shortcut.WorkingDirectory = '${ROOT_DIR.replace(/'/g, "''")}'
        $Shortcut.Description = 'Launch UltraSuperConvertor Quantum Media Engine'
        $Shortcut.IconLocation = '${icoPath.replace(/'/g, "''")},0'
        $Shortcut.WindowStyle = 7
        $Shortcut.Save()
      `);
      created.push('Desktop Icon');
    }

    if (startMenu) {
      psCommands.push(`
        $ProgramsDir = [Environment]::GetFolderPath('Programs')
        $ShortcutSM = $WshShell.CreateShortcut((Join-Path $ProgramsDir 'UltraSuperConvertor.lnk'))
        $ShortcutSM.TargetPath = '${startCmdPath.replace(/'/g, "''")}'
        $ShortcutSM.WorkingDirectory = '${ROOT_DIR.replace(/'/g, "''")}'
        $ShortcutSM.Description = 'Launch UltraSuperConvertor Quantum Media Engine'
        $ShortcutSM.IconLocation = '${icoPath.replace(/'/g, "''")},0'
        $ShortcutSM.WindowStyle = 7
        $ShortcutSM.Save()
      `);
      created.push('Start Menu');
    }

    if (process.platform === 'win32' && (desktop || startMenu)) {
      await new Promise((resolve, reject) => {
        execFile(
          'powershell.exe',
          ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psCommands.join('\n')],
          { timeout: 15000 },
          (err, stdout, stderr) => {
            if (err) return reject(new Error(stderr || err.message));
            resolve(stdout);
          }
        );
      });
    }

    const message = created.length > 0 ? `Created: ${created.join(' + ')}` : 'No shortcuts selected';
    res.json({ ok: true, message });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ==================== GITHUB AUTO-UPDATER ROUTES ====================

const GITHUB_REPO = 'kevindemara/UltraSuperConvertor';

function getLocalGitSha() {
  return new Promise((resolve) => {
    if (!fs.existsSync(path.join(ROOT_DIR, '.git'))) return resolve(null);
    execFile('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT_DIR, timeout: 4000 }, (err, stdout) => {
      if (err || !stdout) return resolve(null);
      resolve(stdout.trim());
    });
  });
}

function getLocalVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8'));
    return pkg.version || '2.4.0';
  } catch (_) {
    return '2.4.0';
  }
}

app.get('/api/update/check', async (req, res) => {
  try {
    const localVersion = getLocalVersion();
    const localSha = await getLocalGitSha();

    const headers = {
      'User-Agent': 'UltraSuperConvertor-Updater/2.4',
      'Accept': 'application/vnd.github.v3+json',
      'Cache-Control': 'no-cache'
    };

    const [pkgRes, commitRes] = await Promise.all([
      fetch(`https://raw.githubusercontent.com/${GITHUB_REPO}/main/package.json?t=${Date.now()}`, { headers }),
      fetch(`https://api.github.com/repos/${GITHUB_REPO}/commits/main`, { headers })
    ]);

    let remoteVersion = localVersion;
    if (pkgRes.ok) {
      const remotePkg = await pkgRes.json();
      if (remotePkg?.version) remoteVersion = remotePkg.version;
    }

    let remoteSha = null;
    let latestMessage = '';
    let publishedAt = null;
    if (commitRes.ok) {
      const commitData = await commitRes.json();
      if (commitData?.sha) remoteSha = commitData.sha.slice(0, 7);
      if (commitData?.commit?.message) latestMessage = commitData.commit.message.split('\n')[0];
      if (commitData?.commit?.committer?.date) publishedAt = commitData.commit.committer.date;
    }

    const versionChanged = remoteVersion !== localVersion;
    const shaChanged = Boolean(localSha && remoteSha && localSha !== remoteSha);
    const updateAvailable = versionChanged || shaChanged;

    res.json({
      ok: true,
      updateAvailable,
      localVersion,
      remoteVersion,
      localSha,
      remoteSha,
      latestMessage,
      publishedAt,
      repoUrl: `https://github.com/${GITHUB_REPO}`
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: `Could not reach GitHub: ${err.message}` });
  }
});

app.post('/api/update/apply', async (req, res) => {
  try {
    const logs = [];
    logs.push(`[1/3] Connecting to https://github.com/${GITHUB_REPO} ...`);

    const hasGit = fs.existsSync(path.join(ROOT_DIR, '.git'));
    if (hasGit) {
      logs.push('[2/3] Fetching and applying latest commit from origin/main via Git...');
      await new Promise((resolve, reject) => {
        execFile('git', ['fetch', 'origin', 'main'], { cwd: ROOT_DIR, timeout: 60000 }, (err, stdout, stderr) => {
          if (err) return reject(new Error(stderr || err.message));
          resolve(stdout);
        });
      });
      await new Promise((resolve, reject) => {
        execFile('git', ['reset', '--hard', 'origin/main'], { cwd: ROOT_DIR, timeout: 30000 }, (err, stdout, stderr) => {
          if (err) return reject(new Error(stderr || err.message));
          if (stdout) logs.push(stdout.trim());
          resolve(stdout);
        });
      });
    } else {
      logs.push('[2/3] Downloading latest release archive from GitHub...');
      const psUpdateCmd = `
        $ErrorActionPreference = 'Stop'
        $zipPath = Join-Path $env:TEMP 'usc_update_main.zip'
        $extractDir = Join-Path $env:TEMP 'usc_update_extract'
        if (Test-Path $extractDir) { Remove-Item $extractDir -Recurse -Force }
        Invoke-WebRequest -Uri 'https://github.com/${GITHUB_REPO}/archive/refs/heads/main.zip' -OutFile $zipPath
        Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force
        $innerDir = Get-ChildItem -Path $extractDir -Directory | Select-Object -First 1
        Copy-Item -Path (Join-Path $innerDir.FullName '*') -Destination '${ROOT_DIR.replace(/'/g, "''")}' -Recurse -Force
        Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
        Remove-Item $extractDir -Recurse -Force -ErrorAction SilentlyContinue
      `;
      await new Promise((resolve, reject) => {
        execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psUpdateCmd], { timeout: 120000 }, (err, stdout, stderr) => {
          if (err) return reject(new Error(stderr || err.message));
          resolve(stdout);
        });
      });
      logs.push('Archive extracted and applied cleanly.');
    }

    logs.push('[3/3] Verifying npm dependencies...');
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    await new Promise((resolve) => {
      execFile(npmCmd, ['install', '--no-audit', '--no-fund'], { cwd: ROOT_DIR, timeout: 120000, shell: true }, (err, stdout) => {
        if (stdout) logs.push(stdout.trim());
        resolve();
      });
    });

    const updatedVersion = getLocalVersion();
    const updatedSha = await getLocalGitSha();
    logs.push(`[COMPLETE] Updated to v${updatedVersion}${updatedSha ? ` (${updatedSha})` : ''}! Restarting server...`);

    res.json({
      ok: true,
      updatedVersion,
      updatedSha,
      log: logs.join('\n'),
      restarting: true
    });

    // Gracefully restart server process so updated backend code takes effect
    setTimeout(() => {
      server.close(() => {
        const child = spawn(process.execPath, [path.join(ROOT_DIR, 'server.js')], {
          cwd: ROOT_DIR,
          detached: true,
          stdio: 'ignore'
        });
        child.unref();
        process.exit(0);
      });
    }, 500);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Stop instance / Shutdown server from GUI or stop.cmd
app.post('/api/shutdown', (req, res) => {
  broadcastEvent('system-shutdown', { message: 'UltraSuperConvertor Engine shutting down...' });
  res.json({ status: 'shutting_down', pid: process.pid });

  setTimeout(() => {
    try {
      if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
    } catch (_) {}
    console.log('\n[UltraSuperConvertor] Instance stopped via shutdown command.');
    process.exit(0);
  }, 400);
});

const server = app.listen(PORT, () => {
  console.log('================================================================');
  console.log(`  ULTRASUPERCONVERTOR // QUANTUM MEDIA ENGINE ONLINE`);
  console.log(`  GUI URL  : http://localhost:${PORT}`);
  console.log(`  PID      : ${process.pid}`);
  console.log('================================================================');
});

process.on('SIGINT', () => {
  try {
    if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE);
  } catch (_) {}
  server.close(() => process.exit(0));
});
