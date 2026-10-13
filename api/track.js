const { hasStorage, hashIp, saveRecord } = require('./_store');

const LIMITS = { ip: 45, country: 8, path: 512, referrer: 512, user_agent: 512 };
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_MAX = 60;
const MAX_BODY_BYTES = 4096;

const buckets = new Map();

function readHeader(req, name) {
  const value = req.headers[name] || req.headers[name.toLowerCase()];
  return typeof value === 'string' && value.length > 0 ? value.trim() : null;
}

function limit(value, max) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

function clientIp(req) {
  const forwarded = readHeader(req, 'x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0].trim();
    if (first) return first;
  }
  return readHeader(req, 'x-vercel-forwarded-for') || readHeader(req, 'x-real-ip') || null;
}

function readRawBody(req) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        req.destroy();
        resolve('');
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => resolve(''));
  });
}

async function parseBody(req) {
  let raw = '';
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'object') return req.body;
    raw = String(req.body);
  } else {
    raw = await readRawBody(req);
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function allowedOrigin(req) {
  const origin = readHeader(req, 'origin');
  if (!origin) return null;
  const allowed = new Set();
  const host = readHeader(req, 'host');
  if (host) allowed.add(`https://${host}`);
  (process.env.ALLOWED_ORIGIN || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .forEach((value) => allowed.add(value));
  return allowed.has(origin) ? origin : null;
}

function applyCors(req, res) {
  const origin = allowedOrigin(req);
  if (!origin) return;
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function rateLimited(ip) {
  const now = Date.now();
  if (buckets.size > 10000) {
    for (const [key, value] of buckets) {
      if (now - value.start > RATE_WINDOW_MS) buckets.delete(key);
    }
  }
  const bucket = buckets.get(ip);
  if (!bucket || now - bucket.start > RATE_WINDOW_MS) {
    buckets.set(ip, { start: now, count: 1 });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_MAX;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  applyCors(req, res);

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(204).end();
    return;
  }

  if (!hasStorage()) {
    res.status(204).end();
    return;
  }

  const ip = clientIp(req);
  if (!ip || rateLimited(ip)) {
    res.status(204).end();
    return;
  }

  const body = await parseBody(req);
  const storedIp = hashIp(limit(ip, LIMITS.ip));
  const country = readHeader(req, 'x-vercel-ip-country');

  const record = {
    ip: storedIp ? storedIp.slice(0, 128) : null,
    country: country ? country.toUpperCase().slice(0, LIMITS.country) : null,
    path: limit(body.path, LIMITS.path),
    referrer: limit(body.referrer, LIMITS.referrer),
    user_agent: limit(readHeader(req, 'user-agent'), LIMITS.user_agent),
    created_at: new Date().toISOString(),
  };

  if (record.ip) {
    try {
      await saveRecord(record);
    } catch (_) {}
  }

  res.status(204).end();
};