'use strict';

const STATE_ID = 'production';

function getConfig(env = process.env) {
  const url = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || '');
  if (!url && !key) return null;
  if (!url || !key) throw new Error('Supabase storage requires both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  return { url, key };
}

function headers(config, extra = {}) {
  return Object.assign({
    apikey: config.key,
    Authorization: 'Bearer ' + config.key,
    'Content-Type': 'application/json'
  }, extra);
}

async function readSnapshot(config = getConfig()) {
  if (!config) return null;
  const url = config.url + '/rest/v1/app_state?id=eq.' + encodeURIComponent(STATE_ID) + '&select=payload';
  const response = await fetch(url, { headers: headers(config) });
  if (!response.ok) throw new Error('Supabase read failed (' + response.status + '): ' + (await response.text()).slice(0, 300));
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error('Supabase read returned an invalid response');
  return rows.length ? rows[0].payload : null;
}

async function writeSnapshot(snapshot, config = getConfig()) {
  if (!config) return;
  const url = config.url + '/rest/v1/app_state?on_conflict=id';
  const response = await fetch(url, {
    method: 'POST',
    headers: headers(config, { Prefer: 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify({ id: STATE_ID, payload: snapshot, updated_at: new Date().toISOString() })
  });
  if (!response.ok) throw new Error('Supabase write failed (' + response.status + '): ' + (await response.text()).slice(0, 300));
}

async function insertSnapshotIfEmpty(snapshot, config = getConfig()) {
  if (!config) throw new Error('Supabase is not configured');
  const existing = await readSnapshot(config);
  if (existing !== null) throw new Error('Supabase app_state already has data; refusing to overwrite it');
  const response = await fetch(config.url + '/rest/v1/app_state', {
    method: 'POST',
    headers: headers(config, { Prefer: 'return=minimal' }),
    body: JSON.stringify({ id: STATE_ID, payload: snapshot, updated_at: new Date().toISOString() })
  });
  if (!response.ok) throw new Error('Supabase import failed (' + response.status + '): ' + (await response.text()).slice(0, 300));
}

module.exports = { STATE_ID, getConfig, readSnapshot, writeSnapshot, insertSnapshotIfEmpty };