// api.js —— 与后端交互（REST + SSE 实时推送）
const isNative = typeof window !== 'undefined' && !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const BASE = isNative ? 'https://couple-home-production.up.railway.app' : '';

async function post(path, body) {
  let r;
  try {
    r = await fetch(BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    });
  } catch (e) {
    throw new Error('网络连接失败，请检查服务器');
  }
  let j = null;
  try { j = await r.json(); } catch (e) { /* ignore */ }
  if (!r.ok || !j || !j.ok) throw new Error((j && j.error) || ('请求失败(' + r.status + ')'));
  return j.data;
}

export function createPair(nickname) { return post('/api/pair/create', { nickname }); }
export function joinPair(code, nickname) { return post('/api/pair/join', { code, nickname }); }
export function restoreByCode(code, role) { return post('/api/restore', { code, role }); }
export function syncState(pairId, memberId) { return post('/api/sync', { pairId, memberId }); }
export function updateProfile(pairId, memberId, patch) { return post('/api/profile', Object.assign({ pairId, memberId }, patch)); }
export function setBackground(pairId, memberId, image) { return post('/api/background', { pairId, memberId, image }); }
export function setStatus(pairId, memberId, patch) { return post('/api/status', Object.assign({ pairId, memberId }, patch)); }
export function setNote(pairId, memberId, date, text) { return post('/api/note', { pairId, memberId, date, text }); }
export function addEntry(pairId, memberId, entry) { return post('/api/entry', Object.assign({ pairId, memberId }, entry)); }
export function deleteEntry(pairId, memberId, entryId) { return post('/api/entry/delete', { pairId, memberId, entryId }); }
export function addComment(pairId, memberId, entryId, text, image) { return post('/api/entry/comment', { pairId, memberId, entryId, text, image }); }
export function deleteComment(pairId, memberId, entryId, commentId) { return post('/api/entry/comment/delete', { pairId, memberId, entryId, commentId }); }
export function addTodo(pairId, memberId, text) { return post('/api/todo', { pairId, memberId, text }); }
export function toggleTodo(pairId, memberId, todoId, done) { return post('/api/todo/toggle', { pairId, memberId, todoId, done }); }
export function deleteTodo(pairId, memberId, todoId) { return post('/api/todo/delete', { pairId, memberId, todoId }); }
export function setAnniversary(pairId, memberId, date) { return post('/api/anniversary', { pairId, memberId, date }); }
export function addAnniversary(pairId, memberId, title, date) { return post('/api/anniversary/add', { pairId, memberId, title, date }); }
export function removeAnniversary(pairId, memberId, annivId) { return post('/api/anniversary/remove', { pairId, memberId, annivId }); }
export function sendTyrant(pairId, memberId, text) { return post('/api/tyrant', { pairId, memberId, text }); }
export function missYou(pairId, memberId) { return post('/api/miss', { pairId, memberId }); }
export function setTheme(pairId, memberId, theme) { return post('/api/theme', { pairId, memberId, theme }); }
export function setDeclaration(pairId, memberId, text) { return post('/api/declaration', { pairId, memberId, text }); }
export function addCapsule(pairId, memberId, title, content, openDate) { return post('/api/capsule/add', { pairId, memberId, title, content, openDate }); }
export function deleteCapsule(pairId, memberId, capsuleId) { return post('/api/capsule/delete', { pairId, memberId, capsuleId }); }
export function pickMusic(pairId, memberId, trackId, source) { return post('/api/music/pick', { pairId, memberId, trackId, source }); }
export function addMusic(pairId, memberId, title, dataUrl) { return post('/api/music/add', { pairId, memberId, title, dataUrl }); }
export function removeMusic(pairId, memberId, trackId) { return post('/api/music/remove', { pairId, memberId, trackId }); }

// SSE 实时连接；onState 每次收到完整 pair 数据时触发
export function connectEvents(pairId, memberId, onState) {
  let es = null;
  let retry = 0;
  let closed = false;
  function open() {
    if (closed) return;
    es = new EventSource(BASE + '/api/events/' + encodeURIComponent(pairId) + '/' + encodeURIComponent(memberId));
    es.onmessage = (ev) => {
      retry = 0;
      try { onState(JSON.parse(ev.data)); } catch (e) { /* ignore */ }
    };
    es.onerror = () => {
      if (es) es.close();
      if (!closed) setTimeout(open, Math.min(12000, 1200 * (1 << Math.min(retry++, 6))));
    };
  }
  open();
  return function close() { closed = true; if (es) es.close(); };
}
