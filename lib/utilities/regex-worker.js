'use strict';
const { parentPort, workerData } = require('node:worker_threads');
try {
  const { source, pattern, flags, mode, replacement } = workerData;
  if (!/^[dgimsuvy]*$/.test(flags) || new Set(flags).size !== flags.length || (flags.includes('u') && flags.includes('v'))) throw new Error('Choose valid, nonduplicate JavaScript regex flags.');
  const expression = new RegExp(pattern, flags);
  if (mode === 'replace') {
    const output = source.replace(expression, replacement);
    if (output.length > 4000000) throw new Error('Replacement output exceeds four million characters.');
    parentPort.postMessage({ output });
  } else {
    const matches = []; let match, truncated = false;
    while ((match = expression.exec(source))) {
      if (matches.length === 1000) { truncated = true; break; }
      matches.push({ value: match[0], index: match.index, groups: match.slice(1).map(value => value ?? null), namedGroups: match.groups || null });
      if (!expression.global && !expression.sticky) break;
      if (match[0] === '') { const code = source.codePointAt(expression.lastIndex); expression.lastIndex += (expression.unicode || expression.unicodeSets) && code > 0xffff ? 2 : 1; }
    }
    parentPort.postMessage({ matches, truncated });
  }
} catch (error) { parentPort.postMessage({ error: error.message }); }
