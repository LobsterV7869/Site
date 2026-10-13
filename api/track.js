const KV_KEY = 'visitor_logs';

function header(req, name) {
  const value = req.headers[name] || req.headers[name.toLowerCase()];
  return typeof value === 'string' && value.length ? value.trim() : null;
}

function clientIp(req) {
  const xff = header(req, 'x-forwarded-for');
  return (
    header(req, 'x-vercel-forwarded-for') ||
    (xff ? xff.split(',')[0].trim() : null) ||
    header(req, 'x-real-ip') ||
    null
  );
}

function buildRecord(req, body) {
  return {
    ip: clientIp(req),
    country: header(req, 'x-vercel-ip-country'),
    country_region: header(req, 'x-vercel-ip-country-region'),
    city: header(req, 'x-vercel-ip-city'),
    latitude: header(req, 'x-vercel-ip-latitude'),
    longitude: header(req, 'x-vercel-ip-longitude'),
    timezone: header(req, 'x-vercel-ip-timezone'),
    asn: header(req, 'x-vercel-ip-asn'),
    user_agent: header(req, 'user-agent'),
    path: body.path || null,
    referrer: body.referrer || null,
    created_at: new Date().toISOString(),
  };
}

function readRawBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 100000) {
        req.destroy();
        resolve('');
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', () => resolve(''));
  });
}

async function parseBody(req) {
  if (req.body !== undefined && req.body !== null) {
    return typeof req.body === 'object' ? req.body : safeParse(req.body);
  }
  return safeParse(await readRawBody(req));
}

function safeParse(str) {
  try {
    const parsed = JSON.parse(str);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

async function saveToKv(record) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return false;
  const res = await fetch(`${url.replace(/\/$/, '')}/lpush/${KV_KEY}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([JSON.stringify(record)]),
  });
  return res.ok;
}

async function saveToSupabase(record) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;
  const res = await fetch(`${url.replace(/\/$/, '')}/rest/v1/visitor_logs`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(record),
  });
  return res.ok;
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).end();
    return;
  }

  const body = await parseBody(req);
  const record = buildRecord(req, body);

  if (!record.ip) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(204).end();
    return;
  }

  await saveToKv(record);
  await saveToSupabase(record);

  res.setHeader('Cache-Control', 'no-store');
  res.status(204).end();
};