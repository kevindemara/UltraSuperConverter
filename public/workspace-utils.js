(function (root) {
  'use strict';
  const naming = (template, context, used = new Set()) => {
    const clean = value => String(value || '').replace(/[^\p{L}\p{N}._-]/gu, '_').slice(0, 130);
    const base = String(context.name || 'result.bin').split(/[\\/]/).pop();
    const dot = base.lastIndexOf('.');
    const stem = dot > 0 ? base.slice(0, dot) : base;
    const ext = dot > 0 ? base.slice(dot) : '';
    const values = { name: stem, source: String(context.source || 'converted').replace(/\.[^.]+$/, ''), tool: context.tool || 'converted', index: context.index || 1, date: context.date || new Date().toISOString().slice(0, 10) };
    const expanded = String(template || '{name}').replace(/\{(name|source|tool|index|date)\}/g, (_, token) => clean(values[token]));
    if (/\{[^}]+\}/.test(expanded)) throw new Error('Unknown naming token. Use {name}, {source}, {tool}, {index}, or {date}.');
    let output = clean(expanded) || 'result';
    let candidate = output + clean(ext), suffix = 2;
    while (used.has(candidate.toLowerCase())) candidate = `${output}-${suffix++}${clean(ext)}`;
    used.add(candidate.toLowerCase());
    return candidate;
  };
  const api = { naming };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WORKSPACE_UTILS = api;
})(typeof window === 'object' ? window : globalThis);
