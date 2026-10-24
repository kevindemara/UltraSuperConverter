'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const ExcelJS = require('exceljs');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const { validateOfficeArchive } = require('./archive');

function valueOf(value) {
  if (value instanceof Date) return value.toISOString();
  if (!value || typeof value !== 'object') return value ?? '';
  if ('formula' in value || 'sharedFormula' in value) return valueOf(value.result);
  if (value.richText) return value.richText.map(t => t.text).join('');
  return value.text ?? value.error ?? '';
}
function sheetRows(sheet) {
  if (sheet.rowCount > 50000 || sheet.rowCount * Math.max(1, sheet.columnCount) > 500000) throw new Error('Workbook sheets are limited to 50,000 rows and 500,000 cells.');
  return Array.from({ length: sheet.rowCount }, (_, i) => Array.from({ length: sheet.columnCount }, (_, j) => valueOf(sheet.getCell(i + 1, j + 1).value)));
}
function sheetName(workbook, wanted) {
  let name = String(wanted || 'Data').replace(/[\\/*?:\[\]]/g, '_').replace(/^'+|'+$/g, '').slice(0, 31) || 'Data';
  const base = name; let i = 2;
  while (workbook.worksheets.some(s => s.name.toLowerCase() === name.toLowerCase())) name = `${base.slice(0, 26)} (${i++})`;
  return name;
}
function styleSheet(sheet) {
  if (!sheet.rowCount) return;
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.columns.forEach(col => { col.width = 24; });
  if (sheet.columnCount) sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: sheet.rowCount, column: sheet.columnCount } };
}
async function loadWorkbook(file) {
  const wb = new ExcelJS.Workbook();
  if (/\.csv$/i.test(file.originalname)) {
    const table = parse(await fs.readFile(file.path, 'utf8'), { bom: true, skip_empty_lines: false, relax_column_count: true });
    const sheet = wb.addWorksheet('Data'); sheet.addRows(table);
  } else { await validateOfficeArchive(file.path); await wb.xlsx.readFile(file.path); }
  if (!wb.worksheets.length) throw new Error('The workbook has no sheets.');
  for (const sheet of wb.worksheets) sheetRows(sheet);
  return wb;
}
function records(rows) {
  const used = new Set();
  const headers = (rows[0] || []).map((v, i) => {
    const base = String(v || `Column ${i + 1}`); let key = base, n = 2;
    while (used.has(key)) key = `${base} (${n++})`;
    used.add(key); return key;
  });
  return rows.slice(1).map(row => Object.fromEntries(headers.map((key, i) => [key, row[i] ?? ''])));
}

async function markdownDocx(ctx) {
  const D = require('docx');
  const { marked } = require('marked');
  const numbering = [];
  const inline = (tokens, inherited = {}) => (tokens || []).flatMap(token => {
    if (token.type === 'strong') return inline(token.tokens, { ...inherited, bold: true });
    if (token.type === 'em') return inline(token.tokens, { ...inherited, italics: true });
    if (token.type === 'del') return inline(token.tokens, { ...inherited, strike: true });
    if (token.type === 'link' && /^(https?:|mailto:)/i.test(token.href)) return [new D.ExternalHyperlink({ link: token.href, children: inline(token.tokens, { ...inherited, style: 'Hyperlink' }) })];
    if (token.type === 'br') return [new D.TextRun({ break: 1 })];
    if (token.type === 'image') return [new D.TextRun({ ...inherited, text: `[Image: ${token.text || token.href}]` })];
    if (token.tokens) return inline(token.tokens, inherited);
    return [new D.TextRun({ ...inherited, text: token.text || '', ...(token.type === 'codespan' ? { font: 'Consolas', shading: { fill: 'EEF2F6' } } : {}) })];
  });
  function blocks(tokens, indent = 0) {
    return tokens.flatMap(token => {
      if (token.type === 'space' || token.type === 'def') return [];
      if (token.type === 'heading') return [new D.Paragraph({ heading: D.HeadingLevel[`HEADING_${Math.min(6, token.depth)}`], children: inline(token.tokens) })];
      if (token.type === 'table') {
        const row = (cells, bold) => new D.TableRow({ children: cells.map(cell => new D.TableCell({ children: [new D.Paragraph({ children: inline(cell.tokens, { bold }) })] })) });
        return [new D.Table({ width: { size: 100, type: D.WidthType.PERCENTAGE }, rows: [row(token.header, true), ...token.rows.map(r => row(r, false))] }), new D.Paragraph('')];
      }
      if (token.type === 'list') {
        const result = [];
        const reference = `list-${numbering.length + 1}`;
        numbering.push({ reference, levels: Array.from({ length: 9 }, (_, level) => ({ level, format: token.ordered ? D.LevelFormat.DECIMAL : D.LevelFormat.BULLET, text: token.ordered ? `%${level + 1}.` : '•', start: Number(token.start || 1), alignment: D.AlignmentType.LEFT, style: { paragraph: { indent: { left: 360 * (level + 1), hanging: 180 } } } })) });
        token.items.forEach((item, i) => {
          const children = item.tokens || [];
          const normal = children.filter(t => t.type !== 'list');
          const content = normal.flatMap(t => inline(t.tokens || [{ type: 'text', text: t.text || '' }]));
          result.push(new D.Paragraph({ numbering: { reference, level: Math.min(indent, 8) }, children: content }));
          result.push(...blocks(children.filter(t => t.type === 'list'), indent + 1));
        });
        return result;
      }
      if (token.type === 'code') return token.text.split('\n').map(line => new D.Paragraph({ children: [new D.TextRun({ text: line || ' ', font: 'Consolas', size: 19 })], shading: { fill: 'F1F5F9' } }));
      if (token.type === 'blockquote') return blocks(token.tokens, indent + 1);
      if (token.type === 'hr') return [new D.Paragraph({ border: { bottom: { color: 'CBD5E1', size: 4, style: D.BorderStyle.SINGLE } } })];
      if (token.type === 'html') return [new D.Paragraph(require('html-to-text').convert(token.text || '', { wordwrap: false }))];
      return [new D.Paragraph({ children: inline(token.tokens || [{ type: 'text', text: token.text || '' }]), spacing: { after: 140 } })];
    });
  }
  const children = blocks(marked.lexer(await ctx.sourceText()));
  const doc = new D.Document({ title: ctx.options.title, creator: ctx.options.author, numbering: { config: numbering }, styles: { default: { document: { run: { font: 'Calibri', size: 22 }, paragraph: { spacing: { line: 276 } } } } }, sections: [{ properties: { page: { margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } } }, children }] });
  await ctx.write('document.docx', await D.Packer.toBuffer(doc));
}

async function officeTool(ctx) {
  const { toolId, files, options: o, write } = ctx;
  if (toolId === 'markdown-docx') return markdownDocx(ctx);
  if (toolId === 'docx-extract') {
    await validateOfficeArchive(files[0].path);
    const mammoth = require('mammoth');
    const bytes = await fs.readFile(files[0].path); let imageCount = 0;
    const result = await mammoth.convertToHtml({ buffer: bytes }, { externalFileAccess: false, convertImage: mammoth.images.imgElement(async image => {
      const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/tiff': 'tiff' }[image.contentType] || 'bin';
      const output = await write(`embedded-image-${++imageCount}.${extension}`, Buffer.from(await image.read('base64'), 'base64'));
      return { src: output.name };
    }) });
    await write('document.html', `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Extracted Word document</title></head><body>${result.value}</body></html>`, true);
    const text = await mammoth.extractRawText({ buffer: bytes });
    await write('document.txt', text.value, true);
    await write('conversion-warnings.json', JSON.stringify(result.messages, null, 2), true); return;
  }
  if (toolId === 'spreadsheet-convert') {
    if (o.mode === 'xlsx-tables') {
      if (files.length !== 1) throw new Error('Choose one XLSX workbook to export.');
      const wb = await loadWorkbook(files[0]);
      for (const sheet of wb.worksheets) {
        const rows = sheetRows(sheet), stem = ctx.safeName(sheet.name);
        await write(`${stem}.csv`, stringify(rows, { escape_formulas: true }), true);
        await write(`${stem}.json`, JSON.stringify(records(rows), null, 2), true);
      }
    } else {
      const wb = new ExcelJS.Workbook(), sheet = wb.addWorksheet(sheetName(wb, o.sheet));
      if (o.mode === 'csv-xlsx') sheet.addRows(parse(await ctx.sourceText(), { bom: true, skip_empty_lines: true }));
      else {
        const data = JSON.parse(await ctx.sourceText());
        if (!Array.isArray(data) || !data.length || data.some(r => !r || typeof r !== 'object' || Array.isArray(r))) throw new Error('JSON input must be a nonempty array of records.');
        const columns = [...new Set(data.flatMap(Object.keys))];
        sheet.addRow(columns); sheet.addRows(data.map(row => columns.map(key => row[key] !== null && typeof row[key] === 'object' ? JSON.stringify(row[key]) : row[key] ?? '')));
      }
      sheetRows(sheet); styleSheet(sheet); await write('workbook.xlsx', Buffer.from(await wb.xlsx.writeBuffer()));
    }
  } else if (toolId === 'spreadsheet-clean') {
    const source = await loadWorkbook(files[0]), target = new ExcelJS.Workbook(), report = [];
    for (const sheet of source.worksheets) {
      const rows = sheetRows(sheet), trimmed = rows.map(row => row.map(value => typeof value === 'string' ? value.trim() : value));
      const nonblank = trimmed.filter(row => row.some(value => value !== '' && value !== null && value !== undefined));
      if (!nonblank.length) { report.push({ sheet: sheet.name, inputRows: rows.length, outputRows: 0 }); continue; }
      const header = nonblank[0], seen = new Set();
      let data = nonblank.slice(1).filter(row => { const key = JSON.stringify(row); if (o.dedupe === 'yes' && seen.has(key)) return false; seen.add(key); return true; });
      if (o.sort) {
        const index = header.findIndex(h => String(h) === o.sort);
        if (index < 0) throw new Error(`Sort column "${o.sort}" was not found in sheet "${sheet.name}".`);
        const sign = o.order === 'desc' ? -1 : 1;
        data.sort((a, b) => sign * (typeof a[index] === 'number' && typeof b[index] === 'number' ? a[index] - b[index] : String(a[index] ?? '').localeCompare(String(b[index] ?? ''), undefined, { numeric: true })));
      }
      const output = target.addWorksheet(sheetName(target, sheet.name)); output.addRows([header, ...data]); styleSheet(output);
      report.push({ sheet: sheet.name, inputRows: rows.length, blankRowsRemoved: trimmed.length - nonblank.length, duplicatesRemoved: nonblank.length - data.length - 1, outputRows: data.length + 1 });
    }
    if (!target.worksheets.length) throw new Error('The input contains no nonblank rows.');
    await write('cleaned.xlsx', Buffer.from(await target.xlsx.writeBuffer()));
    await write('cleanup-report.json', JSON.stringify(report, null, 2), true);
  } else if (toolId === 'spreadsheet-merge') {
    if (files.length < 2) throw new Error('Choose at least two workbook or CSV files.');
    const target = new ExcelJS.Workbook(), report = [];
    for (const file of files) {
      const source = await loadWorkbook(file);
      for (const sheet of source.worksheets) {
        const name = sheetName(target, sheet.name), output = target.addWorksheet(name);
        output.addRows(sheetRows(sheet));
        sheet.eachRow((row, rowNumber) => row.eachCell((cell, colNumber) => { output.getCell(rowNumber, colNumber).style = JSON.parse(JSON.stringify(cell.style || {})); }));
        sheet.columns.forEach((col, i) => { output.getColumn(i + 1).width = col.width || 24; });
        output.views = [{ state: 'frozen', ySplit: 1 }];
        report.push({ source: file.originalname, sourceSheet: sheet.name, outputSheet: name, rows: sheet.rowCount });
      }
    }
    await write('merged-workbooks.xlsx', Buffer.from(await target.xlsx.writeBuffer())); await write('merge-report.json', JSON.stringify(report, null, 2), true);
  }
}
module.exports = { officeTool, valueOf, sheetRows };
