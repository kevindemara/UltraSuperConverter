'use strict';
const sharp = require('sharp');
const path = require('node:path');
const he = require('he');

async function imageTool(ctx) {
  const { toolId, files, options: o, write } = ctx;
  if (toolId === 'photo-sheet') {
    const captionHeight = o.captions === 'yes' ? 32 : 0, rows = Math.ceil(files.length / o.columns);
    const width = o.columns * o.cellWidth, height = rows * (o.cellHeight + captionHeight);
    if (width * height > 40000000) throw new Error('Contact sheet exceeds 40 megapixels. Reduce cell size or columns.');
    const layers = [];
    for (let i = 0; i < files.length; i++) {
      const left = (i % o.columns) * o.cellWidth, top = Math.floor(i / o.columns) * (o.cellHeight + captionHeight);
      layers.push({ input: await (await ctx.image(files[i])).resize(o.cellWidth, o.cellHeight, { fit: o.fit, background: '#eef2f6' }).png().toBuffer(), left, top });
      if (captionHeight) layers.push({ input: Buffer.from(`<svg width="${o.cellWidth}" height="32"><rect width="100%" height="100%" fill="white"/><text x="10" y="21" font-family="sans-serif" font-size="12" fill="#263b60">${he.encode(files[i].originalname.slice(0, Math.floor(o.cellWidth / 8)))}</text></svg>`), left, top: top + o.cellHeight });
    }
    await write('photo-proof-sheet.png', await sharp({ create: { width, height, channels: 3, background: '#ffffff' } }).composite(layers).png().toBuffer());
  } else if (toolId === 'responsive-pack') {
    const widths = [...new Set(o.widths.split(',').map(s => Number(s.trim())))].sort((a, b) => a - b);
    if (!widths.length || widths.length > 8 || widths.some(w => !Number.isInteger(w) || w < 32 || w > 4096)) throw new Error('Choose 1–8 integer widths between 32 and 4096.');
    const formats = o.formats === 'both' ? ['webp', 'jpg'] : [o.formats], manifest = [], markup = [];
    for (let i = 0; i < files.length; i++) {
      const base = `${i + 1}-${ctx.safeName(path.parse(files[i].originalname).name)}`, variants = [];
      for (const format of formats) for (const width of widths) {
        const pipe = (await ctx.image(files[i])).resize({ width, withoutEnlargement: true });
        const { data, info } = await (format === 'jpg' ? pipe.flatten({ background: '#ffffff' }).jpeg({ quality: o.quality }) : pipe.webp({ quality: o.quality })).toBuffer({ resolveWithObject: true });
        // Do not emit duplicate-size variants when the requested width exceeds the source.
        if (variants.some(v => v.format === format && v.width === info.width)) continue;
        const result = await write(`${base}-${info.width}.${format}`, data);
        variants.push({ file: result.name, width: info.width, height: info.height, bytes: data.length, format });
      }
      manifest.push({ source: files[i].originalname, variants });
      const srcsets = formats.map(format => `<source type="image/${format === 'jpg' ? 'jpeg' : format}" srcset="${variants.filter(v => v.format === format).map(v => `${v.file} ${v.width}w`).join(', ')}" sizes="(max-width: 800px) 100vw, 800px">`);
      const fallback = variants[variants.length - 1];
      markup.push(`<picture>\n${srcsets.join('\n')}\n<img src="${fallback.file}" width="${fallback.width}" height="${fallback.height}" alt="${he.encode(path.parse(files[i].originalname).name)}" loading="lazy">\n</picture>`);
    }
    await write('image-manifest.json', JSON.stringify(manifest, null, 2), true);
    await write('responsive-images.html', `<!doctype html><html><head><meta charset="utf-8"><title>Responsive images</title></head><body>${markup.join('\n\n')}</body></html>`, true);
  } else if (toolId === 'sprite-atlas') {
    if (o.padding * 2 >= o.cell) throw new Error('Padding must be less than half the cell size.');
    const columns = Math.min(o.columns, files.length), width = columns * o.cell, height = Math.ceil(files.length / columns) * o.cell;
    const layers = [], sprites = [], classes = [];
    for (let i = 0; i < files.length; i++) {
      const x = i % columns * o.cell, y = Math.floor(i / columns) * o.cell;
      layers.push({ input: await (await ctx.image(files[i])).resize(o.cell - o.padding * 2, o.cell - o.padding * 2, { fit: 'contain', background: '#00000000' }).png().toBuffer(), left: x + o.padding, top: y + o.padding });
      const className = `sprite-${i + 1}`;
      sprites.push({ source: files[i].originalname, className, x, y, width: o.cell, height: o.cell });
      classes.push(`.${className} { background-position: -${x}px -${y}px; }`);
    }
    await write('atlas.png', await sharp({ create: { width, height, channels: 4, background: '#00000000' } }).composite(layers).png().toBuffer());
    await write('atlas.json', JSON.stringify({ image: 'atlas.png', width, height, sprites }, null, 2), true);
    await write('atlas.css', `.sprite { display:inline-block; width:${o.cell}px; height:${o.cell}px; background-image:url("atlas.png"); background-repeat:no-repeat; }\n${classes.join('\n')}`, true);
  }
}
module.exports = { imageTool };
