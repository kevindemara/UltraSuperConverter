'use strict';
const sharp = require('sharp');
function parseColor(source) {
  const text = source.trim(); let channels;
  if (/^#[0-9a-f]{3}$/i.test(text)) channels = [...text.slice(1)].map(c => parseInt(c + c, 16));
  else if (/^#[0-9a-f]{6}$/i.test(text)) channels = [1, 3, 5].map(i => parseInt(text.slice(i, i + 2), 16));
  else if (/^rgb\(/i.test(text)) {
    const m = text.match(/^rgb\(\s*([\d.]+%?)\s*,\s*([\d.]+%?)\s*,\s*([\d.]+%?)\s*\)$/i);
    if (!m) throw new Error('Use rgb(red, green, blue), without alpha.');
    channels = m.slice(1).map(v => { const percent = v.endsWith('%'), n = Number(percent ? v.slice(0, -1) : v); if (!Number.isFinite(n) || n < 0 || n > (percent ? 100 : 255)) throw new Error('RGB channels are outside their valid range.'); return Math.round(percent ? n * 255 / 100 : n); });
  } else {
    const m = text.match(/^hsl\(\s*([-+\d.]+)(?:deg)?\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%\s*\)$/i);
    if (!m) throw new Error('Use #RGB, #RRGGBB, rgb(r,g,b), or hsl(h,s%,l%).');
    let h = Number(m[1]), s = Number(m[2]) / 100, l = Number(m[3]) / 100;
    if (![h, s, l].every(Number.isFinite) || s < 0 || s > 1 || l < 0 || l > 1) throw new Error('HSL values are outside their valid range.');
    h = (h % 360 + 360) % 360; const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(h / 60 % 2 - 1)), offset = l - c / 2;
    const parts = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]; channels = parts.map(v => Math.round((v + offset) * 255));
  }
  const [r, g, b] = channels, normalized = channels.map(c => c / 255), [rn, gn, bn] = normalized, max = Math.max(...normalized), min = Math.min(...normalized), delta = max - min, lightness = (max + min) / 2;
  let hue = 0; if (delta) hue = ((max === rn ? (gn - bn) / delta + (gn < bn ? 6 : 0) : max === gn ? (bn - rn) / delta + 2 : (rn - gn) / delta + 4) * 60) % 360;
  const saturation = delta ? delta / (1 - Math.abs(2 * lightness - 1)) : 0, k = 1 - max;
  const round = n => Math.round(n * 100) / 100;
  return { hex: '#' + channels.map(c => c.toString(16).padStart(2, '0')).join(''), rgb: { r, g, b }, hsl: { h: round(hue), s: round(saturation * 100), l: round(lightness * 100) }, cmyk: { c: round(k === 1 ? 0 : (1 - rn - k) / (1 - k) * 100), m: round(k === 1 ? 0 : (1 - gn - k) / (1 - k) * 100), y: round(k === 1 ? 0 : (1 - bn - k) / (1 - k) * 100), k: round(k * 100) } };
}
function luminance(color) { const c = Object.values(color.rgb).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return c[0] * .2126 + c[1] * .7152 + c[2] * .0722; }
const UNITS = {
  m: ['length', 1], km: ['length', 1000], cm: ['length', .01], mm: ['length', .001], in: ['length', .0254], ft: ['length', .3048], yd: ['length', .9144], mi: ['length', 1609.344],
  kg: ['mass', 1], g: ['mass', .001], mg: ['mass', .000001], lb: ['mass', .45359237], oz: ['mass', .028349523125],
  m2: ['area', 1], cm2: ['area', .0001], km2: ['area', 1000000], ft2: ['area', .09290304], acre: ['area', 4046.8564224], ha: ['area', 10000],
  l: ['volume', 1], ml: ['volume', .001], m3: ['volume', 1000], usgal: ['volume', 3.785411784], usfloz: ['volume', .0295735295625],
  'm/s': ['speed', 1], 'km/h': ['speed', 1 / 3.6], mph: ['speed', .44704], kn: ['speed', 1852 / 3600],
  s: ['duration', 1], min: ['duration', 60], h: ['duration', 3600], d: ['duration', 86400],
  B: ['storage', 1], kB: ['storage', 1000], MB: ['storage', 1000000], GB: ['storage', 1e9], TB: ['storage', 1e12], KiB: ['storage', 1024], MiB: ['storage', 1048576], GiB: ['storage', 1073741824], TiB: ['storage', 1099511627776], b: ['storage', 1 / 8], kb: ['storage', 1000 / 8], Mb: ['storage', 1000000 / 8], Gb: ['storage', 1e9 / 8],
  C: ['temperature'], F: ['temperature'], K: ['temperature']
};
function parseNumber(text) { if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text.trim())) throw new Error('Enter one number using a decimal point, without thousands separators.'); const value = Number(text); if (!Number.isFinite(value)) throw new Error('The number is outside the supported range.'); return value; }
function unitConvert(value, from, to) {
  const a = UNITS[from], b = UNITS[to]; if (!a || !b) throw new Error(`Unknown unit. Supported unit symbols: ${Object.keys(UNITS).join(', ')}`);
  if (a[0] !== b[0]) throw new Error('Choose units from the same measurement group.');
  let result;
  if (a[0] === 'temperature') { const kelvin = from === 'K' ? value : from === 'C' ? value + 273.15 : (value - 32) * 5 / 9 + 273.15; if (kelvin < -1e-10) throw new Error('The temperature is below absolute zero.'); result = to === 'K' ? kelvin : to === 'C' ? kelvin - 273.15 : (kelvin - 273.15) * 9 / 5 + 32; }
  else result = value * a[1] / b[1];
  if (!Number.isFinite(result)) throw new Error('The converted value is outside the supported range.');
  result = Number(result.toPrecision(15));
  return { group: a[0], input: value, from, to, result: Object.is(result, -0) ? 0 : result, formatted: Number(result.toPrecision(14)).toString() };
}
function parseISO(source) {
  const m = source.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/i);
  if (!m) throw new Error('Use an ISO date with seconds and an explicit offset, for example 2024-01-01T00:00:00Z.');
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number), leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0), days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month < 1 || month > 12 || day < 1 || day > days[month - 1] || hour > 23 || minute > 59 || second > 59) throw new Error('The ISO date contains an invalid calendar date or time.');
  return new Date(source);
}
async function generalUtility(ctx) {
  const id = ctx.toolId, o = ctx.options;
  if (id === 'qr-generate') {
    const source = await ctx.source(); if (!source || Buffer.byteLength(source) > 2500) throw new Error('QR payload must contain 1–2,500 UTF-8 bytes; high error-correction modes may fit less.');
    const QR = require('qrcode'), settings = { errorCorrectionLevel: o.correction, margin: 4, width: o.size };
    await ctx.write('qr-code.png', await QR.toBuffer(source, { ...settings, type: 'png' })); await ctx.write('qr-code.svg', await QR.toString(source, { ...settings, type: 'svg' }));
  } else if (id === 'qr-decode') {
    const { data, info } = await sharp(ctx.files[0].path, { limitInputPixels: 40000000 }).rotate().resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const result = require('jsqr')(new Uint8ClampedArray(data), info.width, info.height, { inversionAttempts: 'attemptBoth' });
    if (!result) throw new Error('No readable QR code was found. Use a clear image with the complete quiet border.');
    await ctx.write('decoded-qr.txt', result.data, true); await ctx.json('qr-details.json', { text: result.data, version: result.version, location: result.location });
  } else if (id === 'color-convert') { const color = parseColor(await ctx.source()); await ctx.json('color.json', color, { view: { type: 'color', ...color } }); }
  else if (id === 'contrast-check') {
    const foreground = parseColor(o.foreground), background = parseColor(o.background), a = luminance(foreground), b = luminance(background), ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    const report = { foreground: foreground.hex, background: background.hex, ratio, displayRatio: `${ratio.toFixed(2)}:1`, normalTextAA: ratio >= 4.5, normalTextAAA: ratio >= 7, largeTextAA: ratio >= 3, largeTextAAA: ratio >= 4.5, note: 'Large text means at least 18pt regular or 14pt bold. This checks only the color pair.' };
    await ctx.json('contrast-report.json', report, { view: { type: 'contrast', ...report } });
  } else if (id === 'unit-convert') await ctx.json('unit-conversion.json', unitConvert(parseNumber(await ctx.source()), o.from.trim(), o.to.trim()));
  else if (id === 'timestamp-convert') {
    const source = (await ctx.source()).trim(), date = o.mode === 'iso' ? parseISO(source) : new Date(parseNumber(source) * (o.mode === 'seconds' ? 1000 : 1));
    if (!Number.isFinite(date.getTime())) throw new Error('Date is outside the supported JavaScript date range.');
    let local; try { local = new Intl.DateTimeFormat('en-CA', { timeZone: o.timeZone, dateStyle: 'full', timeStyle: 'long' }).format(date); } catch (_) { throw new Error('Enter a valid IANA time zone, for example America/Toronto or UTC.'); }
    await ctx.json('timestamp.json', { isoUTC: date.toISOString(), unixSeconds: date.getTime() / 1000, unixMilliseconds: date.getTime(), timeZone: o.timeZone, localDisplay: local });
  } else throw new Error('Unknown general utility.');
}
module.exports = { generalUtility, parseColor, luminance, unitConvert, parseISO, UNITS };
