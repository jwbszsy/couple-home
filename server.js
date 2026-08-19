'use strict';

/**
 * 我们的小屋 —— 情侣专属实时互动小软件（服务端）
 * 零第三方依赖：仅使用 Node.js 内置模块（http / fs / path / crypto）。
 * 实时推送：SSE（Server-Sent Events）；数据持久化：data/db.json（原子写入）。
 * 运行：node server.js  （默认 http://localhost:3000）
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

const MAX_JSON_BODY = 18 * 1024 * 1024;   // 单次请求体上限（头像/背景/图片/音乐 base64）
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;  // 单张图片 base64 上限
const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 单首音乐 base64 上限
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 去掉易混淆字符
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin888';    // 管理后台密码
const ACTIVATION_FILE = path.join(DATA_DIR, 'activations.json');
const VAPID_FILE = path.join(DATA_DIR, 'vapid.json');
const MAX_VOICE_BYTES = 2 * 1024 * 1024;                    // 语音留言上限
const SEED = 'couple-home-activation-v1';                   // 激活码确定性种子（本地/服务器一致）
let webPush = null;
try { webPush = require('web-push'); } catch (e) { /* 未安装则跳过推送 */ }

// ---------------- 持久化 ----------------
let db = { pairs: {} };
try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { /* 首次运行 */ }
for (const pid of Object.keys(db.pairs || {})) normalizePair(db.pairs[pid]);

// ---------------- 激活码 ----------------
function genCodeByIndex(i) {
  const b1 = crypto.createHmac('sha256', SEED).update('code:' + i).digest();
  const b2 = crypto.createHmac('sha256', SEED).update('code2:' + i).digest();
  const buf = Buffer.concat([b1, b2]);
  let code = '';
  let pos = 0;
  while (code.length < 8) {
    code += CODE_ALPHABET[buf[pos % buf.length] % CODE_ALPHABET.length];
    pos++;
  }
  return code.slice(0, 4) + '-' + code.slice(4, 8);
}
function genCodes(count, startIdx) {
  const seen = new Set();
  const out = [];
  let i = startIdx;
  while (out.length < count) {
    const code = genCodeByIndex(i);
    if (!seen.has(code)) {
      seen.add(code);
      out.push({ code, used: false, usedBy: null, usedAt: null });
    }
    i++;
  }
  return out;
}
let activations = null;
function loadActivations() {
  try { activations = JSON.parse(fs.readFileSync(ACTIVATION_FILE, 'utf8')); } catch (e) { activations = null; }
  if (!activations || !Array.isArray(activations.codes)) {
    activations = { codes: genCodes(200, 0), nextIndex: 200 };
    saveActivations();
  }
}
function saveActivations() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(ACTIVATION_FILE + '.tmp', JSON.stringify(activations));
  fs.renameSync(ACTIVATION_FILE + '.tmp', ACTIVATION_FILE);
}
loadActivations();

// ---------------- VAPID / 推送 ----------------
let VAPID = null;
function loadVapid() {
  try { VAPID = JSON.parse(fs.readFileSync(VAPID_FILE, 'utf8')); } catch (e) { VAPID = null; }
  if (webPush) {
    if (!VAPID || !VAPID.publicKey) {
      VAPID = webPush.generateVAPIDKeys();
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(VAPID_FILE, JSON.stringify(VAPID));
    }
    webPush.setVapidDetails('mailto:couple@localhost', VAPID.publicKey, VAPID.privateKey);
  }
}
loadVapid();

// 管理后台会话（内存 token）
const adminTokens = new Map();
function adminTokenOk(token) {
  const e = adminTokens.get(token);
  return !!e && e > Date.now();
}

// ---------------- 简易限流（防暴力破解/刷接口） ----------------
const rateBuckets = new Map();
function rateLimit(ip, key, max, windowMs) {
  const k = ip + ':' + key;
  const now = Date.now();
  const b = rateBuckets.get(k);
  if (!b || now - b.ts > windowMs) {
    rateBuckets.set(k, { ts: now, count: 1 });
    return true;
  }
  b.count++;
  return b.count <= max;
}
function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) { const first = String(fwd).split(',')[0].trim(); if (first) return first; }
  return req.socket.remoteAddress || '0.0.0.0';
}

// ---------------- 使用统计（每日活跃等） ----------------
let stats = { daily: {}, flagged: [] };
const STATS_FILE = path.join(DATA_DIR, 'stats.json');
try { stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8')); } catch (e) { /* 首次运行 */ }
if (!stats.daily) stats.daily = {};
if (!stats.flagged) stats.flagged = [];
let statsSaveQueued = false;
function saveStats() {
  if (statsSaveQueued) return;
  statsSaveQueued = true;
  setImmediate(() => {
    statsSaveQueued = false;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = STATS_FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(stats));
      fs.renameSync(tmp, STATS_FILE);
    } catch (e) { /* 忽略 */ }
  });
}
function todayStatsKey() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function markActive(memberId) {
  const k = todayStatsKey();
  const day = stats.daily[k] || (stats.daily[k] = { active: [], newPairs: 0 });
  if (!day.active.includes(memberId)) day.active.push(memberId);
  // 只保留最近 90 天
  const keys = Object.keys(stats.daily).sort();
  while (keys.length > 90) { delete stats.daily[keys.shift()]; }
  saveStats();
}
function markNewPair() {
  const k = todayStatsKey();
  const day = stats.daily[k] || (stats.daily[k] = { active: [], newPairs: 0 });
  day.newPairs++;
  saveStats();
}

// ---------------- 聊天审核（服务器端可解密，用于合规监看） ----------------
const SENSITIVE_WORDS = ['赌博','博彩','网赌','菠菜','杀猪盘','诈骗','洗钱','刷单','裸聊','招嫖','卖淫','嫖娼','冰毒','海洛因','毒品','迷药','枪支','弹药','买卖器官','代孕','假钞','发票代开','办证','约炮','赌博网'];
const CHAT_SALT = Buffer.from('couple-chat-v1');
function chatKeyFromCode(code) {
  return crypto.pbkdf2Sync(String(code || ''), CHAT_SALT, 100000, 32, 'sha256');
}
function chatDecrypt(code, ivB64, ctB64) {
  const key = chatKeyFromCode(code);
  const iv = Buffer.from(ivB64, 'base64');
  const data = Buffer.from(ctB64, 'base64');
  const tag = data.slice(data.length - 16);
  const ct = data.slice(0, data.length - 16);
  const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
}
function checkSensitive(text) {
  return SENSITIVE_WORDS.filter((w) => text.includes(w));
}
function markFlagged(pairId, memberId, words) {
  if (!stats.flagged) stats.flagged = [];
  stats.flagged.push({ pairId, memberId, words, ts: Date.now() });
  if (stats.flagged.length > 200) stats.flagged = stats.flagged.slice(-200);
  saveStats();
}

// 向对方推送通知（未启用或订阅失效时静默跳过）
function sendPush(targetMember, title, body) {
  if (!webPush || !VAPID || !targetMember || !targetMember.pushSub) return;
  webPush.sendNotification(targetMember.pushSub, JSON.stringify({ title, body, ts: Date.now() }))
    .then(() => {})
    .catch(() => { targetMember.pushSub = null; });
}

let saveQueued = false;
function save() {
  if (saveQueued) return;
  saveQueued = true;
  setImmediate(() => {
    saveQueued = false;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const tmp = DB_FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(db));
      fs.renameSync(tmp, DB_FILE);
    } catch (e) { console.error('[db] 保存失败:', e.message); }
  });
}

// ---------------- 工具 ----------------
function uid(prefix) { return prefix + '_' + crypto.randomBytes(6).toString('hex'); }
function genCode(len) {
  len = len || 8;
  let s = '';
  for (let i = 0; i < len; i++) s += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return s;
}
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}
function fail(res, code, msg) { json(res, code, { ok: false, error: msg }); }
function ok(res, data) { json(res, 200, { ok: true, data }); }

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_JSON_BODY) { reject(new Error('请求体过大')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch (e) { reject(new Error('JSON 解析失败')); }
    });
    req.on('error', reject);
  });
}

function dataUrlBytes(dataUrl) {
  const comma = String(dataUrl).indexOf(',');
  const b64 = comma >= 0 ? String(dataUrl).slice(comma + 1) : String(dataUrl);
  return Math.ceil(b64.length * 3 / 4);
}
function assertSize(dataUrl, maxBytes) {
  if (dataUrlBytes(dataUrl) > maxBytes) {
    throw new Error('文件过大（上限约 ' + Math.round(maxBytes / 1024 / 1024 * 10) / 10 + 'MB）');
  }
}


// 兼容旧数据：补齐字段（避免老数据缺字段导致前端报错）
function normalizePair(pair) {
  if (!pair.music) pair.music = { tracks: [], nowPlaying: null };
  if (!pair.music.tracks) pair.music.tracks = [];
  if (!Array.isArray(pair.entries)) pair.entries = [];
  if (!Array.isArray(pair.anniversaries)) pair.anniversaries = [];
  if (!pair.theme) pair.theme = 'pink';
  if (!pair.declaration) pair.declaration = '';
  if (!Array.isArray(pair.capsules)) pair.capsules = [];
  if (!pair.chat || !Array.isArray(pair.chat.messages)) pair.chat = { messages: [] };
  if (!pair.disabled) pair.disabled = false;
  for (const m of Object.values(pair.members || {})) { if (!m.missYou) m.missYou = null; if (!m.pushSub) m.pushSub = null; if (!m.chatReadTs) m.chatReadTs = 0; }
  for (const e of pair.entries) {
    if (!Array.isArray(e.comments)) e.comments = [];
    if (!e.tag) e.tag = null;
    if (!e.location) e.location = null;
    if (!e.voice) e.voice = null;
  }
  return pair;
}

// ---------------- SSE 实时推送 ----------------
const clients = new Map(); // pairId -> Set<res>
function subscribe(pairId, res) {
  if (!clients.has(pairId)) clients.set(pairId, new Set());
  clients.get(pairId).add(res);
  res.on('close', () => {
    const s = clients.get(pairId);
    if (s) { s.delete(res); if (!s.size) clients.delete(pairId); }
  });
}
function broadcast(pairId) {
  const pair = db.pairs[pairId];
  if (!pair) return;
  normalizePair(pair);
  const payload = 'data: ' + JSON.stringify(pair) + '\n\n';
  const set = clients.get(pairId);
  if (!set) return;
  for (const res of set) { try { res.write(payload); } catch (e) { /* 忽略 */ } }
}
setInterval(() => {
  for (const set of clients.values()) for (const res of set) { try { res.write(': ping\n\n'); } catch (e) { /* 忽略 */ } }
}, 25000).unref();

// ---------------- 业务逻辑 ----------------
function getPair(pairId) { const pair = db.pairs[pairId]; return pair ? normalizePair(pair) : null; }
function requirePairMember(pairId, memberId) {
  const pair = getPair(pairId);
  if (!pair) return { error: '小屋不存在' };
  if (pair.disabled) return { error: '小屋已被停用，请联系管理员' };
  const member = pair.members[memberId];
  if (!member) return { error: '成员校验失败，请重新配对' };
  pair.lastActive = Date.now();
  markActive(memberId);
  return { pair, member };
}
function newMember(pairId, nickname, role) {
  const memberId = uid('m');
  const member = {
    id: memberId,
    pairId,
    nickname: String(nickname || '').trim().slice(0, 20) || '小可爱',
    role: role === 'girl' ? 'girl' : 'boy',
    avatar: null,
    status: null,     // { type:'app'|'manual', name, packageName, ts }
    todayNote: null,  // { date, text, updatedAt }
    missYou: null,    // { date, count }
    createdAt: Date.now()
  };
  db.pairs[pairId].members[memberId] = member;
  return member;
}
function newPair(nickname, role) {
  const pairId = uid('p');
  const pair = {
    id: pairId,
    code: genCode(),
    createdAt: Date.now(),
    anniversary: todayStr(),
    background: null,
    members: {},
    entries: [],      // { id, memberId, type:'mood'|'food', text, emoji, image, date, createdAt }
    todos: [],        // { id, text, done, createdBy, createdAt, doneAt }
    music: { tracks: [], nowPlaying: null }, // tracks: { id, title, dataUrl, addedBy, addedAt }
    anniversaries: [], // { id, title, date, createdBy, createdAt }
    theme: 'pink',
    declaration: '',
    capsules: []       // { id, title, content, openDate, fromMemberId, createdAt }
  };
  db.pairs[pairId] = pair;
  newMember(pairId, nickname, role);
  return pair;
}

// ---------------- HTTP 服务 ----------------
const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  let pathname;
  try { pathname = new URL(req.url, 'http://localhost').pathname; }
  catch (e) { return fail(res, 400, '无效请求'); }

  // SSE 事件流
  if (pathname.startsWith('/api/events/')) {
    const parts = pathname.split('/');
    const pid = parts[3], mid = parts[4];
    const chk = requirePairMember(pid, mid);
    if (chk.error) return fail(res, 403, chk.error);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write('retry: 3000\n\n');
    res.write('data: ' + JSON.stringify(chk.pair) + '\n\n');
    subscribe(pid, res);
    return;
  }

  if (pathname.startsWith('/api/')) {
    const rip = clientIp(req);
    if (!rateLimit(rip, 'all', 120, 60000)) return fail(res, 429, '请求太频繁，请稍后再试');
    if (req.method === 'POST' && (pathname === '/api/pair/create' || pathname === '/api/restore' || pathname === '/api/admin/login')) {
      if (!rateLimit(rip, 'sensitive', 20, 600000)) return fail(res, 429, '操作太频繁，请稍后再试');
    }
    try {
      const body = req.method === 'POST' ? await readBody(req) : {};
      routeApi(req.method, pathname, body, res);
    } catch (e) {
      fail(res, 400, e.message || '请求无效');
    }
    return;
  }

  if (pathname === '/health') return json(res, 200, { ok: true, name: 'couple-home', ts: Date.now() });
  if (pathname === '/admin') pathname = '/admin.html';

  serveStatic(req, res, pathname);
});

function routeApi(method, p, body, res) {
  const pairId = body.pairId, memberId = body.memberId;

  // ---- 管理员 ----
  if (method === 'POST' && p === '/api/admin/login') {
    if (String(body.password || '') !== ADMIN_PASS) return fail(res, 403, '密码错误');
    const token = 'adm' + crypto.randomBytes(16).toString('hex');
    adminTokens.set(token, Date.now() + 12 * 3600 * 1000);
    return ok(res, { token });
  }
  if (method === 'POST' && p === '/api/admin/stats') {
    if (!adminTokenOk(body.token)) return fail(res, 403, '请先登录');
    const codes = activations.codes.map((x) => ({ code: x.code, used: x.used, usedAt: x.usedAt }));
    const used = activations.codes.filter((x) => x.used).length;
    return ok(res, { total: activations.codes.length, used, remaining: activations.codes.length - used, nextIndex: activations.nextIndex, codes });
  }
  if (method === 'POST' && p === '/api/admin/codes/generate') {
    if (!adminTokenOk(body.token)) return fail(res, 403, '请先登录');
    const count = Math.min(500, Math.max(1, parseInt(body.count, 10) || 1));
    const start = activations.nextIndex;
    const newCodes = genCodes(count, start);
    activations.codes = activations.codes.concat(newCodes);
    activations.nextIndex = start + count;
    saveActivations();
    return ok(res, { codes: newCodes.map((x) => x.code) });
  }
  if (method === 'POST' && p === '/api/admin/codes/export') {
    if (!adminTokenOk(body.token)) return fail(res, 403, '请先登录');
    const text = activations.codes.filter((x) => !x.used).map((x) => x.code).join('\n');
    return ok(res, { text });
  }
  if (method === 'POST' && p === '/api/admin/pairs') {
    if (!adminTokenOk(body.token)) return fail(res, 403, '请先登录');
    const list = Object.values(db.pairs).map((p) => {
      const members = Object.values(p.members || {});
      const creator = members.find((m) => m.role === 'boy') || members[0] || null;
      return {
        id: p.id,
        createdAt: p.createdAt,
        lastActive: p.lastActive || null,
        disabled: !!p.disabled,
        creator: creator ? creator.nickname : null,
        memberCount: members.length,
        members: members.map((m) => ({ nickname: m.nickname, role: m.role })),
        entries: (p.entries || []).length,
        chatMsgs: ((p.chat && p.chat.messages) || []).length,
        usedCode: (activations.codes.find((x) => x.used && x.usedBy === p.id) || {}).code || null
      };
    }).sort((a, b) => (b.createdAt - a.createdAt));
    return ok(res, { pairs: list });
  }
  if (method === 'POST' && p === '/api/admin/pair/set') {
    if (!adminTokenOk(body.token)) return fail(res, 403, '请先登录');
    const pair = db.pairs[body.pairId];
    if (!pair) return fail(res, 404, '小屋不存在');
    pair.disabled = !!body.disabled;
    save();
    broadcast(body.pairId);
    return ok(res, { pairId: body.pairId, disabled: pair.disabled });
  }
  if (method === 'POST' && p === '/api/admin/chat/history') {
    if (!adminTokenOk(body.token)) return fail(res, 403, '请先登录');
    const pair = db.pairs[body.pairId];
    if (!pair) return fail(res, 404, '小屋不存在');
    const messages = ((pair.chat && pair.chat.messages) || []).map((m) => {
      let preview = '';
      if (!m.revoked) {
        try {
          const plain = chatDecrypt(pair.code, m.iv, m.ct);
          preview = m.kind === 'text' ? plain : (m.kind === 'image' ? '[图片]' : (m.kind === 'sticker' ? '[贴纸] ' + plain : '[语音]'));
        } catch (e) { preview = '（无法解密）'; }
      }
      return {
        id: m.id,
        from: (pair.members[m.fromMemberId] || {}).nickname || '?',
        kind: m.kind, ts: m.ts, revoked: !!m.revoked,
        flagged: !!m.flagged, flaggedWords: m.flaggedWords || [],
        preview
      };
    }).reverse();
    return ok(res, { messages });
  }
  if (method === 'POST' && p === '/api/admin/pair/delete') {
    if (!adminTokenOk(body.token)) return fail(res, 403, '请先登录');
    const pair = db.pairs[body.pairId];
    if (!pair) return fail(res, 404, '小屋不存在');
    delete db.pairs[body.pairId];
    save();
    return ok(res, { pairId: body.pairId });
  }
  if (method === 'POST' && p === '/api/admin/flagged') {
    if (!adminTokenOk(body.token)) return fail(res, 403, '请先登录');
    const flagged = (stats.flagged || []).slice().reverse().map((x) => ({
      pairId: x.pairId,
      nickname: (db.pairs[x.pairId] && db.pairs[x.pairId].members[x.memberId]) ? db.pairs[x.pairId].members[x.memberId].nickname : null,
      words: x.words, ts: x.ts
    }));
    return ok(res, { flagged });
  }
  if (method === 'POST' && p === '/api/admin/stats/daily') {
    if (!adminTokenOk(body.token)) return fail(res, 403, '请先登录');
    const days = [];
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const dd = new Date(now.getTime() - i * 86400000);
      const k = dd.getFullYear() + '-' + String(dd.getMonth() + 1).padStart(2, '0') + '-' + String(dd.getDate()).padStart(2, '0');
      const day = stats.daily[k] || { active: [], newPairs: 0 };
      days.push({ date: k, dau: day.active.length, newPairs: day.newPairs });
    }
    const pairCount = Object.keys(db.pairs).length;
    const memberCount = Object.values(db.pairs).reduce((s, p) => s + Object.keys(p.members || {}).length, 0);
    const usedCodes = activations.codes.filter((x) => x.used).length;
    return ok(res, { days, totals: { pairs: pairCount, members: memberCount, codes: activations.codes.length, usedCodes } });
  }

  // ---- 配对 ----
  if (method === 'POST' && p === '/api/pair/create') {
    const act = String(body.activationCode || '').trim().toUpperCase().replace(/\s+/g, '');
    const found = activations.codes.find((x) => x.code === act);
    if (!found) return fail(res, 400, '请输入有效的激活码（付费后你会获得一个）');
    if (found.used) return fail(res, 400, '这个激活码已被使用过了');
    const pair = newPair(body.nickname, 'boy');
    found.used = true; found.usedBy = pair.id; found.usedAt = Date.now();
    saveActivations();
    markNewPair();
    save();
    return ok(res, { pairId: pair.id, memberId: Object.keys(pair.members)[0], code: pair.code, pair });
  }
  if (method === 'POST' && p === '/api/restore') {
    const code = String(body.code || '').trim().toUpperCase();
    const role = body.role === 'girl' ? 'girl' : 'boy';
    const pair = Object.values(db.pairs).find((x) => x.code === code);
    if (!pair) return fail(res, 404, '房间码不存在，检查一下哦');
    if (pair.disabled) return fail(res, 403, '小屋已被停用，请联系管理员');
    const member = Object.values(pair.members).find((m) => m.role === role);
    if (!member) return fail(res, 404, '这个房间还没有' + (role === 'girl' ? '女方' : '男方') + '的身份，请先用邀请码加入');
    return ok(res, { pairId: pair.id, memberId: member.id, nickname: member.nickname });
  }
  if (method === 'POST' && p === '/api/pair/join') {
    const code = String(body.code || '').trim().toUpperCase();
    const pair = Object.values(db.pairs).find((x) => x.code === code && Object.keys(x.members).length < 2);
    if (!pair) return fail(res, 404, '邀请码无效，或小屋已经有两个人啦');
    const member = newMember(pair.id, body.nickname, 'girl');
    save();
    broadcast(pair.id);
    return ok(res, { pairId: pair.id, memberId: member.id, code: pair.code, pair });
  }
  if (method === 'GET' && p.startsWith('/api/pair/')) {
    const parts = p.split('/');
    const chk = requirePairMember(parts[3], parts[4]);
    if (chk.error) return fail(res, 403, chk.error);
    return ok(res, { pair: chk.pair, memberId: parts[4] });
  }
  if (method === 'POST' && p === '/api/sync') {
    const chk = requirePairMember(pairId, memberId);
    if (chk.error) return fail(res, 403, chk.error);
    return ok(res, { pair: chk.pair, memberId });
  }
  if (method === 'POST' && p === '/api/push/vapid-key') {
    return ok(res, { publicKey: VAPID ? VAPID.publicKey : null });
  }

  // ---- 需要成员身份 ----
  const chk = requirePairMember(pairId, memberId);
  if (chk.error) return fail(res, 403, chk.error);
  const { pair, member } = chk;
  const changed = () => { save(); broadcast(pair.id); };

  if (method === 'POST' && p === '/api/profile') {
    if (body.nickname !== undefined) {
      const n = String(body.nickname).trim().slice(0, 20);
      if (n) member.nickname = n;
    }
    if (body.role !== undefined && (body.role === 'boy' || body.role === 'girl')) member.role = body.role;
    if (body.avatar !== undefined) {
      if (body.avatar === null) member.avatar = null;
      else { assertSize(body.avatar, MAX_IMAGE_BYTES); member.avatar = body.avatar; }
    }
    changed();
    return ok(res, { pair, memberId });
  }
  if (method === 'POST' && p === '/api/background') {
    if (member.role !== 'girl') return fail(res, 403, '只有女方可以更换背景哦');
    if (body.image === undefined) return fail(res, 400, '缺少图片');
    if (body.image === null) pair.background = null;
    else { assertSize(body.image, MAX_IMAGE_BYTES); pair.background = body.image; }
    changed();
    return ok(res, { pair, memberId });
  }
  if (method === 'POST' && p === '/api/status') {
    if (body.appName !== undefined || body.packageName !== undefined) {
      member.status = {
        type: 'app',
        name: String(body.appName || '未知应用').slice(0, 40),
        packageName: String(body.packageName || '').slice(0, 120),
        ts: Date.now()
      };
    } else if (body.manualStatus !== undefined) {
      const s = String(body.manualStatus || '').trim();
      member.status = s ? { type: 'manual', name: s.slice(0, 40), ts: Date.now() } : null;
    }
    changed();
    return ok(res, { pair, memberId });
  }
  if (method === 'POST' && p === '/api/note') {
    const date = String(body.date || todayStr());
    const text = String(body.text || '').trim().slice(0, 200);
    if (!text) return fail(res, 400, '便签内容不能为空');
    member.todayNote = { date, text, updatedAt: Date.now() };
    changed();
    return ok(res, { pair, memberId });
  }
  if (method === 'POST' && p === '/api/entry') {
    const type = body.type === 'food' ? 'food' : 'mood';
    const text = String(body.text || '').trim().slice(0, 500);
    const emoji = String(body.emoji || '').slice(0, 8);
    let image = null;
    if (body.image) { assertSize(body.image, MAX_IMAGE_BYTES); image = body.image; }
    let voice = null;
    if (body.voice) {
      if (!String(body.voice).startsWith('data:audio/')) return fail(res, 400, '仅支持音频格式');
      assertSize(body.voice, MAX_VOICE_BYTES);
      voice = body.voice;
    }
    if (!text && !emoji && !image && !voice) return fail(res, 400, '至少填写一点内容哦');
    const tag = String(body.tag || '').trim().slice(0, 10) || null;
    const location = String(body.location || '').trim().slice(0, 30) || null;
    pair.entries.push({
      id: uid('e'), memberId, type, text, emoji, image, voice, comments: [], tag, location,
      date: String(body.date || todayStr()), createdAt: Date.now()
    });
    const partner = Object.values(pair.members).find((m) => m.id !== memberId);
    sendPush(partner, member.nickname + ' 发了新动态 💬', (emoji || '') + (text ? text.slice(0, 40) : ''));
    changed();
    return ok(res, { pair, memberId });
  }
  if (method === 'POST' && p === '/api/entry/delete') {
    const i = pair.entries.findIndex((x) => x.id === body.entryId);
    if (i >= 0) { pair.entries.splice(i, 1); changed(); }
    return ok(res, { pair, memberId });
  }
  if (method === 'POST' && p === '/api/entry/comment') {
    const entry = pair.entries.find((x) => x.id === body.entryId);
    if (!entry) return fail(res, 404, '记录不存在');
    const text = String(body.text || '').trim().slice(0, 500);
    let image = null;
    if (body.image) { assertSize(body.image, MAX_IMAGE_BYTES); image = body.image; }
    if (!text && !image) return fail(res, 400, '评论不能为空');
    entry.comments = entry.comments || [];
    entry.comments.push({ id: uid('c'), memberId, text, image, createdAt: Date.now() });
    changed();
    return ok(res, { pair, memberId });
  }
  if (method === 'POST' && p === '/api/entry/comment/delete') {
    const entry = pair.entries.find((x) => x.id === body.entryId);
    if (!entry) return fail(res, 404, '记录不存在');
    entry.comments = entry.comments || [];
    const i = entry.comments.findIndex((c) => c.id === body.commentId);
    if (i < 0) return fail(res, 404, '评论不存在');
    if (entry.comments[i].memberId !== memberId) return fail(res, 403, '只能删除自己的评论哦');
    entry.comments.splice(i, 1);
    changed();
    return ok(res, { pair, memberId });
  }

  if (method === 'POST' && p === '/api/todo') {
    const text = String(body.text || '').trim().slice(0, 200);
    if (!text) return fail(res, 400, '待办内容不能为空');
    pair.todos.unshift({ id: uid('t'), text, done: false, createdBy: memberId, createdAt: Date.now(), doneAt: null });
    changed();
    return ok(res, { pair, memberId });
  }
  if (method === 'POST' && p === '/api/todo/toggle') {
    const t = pair.todos.find((x) => x.id === body.todoId);
    if (t) {
      t.done = !!body.done; t.doneAt = t.done ? Date.now() : null;
      if (t.done) {
        const partner = Object.values(pair.members).find((m) => m.id !== memberId);
        sendPush(partner, member.nickname + ' 完成了清单 ✓', String(t.text || '').slice(0, 40));
      }
      changed();
    }
    return ok(res, { pair, memberId });
  }
  if (method === 'POST' && p === '/api/todo/delete') {
    const i = pair.todos.findIndex((x) => x.id === body.todoId);
    if (i >= 0) { pair.todos.splice(i, 1); changed(); }
    return ok(res, { pair, memberId });
  }
  if (method === 'POST' && p === '/api/anniversary') {
    const d = String(body.date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return fail(res, 400, '日期格式应为 YYYY-MM-DD');
    pair.anniversary = d;
    changed();
    return ok(res, { pair, memberId });
  }
  if (method === 'POST' && p === '/api/anniversary/add') {
    const title = String(body.title || '').trim().slice(0, 30);
    if (!title) return fail(res, 400, '纪念日名称不能为空');
    const date = String(body.date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail(res, 400, '日期格式应为 YYYY-MM-DD');
    pair.anniversaries.push({ id: uid('an'), title, date, createdBy: memberId, createdAt: Date.now() });
    changed();
    return ok(res, { pair, memberId });
  }
  if (method === 'POST' && p === '/api/anniversary/remove') {
    const annivId = String(body.annivId || '');
    const i = pair.anniversaries.findIndex((a) => a.id === annivId);
    if (i >= 0) { pair.anniversaries.splice(i, 1); changed(); }
    return ok(res, { pair, memberId });
  }
  if (method === 'POST' && p === '/api/tyrant') {
    const text = String(body.text || '').trim().slice(0, 40);
    pair.tyrant = { id: uid('t'), text, fromMemberId: memberId, ts: Date.now() };
    changed();
    return ok(res, { pair, memberId });
  }
  if (method === 'POST' && p === '/api/miss') {
    const today = todayStr();
    const mine = member.missYou || { date: '', count: 0 };
    member.missYou = (mine.date === today) ? { date: today, count: mine.count + 1 } : { date: today, count: 1 };
    const partner = Object.values(pair.members).find((m) => m.id !== memberId);
    sendPush(partner, member.nickname + ' 想你了 💗', '点开看看 TA 的想念');
    changed();
    return ok(res, { pair, memberId });
  }
  if (method === 'POST' && p === '/api/theme') {
    const theme = String(body.theme || '');
    if (!['pink', 'purple', 'mint', 'sun', 'blue'].includes(theme)) return fail(res, 400, '主题不存在');
    pair.theme = theme;
    changed();
    return ok(res, { pair, memberId });
  }
  if (method === 'POST' && p === '/api/declaration') {
    pair.declaration = String(body.text || '').trim().slice(0, 60);
    changed();
    return ok(res, { pair, memberId });
  }
  if (method === 'POST' && p === '/api/capsule/add') {
    const title = String(body.title || '').trim().slice(0, 20);
    const content = String(body.content || '').trim().slice(0, 1000);
    const openDate = String(body.openDate || '');
    if (!title) return fail(res, 400, '给胶囊起个标题吧');
    if (!content) return fail(res, 400, '写点什么封进去吧');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(openDate)) return fail(res, 400, '开启日期格式应为 YYYY-MM-DD');
    pair.capsules.push({ id: uid('c'), title, content, openDate, fromMemberId: memberId, createdAt: Date.now() });
    changed();
    return ok(res, { pair, memberId });
  }
  if (method === 'POST' && p === '/api/capsule/delete') {
    const capsuleId = String(body.capsuleId || '');
    const i = pair.capsules.findIndex((x) => x.id === capsuleId);
    if (i >= 0) { pair.capsules.splice(i, 1); changed(); }
    return ok(res, { pair, memberId });
  }
  if (method === 'POST' && p === '/api/chat/send') {
    const kind = (body.kind === 'image' || body.kind === 'voice' || body.kind === 'sticker') ? body.kind : 'text';
    const iv = String(body.iv || '');
    const ct = String(body.ct || '');
    if (!iv || !ct) return fail(res, 400, '消息内容无效');
    if (!pair.chat) pair.chat = { messages: [] };
    const msg = { id: uid('m'), fromMemberId: memberId, kind, iv, ct, ts: Date.now(), revoked: false };
    if (kind === 'text') {
      try {
        const hit = checkSensitive(chatDecrypt(pair.code, iv, ct));
        if (hit.length) { msg.flagged = true; msg.flaggedWords = hit; markFlagged(pair.id, memberId, hit); }
      } catch (e) { /* 解密失败则跳过检测 */ }
    }
    pair.chat.messages.push(msg);
    if (pair.chat.messages.length > 500) pair.chat.messages = pair.chat.messages.slice(-500);
    const partner = Object.values(pair.members).find((m) => m.id !== memberId);
    sendPush(partner, member.nickname + ' 发来一条消息 💬', kind === 'text' ? '（端到端加密）' : kind === 'image' ? '[图片]' : '[语音]');
    changed();
    return ok(res, { pair, memberId });
  }
  if (method === 'POST' && p === '/api/chat/revoke') {
    const msg = pair.chat.messages.find((m) => m.id === body.messageId);
    if (msg && msg.fromMemberId === memberId) msg.revoked = true;
    changed();
    return ok(res, { pair, memberId });
  }
  if (method === 'POST' && p === '/api/chat/read') {
    member.chatReadTs = Math.max(member.chatReadTs || 0, Number(body.ts) || Date.now());
    save(); // 只落盘不广播，避免已读上报触发本页自循环重渲染
    return ok(res, { pair, memberId });
  }
  if (method === 'POST' && p === '/api/push/subscribe') {
    const sub = body.subscription;
    if (!sub || !sub.endpoint) return fail(res, 400, '订阅信息无效');
    member.pushSub = sub;
    changed();
    return ok(res, { pair, memberId });
  }

  // ---- 音乐 ----
  if (method === 'POST' && p === '/api/music/pick') {
    const source = (body.source === 'upload' || body.source === 'online') ? body.source : 'builtin';
    const trackId = String(body.trackId || '');
    if (!trackId) return fail(res, 400, '缺少曲目');
    if (source === 'upload' && !pair.music.tracks.some((t) => t.id === trackId)) return fail(res, 404, '曲目不存在');
    if (source === 'online' && !/^ol_[A-Za-z0-9_]+$/.test(trackId)) return fail(res, 404, '曲目不存在');
    pair.music.nowPlaying = { trackId, source, chosenBy: memberId, updatedAt: Date.now() };
    changed();
    return ok(res, { pair, memberId });
  }
  if (method === 'POST' && p === '/api/music/add') {
    const title = String(body.title || '我的音乐').trim().slice(0, 60);
    const dataUrl = String(body.dataUrl || '');
    if (!dataUrl.startsWith('data:audio/')) return fail(res, 400, '仅支持音频文件');
    assertSize(dataUrl, MAX_AUDIO_BYTES);
    const track = { id: uid('mu'), title, dataUrl, addedBy: memberId, addedAt: Date.now() };
    pair.music.tracks.push(track);
    if (!pair.music.nowPlaying) {
      pair.music.nowPlaying = { trackId: track.id, source: 'upload', chosenBy: memberId, updatedAt: Date.now() };
    }
    changed();
    return ok(res, { pair, memberId });
  }
  if (method === 'POST' && p === '/api/music/remove') {
    const trackId = String(body.trackId || '');
    const i = pair.music.tracks.findIndex((t) => t.id === trackId);
    if (i >= 0) {
      if (pair.music.nowPlaying && pair.music.nowPlaying.source === 'upload' && pair.music.nowPlaying.trackId === trackId) {
        return fail(res, 400, '这首歌正在播放，先切换到别的歌再删除吧');
      }
      pair.music.tracks.splice(i, 1);
      changed();
    }
    return ok(res, { pair, memberId });
  }

  fail(res, 404, '接口不存在');
}

// ---------------- 静态资源 ----------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8'
};
function serveStatic(req, res, p) {
  let rel;
  try { rel = decodeURIComponent(p); } catch (e) { return fail(res, 400, '无效路径'); }
  if (rel === '/' || rel === '') rel = '/index.html';
  const filePath = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!filePath.startsWith(PUBLIC_DIR)) return fail(res, 403, 'forbidden');
  fs.readFile(filePath, (err, data) => {
    if (err) return fail(res, 404, 'not found');
    const ext = path.extname(filePath).toLowerCase();
    const noCache = rel === '/index.html' || rel === '/sw.js' || rel === '/manifest.webmanifest';
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': noCache ? 'no-cache' : 'public, max-age=3600'
    });
    res.end(data);
  });
}

try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) { /* ignore */ }
server.listen(PORT, HOST, () => {
  console.log('❤ 我们的小屋服务已启动: http://localhost:' + PORT);
  console.log('   数据目录: ' + DATA_DIR);
});


