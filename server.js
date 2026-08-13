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

// ---------------- 持久化 ----------------
let db = { pairs: {} };
try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { /* 首次运行 */ }
for (const pid of Object.keys(db.pairs || {})) normalizePair(db.pairs[pid]);

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
  for (const m of Object.values(pair.members || {})) { if (!m.missYou) m.missYou = null; }
  for (const e of pair.entries) {
    if (!Array.isArray(e.comments)) e.comments = [];
    if (!e.tag) e.tag = null;
    if (!e.location) e.location = null;
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
  const member = pair.members[memberId];
  if (!member) return { error: '成员校验失败，请重新配对' };
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
    try {
      const body = req.method === 'POST' ? await readBody(req) : {};
      routeApi(req.method, pathname, body, res);
    } catch (e) {
      fail(res, 400, e.message || '请求无效');
    }
    return;
  }

  if (pathname === '/health') return json(res, 200, { ok: true, name: 'couple-home', ts: Date.now() });

  serveStatic(req, res, pathname);
});

function routeApi(method, p, body, res) {
  const pairId = body.pairId, memberId = body.memberId;

  // ---- 配对 ----
  if (method === 'POST' && p === '/api/pair/create') {
    const pair = newPair(body.nickname, 'boy');
    save();
    return ok(res, { pairId: pair.id, memberId: Object.keys(pair.members)[0], code: pair.code, pair });
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
    if (!text && !emoji && !image) return fail(res, 400, '至少填写一点内容哦');
    const tag = String(body.tag || '').trim().slice(0, 10) || null;
    const location = String(body.location || '').trim().slice(0, 30) || null;
    pair.entries.push({
      id: uid('e'), memberId, type, text, emoji, image, comments: [], tag, location,
      date: String(body.date || todayStr()), createdAt: Date.now()
    });
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
    if (t) { t.done = !!body.done; t.doneAt = t.done ? Date.now() : null; changed(); }
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


