'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { PDFDocument, StandardFonts, degrees, rgb, PageSizes } = require('pdf-lib');

async function openPdfJs(file) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const root = path.dirname(require.resolve('pdfjs-dist/package.json'));
  return pdfjs.getDocument({ data: new Uint8Array(await fs.readFile(file)), isEvalSupported: false, useSystemFonts: false, standardFontDataUrl: pathToFileURL(path.join(root, 'standard_fonts') + path.sep).href, cMapUrl: pathToFileURL(path.join(root, 'cmaps') + path.sep).href, cMapPacked: true, verbosity: 0 }).promise;
}
async function pdfTool(ctx) {
  const { toolId, files, options: o, pageIndices, write } = ctx;
  if (toolId === 'pdf-render' || toolId === 'pdf-text') {
    const doc = await openPdfJs(files[0].path);
    try {
      const indices = pageIndices(o.pages, doc.numPages);
      if (indices.length > (toolId === 'pdf-render' ? 40 : 500)) throw new Error('Select fewer pages (40 rendered pages or 500 text pages per run).');
      const pages = [];
      for (const index of indices) {
        const page = await doc.getPage(index + 1);
        if (toolId === 'pdf-render') {
          const viewport = page.getViewport({ scale: o.dpi / 72 });
          if (viewport.width * viewport.height > 20000000) throw new Error('A rendered page exceeds 20 megapixels. Lower the DPI.');
          const canvas = require('@napi-rs/canvas').createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
          await page.render({ canvasContext: canvas.getContext('2d'), viewport, background: '#ffffff' }).promise;
          await write(`page-${index + 1}.${o.format}`, canvas.toBuffer(o.format === 'jpg' ? 'image/jpeg' : 'image/png'));
          canvas.width = 1; canvas.height = 1;
        } else {
          const content = await page.getTextContent();
          const blocks = content.items.filter(item => typeof item.str === 'string').map(item => ({ text: item.str, x: item.transform[4], y: item.transform[5], width: item.width, height: item.height, endOfLine: !!item.hasEOL }));
          const text = blocks.map(item => item.text + (item.endOfLine ? '\n' : ' ')).join('').trim();
          pages.push({ page: index + 1, text, blocks });
        }
        page.cleanup();
      }
      if (toolId === 'pdf-text') {
        await write('extracted.txt', pages.map(p => `--- Page ${p.page} ---\n${p.text}`).join('\n\n'), true);
        await write('text-structure.json', JSON.stringify({ pageCount: doc.numPages, pages }, null, 2), true);
      }
    } finally { await doc.loadingTask.destroy(); }
    return;
  }
  const doc = await PDFDocument.load(await fs.readFile(files[0].path));
  const indices = pageIndices(o.pages, doc.getPageCount());
  if (!indices.length) throw new Error('This PDF has no pages.');
  if (toolId === 'pdf-nup') {
    const target = await PDFDocument.create();
    const size = o.paper === 'letter' ? [...PageSizes.Letter].reverse() : [...PageSizes.A4].reverse();
    const perSheet = o.columns * o.rows;
    const cellW = (size[0] - o.gap * (o.columns + 1)) / o.columns, cellH = (size[1] - o.gap * (o.rows + 1)) / o.rows;
    if (cellW < 20 || cellH < 20) throw new Error('Reduce the grid or spacing to leave room for the pages.');
    let sheet;
    for (let i = 0; i < indices.length; i++) {
      if (i % perSheet === 0) sheet = target.addPage(size);
      const [embedded] = await target.embedPdf(doc, [indices[i]]);
      const angle = (doc.getPage(indices[i]).getRotation().angle % 360 + 360) % 360;
      const swap = angle === 90 || angle === 270;
      const rotatedW = swap ? embedded.height : embedded.width, rotatedH = swap ? embedded.width : embedded.height;
      const scale = Math.min(cellW / rotatedW, cellH / rotatedH), w = embedded.width * scale, h = embedded.height * scale;
      const slot = i % perSheet, col = slot % o.columns, row = Math.floor(slot / o.columns);
      let x = o.gap + col * (cellW + o.gap) + (cellW - rotatedW * scale) / 2;
      let y = size[1] - o.gap - row * (cellH + o.gap) - cellH + (cellH - rotatedH * scale) / 2;
      if (angle === 90) y += w;
      else if (angle === 180) { x += w; y += h; }
      else if (angle === 270) x += h;
      sheet.drawPage(embedded, { x, y, width: w, height: h, rotate: degrees((360 - angle) % 360) });
    }
    await write('print-layout.pdf', await target.save()); return;
  }
  const font = await doc.embedFont(StandardFonts.Helvetica);
  let image;
  if (toolId === 'pdf-stamp') {
    if (files.length !== 2) throw new Error('Choose exactly two files: PDF first, image second.');
    image = await doc.embedPng(await (await ctx.image(files[1])).resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true }).png().toBuffer());
  }
  for (let i = 0; i < indices.length; i++) {
    const page = doc.getPage(indices[i]), { width, height } = page.getSize();
    if (toolId === 'pdf-watermark') {
      if (!o.text.trim()) throw new Error('Enter watermark text.');
      const textWidth = font.widthOfTextAtSize(o.text, o.size), theta = o.angle * Math.PI / 180;
      page.drawText(o.text, { x: width / 2 - textWidth * Math.cos(theta) / 2, y: height / 2 - textWidth * Math.sin(theta) / 2, size: o.size, font, rotate: degrees(o.angle), color: rgb(0.2, 0.3, 0.5), opacity: o.opacity });
    } else if (toolId === 'pdf-number') {
      const label = `${o.prefix}${o.start + i}`, tw = font.widthOfTextAtSize(label, 11);
      if (width < tw + 36) throw new Error('The page-number label is too wide. Shorten the prefix.');
      page.drawText(label, { x: o.position.endsWith('center') ? (width - tw) / 2 : width - tw - 18, y: o.position.startsWith('top') ? height - 24 : 18, font, size: 11, color: rgb(0.15, 0.2, 0.3) });
    } else if (toolId === 'pdf-stamp') {
      const w = width * o.widthPercent / 100, h = Math.min(height * 0.8, w * image.height / image.width), actualW = h * image.width / image.height;
      const x = o.position === 'center' ? (width - actualW) / 2 : o.position === 'top-left' ? 18 : width - actualW - 18;
      const y = o.position === 'center' ? (height - h) / 2 : o.position === 'top-left' ? height - h - 18 : 18;
      page.drawImage(image, { x, y, width: actualW, height: h, opacity: o.opacity });
    }
  }
  await write(`${toolId}.pdf`, await doc.save());
}
module.exports = { pdfTool, openPdfJs };
