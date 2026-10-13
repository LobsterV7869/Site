const crypto = require('crypto');

const KV_KEY = 'visitor_logs';

function env(name) {
  const value = process.env[name];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function kvUrl() {
  return env('KV_REST_API_URL') || env('UPSTASH_REDIS_REST_URL');
}

function kvToken() {
  return env('KV_REST_API_TOKEN') || env('UPSTASH_REDIS_REST_TOKEN');
}

function hasSupabase() {
  return Boolean(env('SUPABASE_URL') && env('SUPABASE_SERVICE_ROLE_KEY'));
}

function hasKv() {
  return Boolean(kvUrl() && kvToken());
}

function hasStorage() {
  return hasSupabase() || hasKv();
}

function hashIp(ip) {
  const salt = env('IP_HASH_SALT');
  if (!salt) return ip;
  return `sha256:${crypto.createHash('sha256').update(`${salt}:${ip}`).digest('hex')}`;
}

async function redis(command) {
  const base = kvUrl().replace(/\/$/, '');
  const res = await fetch(`${base}/${command}`, {
    headers: { Authorization: `Bearer ${kvToken()}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`kv_${res.status}`);
  const data = await res.json();
  return data ? data.result : null;
}

function supabase(path, init) {
  const base = env('SUPABASE_URL').replace(/\/$/, '');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  return fetch(`${base}/rest/v1/${path}`, {
    ...(init || {}),
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init && init.headers ? init.headers : {}),
    },
    cache: 'no-store',
  });
}

async function saveRecord(record) {
  if (hasSupabase()) {
    const res = await supabase('visitor_logs', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify(record),
    });
    return res.ok;
  }
  if (hasKv()) {
    await redis(`lpush/${KV_KEY}/${encodeURIComponent(JSON.stringify(record))}`);
    return true;
  }
  return false;
}

async function listRecords({ limit = 100, ip } = {}) {
  if (hasSupabase()) {
    const params = new URLSearchParams();
    params.set('select', 'id,created_at,ip,country,path,referrer,user_agent');
    params.set('order', 'created_at.desc');
    params.set('limit', String(limit));
    if (ip) params.set('ip', `eq.${ip}`);
    const res = await supabase(`visitor_logs?${params.toString()}`, { method: 'GET' });
    if (!res.ok) return [];
    return res.json();
  }
  if (hasKv()) {
    const raw = await redis(`lrange/${KV_KEY}/0/-1`);
    const rows = (Array.isArray(raw) ? raw : [])
      .map((item) => {
        try {
          return JSON.parse(item);
        } catch (_) {
          return null;
        }
      })
      .filter(Boolean);
    const filtered = ip ? rows.filter((row) => row.ip === ip) : rows;
    return filtered.slice(0, limit);
  }
  return [];
}

async function deleteOlderThan(days) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  if (hasSupabase()) {
    const res = await supabase(`visitor_logs?created_at=lt.${encodeURIComponent(cutoff)}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=representation' },
    });
    if (!res.ok) return 0;
    const rows = await res.json();
    return Array.isArray(rows) ? rows.length : 0;
  }
  if (hasKv()) {
    const raw = await redis(`lrange/${KV_KEY}/0/-1`);
    const items = Array.isArray(raw) ? raw : [];
    const keep = [];
    let removed = 0;
    for (const item of items) {
      let record;
      try {
        record = JSON.parse(item);
      } catch (_) {
        keep.push(item);
        continue;
      }
      if (record && typeof record.created_at === 'string' && record.created_at < cutoff) {
        removed += 1;
      } else {
        keep.push(item);
      }
    }
    if (removed > 0) {
      await redis(`del/${KV_KEY}`);
      for (let i = 0; i < keep.length; i += 100) {
        const chunk = keep
          .slice(i, i + 100)
          .map((value) => encodeURIComponent(value))
          .join('/');
        await redis(`rpush/${KV_KEY}/${chunk}`);
      }
    }
    return removed;
  }
  return 0;
}

module.exports = {
  hasStorage,
  hasSupabase,
  hasKv,
  hashIp,
  saveRecord,
  listRecords,
  deleteOlderThan,
};