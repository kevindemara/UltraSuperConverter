'use strict';

const minimumNode = '22.13.0';
function isSupported(version = process.versions.node) {
  const parts = String(version).replace(/^v/, '').split('.').map(Number);
  return parts.length >= 3 && parts.every(Number.isFinite) && (parts[0] > 22 || (parts[0] === 22 && parts[1] >= 13));
}
function assertSupported() {
  if (!isSupported()) throw new Error(`UltraSuperConverter requires Node.js ${minimumNode} or newer. Install the current Node.js LTS, then reopen the app. Detected: ${process.version}`);
}
module.exports = { minimumNode, isSupported, assertSupported };
