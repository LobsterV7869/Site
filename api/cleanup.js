const crypto = require('crypto');
const { deleteOlderThan } = require('./_store');

function safeEqual(a, b) {
  const bufferA = Buffer.from(String(a));
  const bufferB = Buffer.from(String(b));
  if (bufferA.length !== bufferB.length) return false;
  return crypto.timingSafeEqual(bufferA, bufferB);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const secret = process.env.CRON_SECRET;
  const authorization = req.headers.authorization || '';
  const provided = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const url = new URL(req.url, 'http://localhost');
  const querySecret = url.searchParams.get('secret') || '';

  const authorized =
    Boolean(secret) && (safeEqual(provided, secret) || safeEqual(querySecret, secret));

  if (!authorized) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const parsedDays = parseInt(process.env.LOG_RETENTION_DAYS, 10);
  const days = Math.max(Number.isFinite(parsedDays) ? parsedDays : 30, 1);

  let deleted = 0;
  try {
    deleted = await deleteOlderThan(days);
  } catch (_) {
    deleted = 0;
  }

  res.status(200).json({ deleted, retentionDays: days });
};