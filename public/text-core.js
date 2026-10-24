(function (root) {
  'use strict';
  const wordSegmenter = new Intl.Segmenter('en', { granularity: 'word' });
  const graphemeSegmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
  const sentenceSegmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
  const graphemes = source => Array.from(graphemeSegmenter.segment(source), part => part.segment);
  const words = source => Array.from(wordSegmenter.segment(source)).filter(part => part.isWordLike).map(part => part.segment);
  function stats(source, readingWPM = 225, speakingWPM = 150) {
    const wordCount = words(source).length;
    let visible = 0, withoutSpaces = 0;
    for (const item of graphemeSegmenter.segment(source)) { visible++; if (!/^\s+$/u.test(item.segment)) withoutSpaces++; }
    return { words: wordCount, characters: visible, charactersWithoutSpaces: withoutSpaces, codePoints: [...source].length, utf16Units: source.length, utf8Bytes: new TextEncoder().encode(source).length, lines: source ? source.replace(/\r\n?/g, '\n').split('\n').length : 0, sentences: [...sentenceSegmenter.segment(source)].filter(p => p.segment.trim()).length, paragraphs: source.trim() ? source.trim().split(/\n\s*\n/).length : 0, readingSeconds: Math.ceil(wordCount / readingWPM * 60), speakingSeconds: Math.ceil(wordCount / speakingWPM * 60) };
  }
  function caseFormat(source, mode) {
    if (mode === 'upper') return source.toLocaleUpperCase('en');
    if (mode === 'lower') return source.toLocaleLowerCase('en');
    if (mode === 'capitalize') return [...wordSegmenter.segment(source.toLocaleLowerCase('en'))].map(part => part.isWordLike ? part.segment.replace(/\p{L}/u, c => c.toLocaleUpperCase('en')) : part.segment).join('');
    if (mode === 'title') {
      const minor = new Set('a an and as at but by for in nor of on or per the to via vs with'.split(' '));
      return source.split(/(\r\n|\r|\n)/).map(line => {
        const segments = [...wordSegmenter.segment(line.toLocaleLowerCase('en'))], positions = segments.map((part, i) => part.isWordLike ? i : -1).filter(i => i >= 0);
        return segments.map((part, i) => part.isWordLike && (!minor.has(part.segment) || i === positions[0] || i === positions.at(-1)) ? part.segment.replace(/\p{L}/u, c => c.toLocaleUpperCase('en')) : part.segment).join('');
      }).join('');
    }
    if (mode === 'sentence') return source.toLocaleLowerCase('en').replace(/(^|[.!?]\s+|\n\s*)([^\p{L}]*)(\p{L})/gu, (_, prefix, punctuation, letter) => prefix + punctuation + letter.toLocaleUpperCase('en'));
    if (mode === 'toggle') return [...source].map(c => c === c.toLocaleUpperCase('en') ? c.toLocaleLowerCase('en') : c.toLocaleUpperCase('en')).join('');
    if (mode === 'alternating') { let i = 0; return [...source].map(c => /\p{L}/u.test(c) ? (i++ % 2 ? c.toLocaleUpperCase('en') : c.toLocaleLowerCase('en')) : c).join(''); }
    throw new Error('Unknown case mode.');
  }
  const api = { stats, graphemes, words, caseFormat };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TEXT_CORE = api;
})(typeof window === 'object' ? window : globalThis);
