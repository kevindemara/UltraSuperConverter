'use strict';
const fs = require('node:fs/promises');
const { PDFDocument, PageSizes, degrees } = require('pdf-lib');
const sharp = require('sharp');
const { openPdfJs } = require('../advanced/pdf');
async function renderedPages(file, dpi, callback) {
  const doc = await openPdfJs(file);
  try {
    if (doc.numPages > 40) throw new Error('This PDF utility supports up to 40 pages per run. Split the document first.');
    for (let i = 0; i < doc.numPages; i++) {
      const page = await doc.getPage(i + 1), viewport = page.getViewport({ scale: dpi / 72 });
      if (viewport.width * viewport.height > 20000000) throw new Error('A rendered page exceeds 20 megapixels. Use a lower DPI.');
      const canvas = require('@napi-rs/canvas').createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      try { await page.render({ canvasContext: canvas.getContext('2d'), viewport, background: '#ffffff' }).promise; await callback({ index: i, canvas, page, width: viewport.width / (dpi / 72), height: viewport.height / (dpi / 72) }); }
      finally { canvas.width = 1; canvas.height = 1; page.cleanup(); }
    }
  } finally { await doc.loadingTask.destroy(); }
}
function drawFitted(target, embedded, source, margin) {
  const angle = (source.getRotation().angle % 360 + 360) % 360, swap = angle === 90 || angle === 270, sourceW = swap ? embedded.height : embedded.width, sourceH = swap ? embedded.width : embedded.height;
  const availableW = target.getWidth() - margin * 2, availableH = target.getHeight() - margin * 2;
  if (availableW <= 0 || availableH <= 0) throw new Error('Margins leave no printable area.');
  const scale = Math.min(availableW / sourceW, availableH / sourceH), width = embedded.width * scale, height = embedded.height * scale;
  let x = (target.getWidth() - sourceW * scale) / 2, y = (target.getHeight() - sourceH * scale) / 2;
  if (angle === 90) y += width; else if (angle === 180) { x += width; y += height; } else if (angle === 270) x += height;
  target.drawPage(embedded, { x, y, width, height, rotate: degrees((360 - angle) % 360) });
}
async function pdfUtility(ctx) {
  const input = ctx.files[0].path, original = await fs.readFile(input), o = ctx.options, id = ctx.toolId;
  if (id === 'pdf-compress') {
    let candidate;
    if (o.mode === 'structure') {
      const doc = await PDFDocument.load(original, { updateMetadata: false }); candidate = Buffer.from(await doc.save({ useObjectStreams: true, addDefaultPage: false }));
    } else {
      const target = await PDFDocument.create();
      await renderedPages(input, o.dpi, async ({ canvas, width, height }) => {
        const jpeg = await sharp(canvas.toBuffer('image/png')).flatten({ background: '#ffffff' }).jpeg({ quality: o.quality, mozjpeg: true }).toBuffer();
        const image = await target.embedJpg(jpeg), page = target.addPage([width, height]); page.drawImage(image, { x: 0, y: 0, width, height });
      });
      candidate = Buffer.from(await target.save({ useObjectStreams: true }));
    }
    const usedOriginal = candidate.length >= original.length, output = usedOriginal ? original : candidate;
    await ctx.write('compressed.pdf', output);
    await ctx.json('compression-report.json', { mode: o.mode, inputBytes: original.length, candidateBytes: candidate.length, outputBytes: output.length, savedBytes: original.length - output.length, savedPercent: Math.round((1 - output.length / original.length) * 10000) / 100, usedOriginal, rasterized: o.mode === 'raster' && !usedOriginal, note: usedOriginal ? 'The candidate was not smaller, so the original bytes were returned.' : o.mode === 'raster' ? 'Pages were rasterized; selectable text and interactive features were removed.' : 'Structure was reserialized; embedded images were not recompressed.' });
  } else if (id === 'pdf-blank') {
    const source = await PDFDocument.load(original), report = [], keep = [];
    await renderedPages(input, 72, async ({ index, canvas }) => {
      const { data, info } = await sharp(canvas.toBuffer('image/png')).removeAlpha().raw().toBuffer({ resolveWithObject: true }); let marked = 0;
      for (let i = 0; i < data.length; i += info.channels) if (data[i] < 245 || data[i + 1] < 245 || data[i + 2] < 245) marked++;
      const percent = marked / (info.width * info.height) * 100, blank = percent <= o.threshold;
      report.push({ page: index + 1, nonWhitePercent: percent, blank }); if (!blank) keep.push(index);
    });
    if (!keep.length) throw new Error('Every page appears blank at this threshold. Lower the threshold or keep the original.');
    const target = await PDFDocument.create(); for (const page of await target.copyPages(source, keep)) target.addPage(page);
    await ctx.write('blank-pages-removed.pdf', await target.save()); await ctx.json('blank-page-report.json', { inputPages: source.getPageCount(), outputPages: keep.length, thresholdPercent: o.threshold, pages: report });
  } else if (id === 'pdf-resize') {
    const source = await PDFDocument.load(original), target = await PDFDocument.create();
    if (source.getPageCount() > 200) throw new Error('Paper-size conversion supports at most 200 pages.');
    const base = o.paper === 'letter' ? PageSizes.Letter : o.paper === 'legal' ? PageSizes.Legal : PageSizes.A4, size = o.orientation === 'landscape' ? [...base].reverse() : base;
    for (let i = 0; i < source.getPageCount(); i++) { const page = target.addPage(size); if (!source.getPage(i).node.Contents()) continue; const [embedded] = await target.embedPdf(source, [i]); drawFitted(page, embedded, source.getPage(i), o.margin); }
    await ctx.write('resized-pages.pdf', await target.save());
  } else if (id === 'pdf-grayscale') {
    const target = await PDFDocument.create();
    await renderedPages(input, o.dpi, async ({ canvas, width, height }) => {
      const jpeg = await sharp(canvas.toBuffer('image/png')).grayscale().jpeg({ quality: o.quality, mozjpeg: true }).toBuffer();
      const image = await target.embedJpg(jpeg), page = target.addPage([width, height]); page.drawImage(image, { x: 0, y: 0, width, height });
    });
    await ctx.write('grayscale.pdf', await target.save());
  }
}
module.exports = { pdfUtility, renderedPages, drawFitted };
