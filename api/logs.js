const crypto = require('crypto');
const { listRecords } = require('./_store');

function safeEqual(a, b) {
  const bufferA = Buffer.from(String(a));
  const bufferB = Buffer.from(String(b));
  if (bufferA.length !== bufferB.length) return false;
  return crypto.timingSafeEqual(bufferA, bufferB);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const token = process.env.LOG_ADMIN_TOKEN;
  const authorization = req.headers.authorization || '';
  const provided = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';

  if (!token || !provided || !safeEqual(provided, token)) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const url = new URL(req.url, 'http://localhost');
  const parsedLimit = parseInt(url.searchParams.get('limit'), 10);
  const limit = Math.min(Math.max(Number.isFinite(parsedLimit) ? parsedLimit : 100, 1), 1000);
  const ip = (url.searchParams.get('ip') || '').slice(0, 128) || undefined;

  let logs = [];
  try {
    logs = await listRecords({ limit, ip });
  } catch (_) {
    logs = [];
  }

  res.status(200).json({ count: logs.length, logs });
};