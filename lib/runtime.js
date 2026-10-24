'use strict';

const minimumNode = '20.19.0';
function isSupported(version = process.versions.node) {
  const parts = String(version).replace(/^v/, '').split('.').map(Number);
  return parts.length >= 3 && parts.every(Number.isFinite) && (parts[0] > 20 || (parts[0] === 20 && parts[1] >= 19));
}
function assertSupported() {
  if (!isSupported()) throw new Error(`UltraSuperConvertor requires Node.js ${minimumNode} or newer. Install the current Node.js LTS, then reopen the app. Detected: ${process.version}`);
}
module.exports = { minimumNode, isSupported, assertSupported };
