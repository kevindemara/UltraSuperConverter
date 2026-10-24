'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const library = require('../public/tool-library');
const tools = require('../lib/toolbox').catalog;

function memoryStorage(initial = null) {
  let value = initial;
  return { getItem: () => value, setItem: (key, next) => { assert.equal(key, library.STORAGE_KEY); value = next; }, get value() { return value; } };
}
test('All 100 tools appear in exactly one of ten categories and have renderable icons', () => {
  assert.equal(library.categories.length, 10);
  const ids = library.categories.flatMap(category => category.ids);
  assert.equal(ids.length, 100); assert.equal(new Set(ids).size, 100);
  assert.deepEqual([...ids].sort(), tools.map(t => t.id).sort());
  for (const tool of tools) {
    const category = library.categoryOf(tool), icon = library.icons[library.metadata[tool.id].icon];
    assert.ok(category, `Missing category: ${tool.id}`); assert.ok(icon?.label || icon?.paths?.length || icon?.circles?.length, `Missing icon: ${tool.id}`);
  }
});
test('Favorites persist across reloads, toggle without duplicates, and store no tool inputs', () => {
  const storage = memoryStorage(), first = library.createPreferences(tools, storage);
  first.toggleFavorite('text-dedupe'); first.toggleFavorite('pdf-compress');
  const reloaded = library.createPreferences(tools, storage); assert.deepEqual(reloaded.state.favorites, ['text-dedupe', 'pdf-compress']);
  reloaded.toggleFavorite('text-dedupe'); assert.deepEqual(reloaded.state.favorites, ['pdf-compress']);
  reloaded.toggleFavorite('unknown-tool'); assert.deepEqual(reloaded.state.favorites, ['pdf-compress']);
  assert.deepEqual(Object.keys(JSON.parse(storage.value)).sort(), ['display', 'favorites', 'recent', 'sort', 'version']);
});
test('Recent tools are unique, newest first, capped at 12, and can be cleared independently', () => {
  const storage = memoryStorage(), model = library.createPreferences(tools, storage);
  model.toggleFavorite('pdf-compress'); tools.slice(0, 15).forEach(t => model.recordUse(t.id));
  assert.equal(model.state.recent.length, 12); assert.equal(model.state.recent[0], tools[14].id);
  model.recordUse(tools[7].id); assert.equal(model.state.recent[0], tools[7].id); assert.equal(new Set(model.state.recent).size, 12);
  const reloaded = library.createPreferences(tools, storage); assert.deepEqual(reloaded.state.recent, model.state.recent);
  model.clearRecent(); assert.equal(model.state.recent.length, 0); assert.deepEqual(model.state.favorites, ['pdf-compress']);
});
test('Malformed or stale browser preferences recover without exposing unknown IDs', () => {
  const invalid = library.createPreferences(tools, memoryStorage('{broken')); assert.equal(invalid.available, true); assert.deepEqual(invalid.state.favorites, []);
  const stale = library.createPreferences(tools, memoryStorage(JSON.stringify({ favorites: ['unknown', 'text-case', 'text-case', 7], recent: ['pdf-compress', '__proto__', 'pdf-compress'], text: 'must not persist', display: 'bad', sort: 'bad' })));
  assert.deepEqual(stale.state.favorites, ['text-case']); assert.deepEqual(stale.state.recent, ['pdf-compress']); assert.equal(stale.state.display, 'grid'); assert.equal(stale.state.sort, 'category');
  const copy = stale.state; copy.favorites.push('text-count'); assert.deepEqual(stale.state.favorites, ['text-case']);
});
test('Unavailable browser storage still permits favorites and recents for the visit', () => {
  const model = library.createPreferences(tools, { getItem: () => { throw new Error('Unavailable'); }, setItem: () => { throw new Error('Quota exceeded'); } });
  model.toggleFavorite('text-case'); model.recordUse('text-count'); assert.equal(model.available, false); assert.deepEqual(model.state.favorites, ['text-case']); assert.deepEqual(model.state.recent, ['text-count']);
});
test('Display and sort preferences survive reloads and external storage refreshes', () => {
  const storage = memoryStorage(), first = library.createPreferences(tools, storage), second = library.createPreferences(tools, storage);
  first.setDisplay('list'); first.setSort('name'); first.toggleFavorite('text-count');
  second.reload(); assert.equal(second.state.display, 'list'); assert.equal(second.state.sort, 'name'); assert.deepEqual(second.state.favorites, ['text-count']);
  second.setDisplay('invalid'); second.setSort('invalid'); assert.equal(second.state.display, 'list'); assert.equal(second.state.sort, 'name');
});
test('Search works globally from personal/category views with aliases, accents and multiple terms', () => {
  const select = (query, view = 'all') => library.selectTools(tools, { query, view });
  assert.ok(select('uppercase', 'pdf').some(t => t.id === 'text-case'));
  assert.equal(select('compress PDF')[0].id, 'pdf-compress');
  assert.ok(select('colour').some(t => t.id === 'color-convert'));
  assert.ok(select('wórd count').some(t => t.id === 'text-count'));
  assert.ok(select('unzip').some(t => t.id === 'archive-explorer'));
  assert.equal(select('this-tool-does-not-exist-at-all').length, 0);
});
test('Category, favorite and recent filters never lose or reorder tools unexpectedly', () => {
  const preferences = { favorites: ['text-case', 'pdf-compress'], recent: ['text-count', 'text-case'] };
  assert.equal(library.selectTools(tools, { view: 'pdf' }, preferences).length, 15);
  assert.ok(library.selectTools(tools, { view: 'pdf' }, preferences).every(t => library.metadata[t.id].category === 'pdf'));
  assert.deepEqual(library.selectTools(tools, { view: 'favorites', sort: 'name' }, preferences).map(t => t.id), ['pdf-compress', 'text-case']);
  assert.deepEqual(library.selectTools(tools, { view: 'recent', sort: 'name' }, preferences).map(t => t.id), ['text-count', 'text-case']);
  const originalOrder = tools.map(t => t.id); library.selectTools(tools, { sort: 'name' }); assert.deepEqual(tools.map(t => t.id), originalOrder);
});
