// app.js —— 主控制器：配对 / 实时同步 / 音乐播放 / 计时器 / 彩蛋
import { BUILTIN_TRACKS, findOnlineTrack, MusicEngine } from './music.js';
import { $, $$, esc, toast, todayKey, daysTogether, openModal } from './ui.js';
import * as api from './api.js';
import { render } from './views.js';

const TOKEN_KEY = 'couple_token';
const URLP = new URLSearchParams(location.search);
const USE_POLL = URLP.get('poll') === '1'; // ?poll=1 → 用轮询代替 SSE（兼容反代/调试）
const EGGSITE = 'https://bang-dream.com/';

const state = {
  pair: null,
  me: null,
  partner: null,
  view: 'home',
  interacted: false
};

// 空间装扮：主题色（CSS 变量覆盖）
const THEMES = {
  pink:   { accent: '#ff8fab', deep: '#fb6f92', soft: '#ffe5ec', bg: '#fff0f3', rose: '#ffb3c6',
            g1: 'rgba(255,143,171,.32)', g2: 'rgba(178,165,255,.30)', g3: 'rgba(255,209,102,.20)', g4: 'rgba(86,209,166,.20)',
            b1: '#ffeaf1', b2: '#fdf3f7', b3: '#f6efff' },
  purple: { accent: '#b388ff', deep: '#9c6bff', soft: '#ede7ff', bg: '#f6f1ff', rose: '#cdb8ff',
            g1: 'rgba(179,136,255,.32)', g2: 'rgba(140,158,255,.30)', g3: 'rgba(255,209,102,.18)', g4: 'rgba(86,209,166,.18)',
            b1: '#f1eaff', b2: '#faf6ff', b3: '#f3efff' },
  mint:   { accent: '#7fd8c0', deep: '#3fb39a', soft: '#e0f7f0', bg: '#f0fbf7', rose: '#a5e3d2',
            g1: 'rgba(127,216,192,.30)', g2: 'rgba(178,165,255,.22)', g3: 'rgba(255,209,102,.18)', g4: 'rgba(86,209,166,.24)',
            b1: '#e9f8f2', b2: '#f4fcf9', b3: '#eefaf6' },
  sun:    { accent: '#ffb35c', deep: '#ff9436', soft: '#fff0dc', bg: '#fff8ee', rose: '#ffc98f',
            g1: 'rgba(255,179,92,.30)', g2: 'rgba(255,143,171,.22)', g3: 'rgba(255,209,102,.22)', g4: 'rgba(86,209,166,.16)',
            b1: '#fff3e3', b2: '#fffaf2', b3: '#fff4e6' },
  blue:   { accent: '#7ab8ff', deep: '#4f9bf5', soft: '#e3f0ff', bg: '#f1f7ff', rose: '#a9d2ff',
            g1: 'rgba(122,184,255,.30)', g2: 'rgba(178,165,255,.24)', g3: 'rgba(255,209,102,.16)', g4: 'rgba(86,209,166,.16)',
            b1: '#e8f3ff', b2: '#f5faff', b3: '#eef6ff' }
};
function applyTheme(theme) {
  const t = THEMES[theme] || THEMES.pink;
  const r = document.documentElement.style;
  r.setProperty('--pink', t.accent);
  r.setProperty('--pink-deep', t.deep);
  r.setProperty('--pink-soft', t.soft);
  r.setProperty('--pink-bg', t.bg);
  r.setProperty('--rose', t.rose);
  r.setProperty('--bg-g1', t.g1);
  r.setProperty('--bg-g2', t.g2);
  r.setProperty('--bg-g3', t.g3);
  r.setProperty('--bg-g4', t.g4);
  r.setProperty('--bg-base1', t.b1);
  r.setProperty('--bg-base2', t.b2);
  r.setProperty('--bg-base3', t.b3);
  document.documentElement.dataset.theme = theme;
}

// 解析曲目对象（内置 / 上传 / 在线）
function resolveMusicTrack(np) {
  if (!np) return null;
  if (np.source === 'builtin') return BUILTIN_TRACKS.find((t) => t.id === np.trackId) || null;
  if (np.source === 'online') return findOnlineTrack(np.trackId);
  return (state.pair && state.pair.music.tracks.find((t) => t.id === np.trackId)) || null;
}

// ---------------- 音乐控制器 ----------------
// 暂停（pause）会保留当前曲目信息：这样对方只是勾个待办、写个便签等无关同步不会把歌又播起来。
const music = {
  engine: new MusicEngine(),
  audio: null,            // 上传 / 在线音乐的 <audio>
  current: null,          // {source, trackId} —— 暂停时也保留
  isPlaying() {
    if (this.current && this.current.source === 'builtin') return this.engine.isPlaying();
    if (this.current && (this.current.source === 'upload' || this.current.source === 'online')) {
      return !!(this.audio && !this.audio.paused && !this.audio.ended);
    }
    return false;
  },
  async start(np) {
    const track = resolveMusicTrack(np);
    if (!track) return;
    this.stopAll();
    this.current = { source: np.source, trackId: np.trackId };
    if (np.source === 'builtin') {
      await this.engine.resume();
      this.engine.play(track);
    } else {
      this.audio = new Audio(track.dataUrl || track.url);
      this.audio.loop = true;
      this.audio.volume = 0.8;
      this.audio.onerror = () => { /* 在线曲目加载失败时静默，靠用户重新点击 */ };
      try { await this.audio.play(); } catch (e) { throw e; }
    }
    updateMusicBar();
  },
  // 用户手动暂停：保留 current，便于恢复，且不会被无关实时同步重启
  pause() {
    if (this.current && this.current.source === 'builtin') this.engine.stop();
    if (this.audio) { try { this.audio.pause(); } catch (e) { /* ignore */ } }
    updateMusicBar();
  },
  stopAll() {
    this.engine.stop();
    if (this.audio) { try { this.audio.pause(); } catch (e) { /* ignore */ } this.audio = null; }
    this.current = null;
  },
  stop() {
    this.stopAll();
    updateMusicBar();
  },
  async toggle() {
    if (!state.pair || !state.pair.music.nowPlaying) { toast('先去“音乐”页选一首歌吧 🎵'); return; }
    const np = state.pair.music.nowPlaying;
    const same = this.current && this.current.source === np.source && this.current.trackId === np.trackId;
    if (this.isPlaying()) { this.pause(); return; }
    if (same && this.current.source === 'builtin') {
      const track = resolveMusicTrack(np);
      await this.engine.resume();
      if (track) this.engine.play(track);
    } else if (same && this.audio) {
      try { await this.audio.play(); } catch (e) { toast('播放失败，点一下屏幕再试试'); }
    } else {
      try { await this.start(np); } catch (e) { toast('播放失败，点一下屏幕再试试'); }
    }
    updateMusicBar();
  }
};

// 同步到当前选中的歌（对方换歌时自动切换；用户手动暂停后不再被无关同步重启）
function syncMusic() {
  const np = state.pair.music.nowPlaying;
  const same = music.current && np && music.current.source === np.source && music.current.trackId === np.trackId;
  if (np && !same && state.interacted) {
    music.start(np).catch(() => { /* 可能被策略拦截，交给手势 */ });
  } else if (!np && music.current) {
    music.stop();
  }
  updateMusicBar();
  if (!np) return;
  if (!state.interacted) {
    // 未交互前尝试自动播放；若被浏览器拦截则显示“点一下”浮层
    music.start(np).then(() => {
      if (music.isPlaying()) state.interacted = true;
      else showTapHint();
    }).catch(() => showTapHint());
  }
}

function showTapHint() {
  if ($('.tap-hint')) return;
  const d = document.createElement('div');
  d.className = 'tap-hint';
  d.innerHTML = '<div class="inner">🎵 点一下，一起听歌</div>';
  d.addEventListener('pointerdown', () => {
    d.remove();
    state.interacted = true;
    if (state.pair && state.pair.music.nowPlaying) music.toggle().catch(() => {});
    else music.engine.resume().catch(() => {});
  }, { once: true });
  document.body.appendChild(d);
}

function updateMusicBar() {
  const bar = $('#musicbar');
  const np = state.pair && state.pair.music.nowPlaying;
  if (!np) { bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');
  const track = resolveMusicTrack(np);
  const chooser = np.chosenBy ? (state.pair.members[np.chosenBy] || {}).nickname : '';
  $('#mb-title').textContent = track ? (track.emoji + ' ' + track.title) : '未知曲目';
  $('#mb-sub').textContent = (chooser ? chooser + ' 点的歌' : '我们的小屋') + (music.isPlaying() ? ' · 播放中' : ' · 已暂停');
  $('#mb-play').textContent = music.isPlaying() ? '❚❚' : '▶';
  bar.classList.toggle('mb-playing', music.isPlaying());
}

// ---------------- 状态应用 ----------------
function apply(pair) {
  state.pair = pair;
  state.me = pair.members[localMemberId()] || null;
  state.partner = Object.values(pair.members).find((m) => m.id !== (state.me && state.me.id)) || null;
  applyTheme(pair.theme);
  applyBackground();
  updateTimer();
  syncMusic();
  maybeShowTyrant(pair);
  if (!inputFocused()) render(state.view, ctx); else deferRender();
}

// ---------------- gbcnina 暴君刷屏（接收端） ----------------
function maybeShowTyrant(pair) {
  const t = pair && pair.tyrant;
  if (!t || !t.id) return;
  if (document.querySelector('.tyrant-overlay')) return;
  if (state.me && t.fromMemberId === state.me.id) return;
  const key = 'couple_tyrant_seen_' + pair.id;
  let seen = [];
  try { seen = JSON.parse(localStorage.getItem(key) || '[]'); } catch (e) { seen = []; }
  if (seen.indexOf(t.id) >= 0) return;
  seen.push(t.id);
  try { localStorage.setItem(key, JSON.stringify(seen)); } catch (e) { /* 忽略 */ }
  showTyrantOverlay(t);
}

const PX_HEART_COLORS = ['#ff4d6d', '#ff6b81', '#ff8fab', '#ff2e63', '#ffb3c6'];
const PX_HEART_ROWS = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];

function pixelHeartUrl(color) {
  let rects = '';
  PX_HEART_ROWS.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] === 'X') rects += '<rect x="' + x + '" y="' + y + '" width="1" height="1"/>';
  });
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 6" shape-rendering="crispEdges"><g fill="' + color + '">' + rects + '</g></svg>';
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

function showTyrantOverlay(t) {
  if (document.querySelector('.tyrant-overlay')) return;
  const ov = document.createElement('div');
  ov.className = 'tyrant-overlay';
  ov.innerHTML =
    '<div class="tyrant-sky" id="tyrant-sky"></div>' +
    (t.text ? '<div class="tyrant-text">' + esc(t.text) + '</div>' : '') +
    '<button class="tyrant-close" id="tyrant-close">关闭 💗</button>';
  document.body.appendChild(ov);

  const sky = $('#tyrant-sky');
  const closeBtn = $('#tyrant-close');
  for (let i = 0; i < 26; i++) {
    const h = document.createElement('span');
    h.className = 'tyrant-heart';
    const size = 18 + Math.random() * 30;
    h.style.width = size + 'px';
    h.style.height = Math.round(size * 0.75) + 'px';
    h.style.backgroundImage = 'url(' + pixelHeartUrl(PX_HEART_COLORS[i % PX_HEART_COLORS.length]) + ')';
    h.style.left = Math.random() * 100 + '%';
    h.style.animationDuration = (4 + Math.random() * 4) + 's';
    h.style.animationDelay = (Math.random() * 6) + 's';
    sky.appendChild(h);
  }

  const timers = [
    setInterval(() => { if (ov.parentNode) spawnFirework(sky); }, 1300),
    setInterval(() => { if (ov.parentNode) spawnBomb(sky); }, 3200)
  ];
  closeBtn.onclick = () => {
    timers.forEach(clearInterval);
    ov.remove();
  };
}

function spawnFirework(sky) {
  const f = document.createElement('div');
  f.className = 'tyrant-firework';
  f.style.left = (10 + Math.random() * 80) + '%';
  f.style.top = (15 + Math.random() * 45) + '%';
  const flash = document.createElement('div');
  flash.className = 'tyrant-flash';
  flash.style.background = 'radial-gradient(circle, ' + PX_HEART_COLORS[Math.floor(Math.random() * PX_HEART_COLORS.length)] + ' 0%, rgba(255,255,255,0) 70%)';
  f.appendChild(flash);
  for (let i = 0; i < 16; i++) {
    const p = document.createElement('span');
    p.className = 'fx-particle';
    const ang = (Math.PI * 2 * i) / 16 + Math.random() * 0.4;
    const dist = 40 + Math.random() * 60;
    p.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
    p.style.setProperty('--dy', Math.sin(ang) * dist + 'px');
    p.style.background = PX_HEART_COLORS[i % PX_HEART_COLORS.length];
    p.style.animationDelay = (Math.random() * 0.15) + 's';
    f.appendChild(p);
  }
  sky.appendChild(f);
  setTimeout(() => f.remove(), 1600);
}

function spawnBomb(sky) {
  const b = document.createElement('div');
  b.className = 'tyrant-bomb';
  b.textContent = '💣';
  b.style.left = (10 + Math.random() * 80) + '%';
  b.style.animationDuration = (1.2 + Math.random() * 0.8) + 's';
  sky.appendChild(b);
  b.addEventListener('animationend', () => {
    const r = b.getBoundingClientRect();
    b.remove();
    spawnBoom(r.left + r.width / 2, r.top + r.height / 2);
  });
}

function spawnBoom(x, y) {
  const boom = document.createElement('div');
  boom.className = 'tyrant-boom';
  boom.style.left = x + 'px';
  boom.style.top = y + 'px';
  const flash = document.createElement('div');
  flash.className = 'tyrant-flash';
  flash.style.background = 'radial-gradient(circle, #ffd166 0%, rgba(255,255,255,0) 70%)';
  boom.appendChild(flash);
  for (let i = 0; i < 20; i++) {
    const p = document.createElement('span');
    p.className = 'fx-particle';
    const ang = (Math.PI * 2 * i) / 20 + Math.random() * 0.5;
    const dist = 50 + Math.random() * 90;
    p.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
    p.style.setProperty('--dy', Math.sin(ang) * dist + 'px');
    p.style.background = PX_HEART_COLORS[i % PX_HEART_COLORS.length];
    p.style.animationDelay = (Math.random() * 0.12) + 's';
    boom.appendChild(p);
  }
  document.body.appendChild(boom);
  setTimeout(() => boom.remove(), 1500);
}

function localMemberId() {
  const t = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null');
  return t ? t.memberId : null;
}

function applyBackground() {
  const bg = $('#bg');
  if (state.pair && state.pair.background) {
    bg.style.backgroundImage = 'url(' + state.pair.background + ')';
    bg.style.backgroundSize = 'cover';
  } else {
    bg.style.backgroundImage = '';
  }
}

let pendingRender = false;
function deferRender() {
  if (pendingRender) return;
  pendingRender = true;
  setTimeout(() => { pendingRender = false; if (!inputFocused()) render(state.view, ctx); }, 900);
}
function inputFocused() {
  const a = document.activeElement;
  return !!(a && /^(INPUT|TEXTAREA)$/.test(a.tagName));
}

function updateTimer() {
  const chip = $('#timer-chip');
  if (!state.pair) return;
  const t = daysTogether(state.pair.anniversary);
  if (t.days > 0) chip.textContent = '💕 在一起 ' + t.days + '天' + t.hours + '时';
  else chip.textContent = '💕 今天开始 ' + t.hours + '时' + t.mins + '分';
}

function timerChipModal() {
  if (!state.pair || !state.me) return;
  const m = openModal(
    '<h3>⏱ 修改在一起纪念日</h3>' +
    '<div class="field"><label>从哪天开始算？</label><input type="date" id="tc-date" value="' + esc(state.pair.anniversary) + '" /></div>' +
    '<p class="muted small">保存后右上角计时器会从新日期重新计算。</p>' +
    '<div class="modal-actions"><button class="btn-ghost" id="tc-cancel">取消</button><button class="btn-primary" id="tc-ok">保存</button></div>'
  );
  $('#tc-cancel').onclick = () => m.close();
  $('#tc-ok').onclick = async () => {
    const d = $('#tc-date').value;
    if (!d) { toast('请选择日期'); return; }
    try {
      const x = await api.setAnniversary(state.pair.id, state.me.id, d);
      ctx.apply(x.pair);
      m.close();
      toast('纪念日已更新 💕');
    } catch (e) { toast(e.message); }
  };
}

// ctx 暴露给 views
const ctx = {
  state,
  music,
  apply,
  go(view) { state.view = view; render(view, ctx); }
};

// ---------------- 配对流程 ----------------
function boot(token) {
  $('#onboard').classList.add('hidden');
  $('#bottom-nav').classList.remove('hidden');
  $('#musicbar').classList.remove('hidden');
  api.syncState(token.pairId, token.memberId).then((d) => {
    apply(d.pair);
    render(state.view, ctx);
    if (USE_POLL) {
      setInterval(() => { api.syncState(token.pairId, token.memberId).then((x) => apply(x.pair)).catch(() => {}); }, 8000);
      return;
    }
    api.connectEvents(token.pairId, token.memberId, (pair) => {
      const oldNp = state.pair && state.pair.music.nowPlaying;
      apply(pair);
      // 换歌提示
      const np = pair.music.nowPlaying;
      if (np && oldNp && (np.trackId !== oldNp.trackId || np.source !== oldNp.source) && np.chosenBy !== (state.me && state.me.id)) {
        const t = resolveMusicTrack(np);
        if (t) toast('TA 点了《' + t.title + '》 🎶');
      }
    });
    // 未交互时尝试自动播放
    if (state.pair.music.nowPlaying) {
      music.start(state.pair.music.nowPlaying).then(() => {
        if (music.isPlaying()) state.interacted = true;
        else showTapHint();
      }).catch(() => showTapHint());
    }
  }).catch((e) => {
    // 令牌失效或服务器不可用 → 回到配对页
    toast(e.message);
    localStorage.removeItem(TOKEN_KEY);
    location.reload();
  });
}

function bindOnboard() {
  const seg = $('#onboard-seg');
  let mode = 'create';
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('.seg-btn');
    if (!b) return;
    mode = b.dataset.mode;
    $$('.seg-btn', seg).forEach((x) => x.classList.toggle('active', x === b));
    $('#join-code-wrap').classList.toggle('hidden', mode !== 'join');
  });
  $('#onboard-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nickname = $('#join-nickname').value.trim();
    const code = $('#join-code').value.trim().toUpperCase();
    const err = $('#onboard-err');
    err.classList.add('hidden');
    if (!nickname) { err.textContent = '先告诉我怎么称呼你～'; err.classList.remove('hidden'); return; }
    const btn = $('#onboard-submit');
    btn.disabled = true; btn.textContent = '等一下下…';
    try {
      const d = mode === 'create' ? await api.createPair(nickname) : await api.joinPair(code, nickname);
      localStorage.setItem(TOKEN_KEY, JSON.stringify({ pairId: d.pairId, memberId: d.memberId }));
      if (mode === 'join') toast('欢迎加入小屋 🎉');
      boot({ pairId: d.pairId, memberId: d.memberId });
    } catch (ex) {
      err.textContent = ex.message; err.classList.remove('hidden');
    } finally {
      btn.disabled = false; btn.textContent = '开始 💗';
    }
  });
}

// ---------------- 导航 / 全局事件 ----------------
function bindNav() {
  $('#bottom-nav').addEventListener('click', (e) => {
    const b = e.target.closest('.nav-btn');
    if (!b) return;
    ctx.go(b.dataset.view);
    try { history.replaceState(null, '', '#' + b.dataset.view); } catch (e) { /* ignore */ }
  });
  $('#mb-play').onclick = () => music.toggle();
  $('#mb-open').onclick = () => ctx.go('music');
  $('#timer-chip').onclick = () => timerChipModal();
}

function bindGlobalGesture() {
  // 首次任意点按 → 解除音频自动播放限制
  const unlock = () => {
    if (!state.interacted) {
      state.interacted = true;
      music.engine.resume();
      if (state.pair && state.pair.music.nowPlaying && !music.isPlaying()) {
        music.toggle().catch(() => {});
      }
    }
  };
  document.addEventListener('pointerdown', unlock);
  document.addEventListener('keydown', unlock);
}

// ---------------- 启动 ----------------
function init() {
  bindOnboard();
  bindNav();
  bindGlobalGesture();
  setInterval(updateTimer, 1000);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* 忽略 */ });
  }

  const token = JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null');
  if (token && token.pairId && token.memberId) {
    const h = location.hash.replace('#', '');
    if (['home', 'timeline', 'todo', 'music', 'profile'].indexOf(h) >= 0) state.view = h;
    boot(token);
  } else {
    $('#onboard').classList.remove('hidden');
  }
}

init();
