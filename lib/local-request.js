'use strict';
module.exports = function localRequest(req, res, next) {
  const names = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
  if (!names.has(req.hostname.toLowerCase())) return res.status(403).json({ error: 'Open the app through localhost.' });
  const origin = req.get('origin');
  if (origin) {
    try { const url = new URL(origin); if (!names.has(url.hostname) || url.protocol !== 'http:' || Number(url.port || 80) !== req.socket.localPort) throw new Error(); }
    catch (_) { return res.status(403).json({ error: 'Requests must come from this local app.' }); }
  }
  next();
};
