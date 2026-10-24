'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);
const AES_PARAMS = { N: 32768, r: 8, p: 1 };
const PASSWORD_PARAMS = { N: 131072, r: 8, p: 1 };
const MAX_BINARY = 32 * 1024 * 1024;
function requirePassword(value) { if (!value) throw new Error('Enter a password.'); }
function strictHex(value, bytes, label) { if (typeof value !== 'string' || value.length !== bytes * 2 || !/^[a-f0-9]+$/i.test(value)) throw new Error(`Invalid ${label}.`); return Buffer.from(value, 'hex'); }
function base64(value) { if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error('Invalid encrypted data.'); return Buffer.from(value, 'base64'); }
function verifyParams(actual, expected) { return actual && Object.keys(expected).every(key => actual[key] === expected[key]); }
async function keyFor(password, salt, params, length = 32) { return scrypt(password, salt, length, { ...params, maxmem: 256 * 1024 * 1024 }); }
function aesHeader(envelope) { return { format: envelope.format, version: envelope.version, kdf: envelope.kdf, params: envelope.params, salt: envelope.salt, iv: envelope.iv, name: envelope.name }; }

async function securityUtility(ctx) {
  const id = ctx.toolId, o = ctx.options;
  if (id === 'text-hash') {
    const source = await ctx.source(), algorithms = o.algorithm === 'all' ? ['md5', 'sha1', 'sha256', 'sha512', 'sha3-256'] : [o.algorithm];
    const hashes = Object.fromEntries(algorithms.map(a => [a, crypto.createHash(a).update(source, 'utf8').digest('hex')]));
    await ctx.json('text-hashes.json', { encoding: 'UTF-8', bytes: Buffer.byteLength(source), hashes, note: 'Hashes are one-way digests, not encryption. MD5 and SHA-1 are legacy checksum algorithms.' }, { view: { type: 'hashes', hashes } });
  } else if (id === 'hmac') {
    if (!o.key) throw new Error('Enter a secret key.');
    const digest = crypto.createHmac(o.algorithm, o.key).update(await ctx.source(), 'utf8').digest();
    let verified;
    if (o.expected) { if (!/^[0-9a-f]+$/i.test(o.expected) || o.expected.length % 2) throw new Error('Expected HMAC must be hexadecimal.'); const expected = Buffer.from(o.expected, 'hex'); verified = expected.length === digest.length && crypto.timingSafeEqual(expected, digest); }
    await ctx.json('hmac.json', { algorithm: o.algorithm, digest: digest.toString('hex'), ...(verified === undefined ? {} : { verified }) });
  } else if (id === 'aes-encrypt') {
    requirePassword(o.password);
    if (o.mode === 'encrypt') {
      if (o.password.length < 8) throw new Error('Use an encryption password of at least 8 characters.');
      if (ctx.files.length && (await fs.stat(ctx.files[0].path)).size > MAX_BINARY) throw new Error('Encryption supports files up to 32 MB.');
      const source = ctx.files.length ? await fs.readFile(ctx.files[0].path) : Buffer.from(await ctx.source(), 'utf8');
      const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12), key = await keyFor(o.password, salt, AES_PARAMS);
      try {
        const envelope = { format: 'usc-aes-256-gcm', version: 1, kdf: 'scrypt', params: AES_PARAMS, salt: salt.toString('hex'), iv: iv.toString('hex'), name: ctx.safeName(ctx.files[0]?.originalname || 'decrypted.txt') };
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv); cipher.setAAD(Buffer.from(JSON.stringify(aesHeader(envelope))));
        envelope.data = Buffer.concat([cipher.update(source), cipher.final()]).toString('base64'); envelope.tag = cipher.getAuthTag().toString('hex');
        await ctx.write('encrypted.usc.json', JSON.stringify(envelope, null, 2), true);
      } finally { key.fill(0); }
    } else {
      let envelope; try { envelope = JSON.parse(await ctx.source(48 * 1024 * 1024)); } catch (_) { throw new Error('Choose an encrypted JSON envelope created by this tool.'); }
      if (envelope?.format !== 'usc-aes-256-gcm' || envelope.version !== 1 || envelope.kdf !== 'scrypt' || !verifyParams(envelope.params, AES_PARAMS) || Object.keys(envelope.params).length !== 3 || typeof envelope.name !== 'string' || envelope.name.length > 200) throw new Error('Unsupported or invalid encrypted envelope.');
      const salt = strictHex(envelope.salt, 16, 'salt'), iv = strictHex(envelope.iv, 12, 'nonce'), tag = strictHex(envelope.tag, 16, 'authentication tag');
      const encrypted = base64(envelope.data); if (encrypted.length > MAX_BINARY) throw new Error('Encrypted payload exceeds 32 MB.');
      const key = await keyFor(o.password, salt, AES_PARAMS); let plain;
      try { const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv); decipher.setAAD(Buffer.from(JSON.stringify(aesHeader(envelope)))); decipher.setAuthTag(tag); plain = Buffer.concat([decipher.update(encrypted), decipher.final()]); }
      catch (_) { throw new Error('Password is incorrect or the encrypted envelope was changed.'); }
      finally { key.fill(0); }
      const name = o.filename || envelope.name;
      let preview = /\.(txt|md|json|csv|tsv|log|sql|html|css|js|xml|ya?ml)$/i.test(name) && plain.length <= 1000000;
      if (preview) { try { new TextDecoder('utf-8', { fatal: true }).decode(plain); } catch (_) { preview = false; } }
      await ctx.write(name, plain, preview);
    }
  } else if (id === 'password-generate') {
    let groups = ['ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'];
    if (o.groups !== 'letters') groups.push('0123456789');
    if (o.groups === 'all') groups.push('!@#$%^&*()-_=+[]{}:,.?');
    if (o.ambiguous === 'no') groups = groups.map(g => g.replace(/[IlO01]/g, ''));
    const pool = groups.join(''), passwords = [];
    for (let i = 0; i < o.count; i++) {
      const chars = groups.map(group => group[crypto.randomInt(group.length)]);
      while (chars.length < o.length) chars.push(pool[crypto.randomInt(pool.length)]);
      for (let j = chars.length - 1; j > 0; j--) { const k = crypto.randomInt(j + 1); [chars[j], chars[k]] = [chars[k], chars[j]]; }
      passwords.push(chars.join(''));
    }
    await ctx.write('passwords.txt', passwords.join('\n') + '\n', true);
  } else if (id === 'uuid-generate') {
    const uuid = require('uuid'), values = Array.from({ length: o.count }, () => o.version === 'v7' ? uuid.v7() : uuid.v4());
    await ctx.write('uuids.txt', values.join('\n') + '\n', true); await ctx.json('uuids.json', { version: o.version, values });
  } else if (id === 'token-generate') {
    const tokens = Array.from({ length: o.count }, () => crypto.randomBytes(o.bytes).toString(o.encoding)); await ctx.write('tokens.txt', tokens.join('\n') + '\n', true);
  } else if (id === 'scrypt-password') {
    requirePassword(o.password);
    if (!o.digest.trim()) {
      const salt = crypto.randomBytes(16), digest = await keyFor(o.password, salt, PASSWORD_PARAMS, 64);
      await ctx.json('scrypt-digest.json', { format: 'usc-scrypt', version: 1, params: PASSWORD_PARAMS, salt: salt.toString('hex'), digest: digest.toString('hex') }); digest.fill(0);
    } else {
      let envelope; try { envelope = JSON.parse(o.digest); } catch (_) { throw new Error('Paste a valid scrypt digest JSON object.'); }
      if (envelope?.format !== 'usc-scrypt' || envelope.version !== 1 || !verifyParams(envelope.params, PASSWORD_PARAMS) || Object.keys(envelope.params).length !== 3) throw new Error('Unsupported scrypt digest parameters.');
      const salt = strictHex(envelope.salt, 16, 'salt'), expected = strictHex(envelope.digest, 64, 'digest'), actual = await keyFor(o.password, salt, PASSWORD_PARAMS, 64);
      await ctx.json('password-verification.json', { algorithm: 'scrypt', verified: crypto.timingSafeEqual(expected, actual) }); actual.fill(0);
    }
  } else if (id === 'bcrypt-password') {
    requirePassword(o.password); if (Buffer.byteLength(o.password) > 72) throw new Error('Bcrypt passwords must not exceed 72 UTF-8 bytes.');
    const bcrypt = require('bcryptjs');
    if (o.digest) { const match = o.digest.match(/^\$2[aby]\$(\d{2})\$[./A-Za-z0-9]{53}$/); if (!match || Number(match[1]) < 4 || Number(match[1]) > 13) throw new Error('Provide a bcrypt digest with a work factor no greater than 13.'); await ctx.json('password-verification.json', { algorithm: 'bcrypt', verified: await bcrypt.compare(o.password, o.digest) }); }
    else await ctx.json('bcrypt-digest.json', { algorithm: 'bcrypt', cost: o.cost, digest: await bcrypt.hash(o.password, o.cost) });
  } else if (id === 'certificate-inspect') {
    let certificate; try { if (ctx.files.length && (await fs.stat(ctx.files[0].path)).size > 1000000) throw new Error(); certificate = new crypto.X509Certificate(ctx.files.length ? await fs.readFile(ctx.files[0].path) : await ctx.source()); } catch (_) { throw new Error('Provide a valid PEM or DER X.509 certificate under 1 MB.'); }
    const from = new Date(certificate.validFrom), to = new Date(certificate.validTo), now = Date.now();
    await ctx.json('certificate-details.json', { subject: certificate.subject, issuer: certificate.issuer, serialNumber: certificate.serialNumber, validFrom: from.toISOString(), validTo: to.toISOString(), timeValid: now >= from.getTime() && now <= to.getTime(), subjectAltName: certificate.subjectAltName || '', fingerprintSHA256: certificate.fingerprint256, publicKeyType: certificate.publicKey.asymmetricKeyType, publicKeyDetails: Object.fromEntries(Object.entries(certificate.publicKey.asymmetricKeyDetails || {}).map(([k, v]) => [k, typeof v === 'bigint' ? v.toString() : v])), certificateAuthority: certificate.ca, trustChainVerified: false });
  } else if (id === 'jwt-inspect') {
    const source = (await ctx.source()).trim(); if (source.length > 50000) throw new Error('JWT input is limited to 50,000 characters.');
    const parts = source.split('.'); if (parts.length !== 3) throw new Error('Provide a compact three-part JWT. Encrypted five-part JWEs are not supported.');
    function decode(value) { if (!value || !/^[A-Za-z0-9_-]+$/.test(value) || value.length % 4 === 1) throw new Error('Invalid JWT Base64URL encoding.'); try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(value, 'base64url'))); } catch (_) { throw new Error('JWT header and payload must contain UTF-8 JSON.'); } }
    const header = decode(parts[0]), payload = decode(parts[1]);
    if (!header || typeof header !== 'object' || Array.isArray(header) || !payload || typeof payload !== 'object' || Array.isArray(payload) || (parts[2] && !/^[A-Za-z0-9_-]+$/.test(parts[2]))) throw new Error('Invalid JWT structure.');
    const expiry = typeof payload.exp === 'number' && Number.isFinite(payload.exp) ? payload.exp : null;
    const expiryDate = expiry === null ? null : new Date(expiry * 1000);
    await ctx.json('jwt-details.json', { header, payload, signatureVerified: false, expiredByUntrustedClaim: expiry === null ? null : Date.now() / 1000 >= expiry, expiryClaimISO: expiryDate && Number.isFinite(expiryDate.getTime()) ? expiryDate.toISOString() : null, note: 'Decoded claims are untrusted. No signature or issuer verification was performed.' });
  } else throw new Error('Unknown security utility.');
}
module.exports = { securityUtility, AES_PARAMS, PASSWORD_PARAMS };
