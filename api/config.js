module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const parsedDays = parseInt(process.env.LOG_RETENTION_DAYS, 10);

  res.status(200).json({
    contactEmail: process.env.CONTACT_EMAIL || null,
    retentionDays: Math.max(Number.isFinite(parsedDays) ? parsedDays : 30, 1),
    hashingEnabled: Boolean(process.env.IP_HASH_SALT),
  });
};