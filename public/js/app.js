// app.js —— 主控制器：配对 / 实时同步 / 音乐播放 / 计时器 / 彩蛋
import { BUILTIN_TRACKS, MusicEngine } from './music.js';
import { $, $$, esc, toast, todayKey, daysTogether } from './ui.js';
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

// ---------------- 音乐控制器 ----------------
const music = {
  engine: new MusicEngine(),
  audio: null,            // 上传音乐的 <audio>
  current: null,          // {source, trackId}
  isPlaying() {
    if (this.current && this.current.source === 'builtin') return this.engine.isPlaying();
    if (this.current && this.current.source === 'upload') return !!(this.audio && !this.audio.paused && !this.audio.ended);
    return false;
  },
  async start(np) {
    const track = np.source === 'builtin'
      ? BUILTIN_TRACKS.find((t) => t.id === np.trackId)
      : (state.pair.music.tracks.find((t) => t.id === np.trackId) || null);
    if (!track) return;
    this.stopAll();
    this.current = { source: np.source, trackId: np.trackId };
    if (np.source === 'builtin') {
      await this.engine.resume();
      this.engine.play(track);
    } else {
      this.audio = new Audio(track.dataUrl);
      this.audio.loop = true;
      this.audio.volume = 0.8;
      try { await this.audio.play(); } catch (e) { throw e; }
    }
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
  toggle() {
    if (!state.pair || !state.pair.music.nowPlaying) { toast('先去“音乐”页选一首歌吧 🎵'); return; }
    if (this.isPlaying()) { this.stop(); }
    else { this.start(state.pair.music.nowPlaying).catch(() => toast('播放失败，点一下屏幕再试试')); }
  }
};

// 同步到当前选中的歌（对方换歌时自动切换）
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
      if (music.current && music.current.source === 'builtin' && music.engine.ctx && music.engine.ctx.state === 'running') {
        state.interacted = true;
      } else if (music.current && music.current.source === 'upload' && music.audio && !music.audio.paused) {
        state.interacted = true;
      } else {
        showTapHint();
      }
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
    music.engine.resume().then(() => { if (state.pair && state.pair.music.nowPlaying) music.start(state.pair.music.nowPlaying).catch(() => {}); });
    if (music.audio && music.audio.paused) music.audio.play().catch(() => {});
  }, { once: true });
  document.body.appendChild(d);
}

function updateMusicBar() {
  const bar = $('#musicbar');
  const np = state.pair && state.pair.music.nowPlaying;
  if (!np) { bar.classList.add('hidden'); return; }
  bar.classList.remove('hidden');
  const track = np.source === 'builtin'
    ? BUILTIN_TRACKS.find((t) => t.id === np.trackId)
    : (state.pair.music.tracks.find((t) => t.id === np.trackId) || null);
  const chooser = np.chosenBy ? (state.pair.members[np.chosenBy] || {}).nickname : '';
  $('#mb-title').textContent = track ? (track.emoji + ' ' + track.title) : '未知曲目';
  $('#mb-sub').textContent = (chooser ? chooser + ' 点的歌' : '我们的小屋') + (music.isPlaying() ? ' · 播放中' : ' · 已暂停');
  $('#mb-play').textContent = music.isPlaying() ? '❚❚' : '▶';
  bar.classList.toggle('mb-playing', music.isPlaying());
}

// ---------------- 状态应用 ----------------
function apply(pair) {
  state.pair = pair;
  state.me = pair.members[localMemberId()];
  state.partner = Object.values(pair.members).find((m) => m.id !== state.me.id) || null;
  applyBackground();
  updateTimer();
  syncMusic();
  if (!inputFocused()) render(state.view, ctx); else deferRender();
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
      if (np && oldNp && (np.trackId !== oldNp.trackId || np.source !== oldNp.source) && np.chosenBy !== state.me.id) {
        const t = np.source === 'builtin' ? BUILTIN_TRACKS.find((x) => x.id === np.trackId) : pair.music.tracks.find((x) => x.id === np.trackId);
        if (t) toast('TA 点了《' + t.title + '》 🎶');
      }
    });
    // 未交互时尝试自动播放
    if (state.pair.music.nowPlaying) {
      music.start(state.pair.music.nowPlaying).then(() => {
        if (music.engine.ctx && music.engine.ctx.state === 'running') state.interacted = true;
        else if (music.audio && !music.audio.paused) state.interacted = true;
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
}

function bindGlobalGesture() {
  // 首次任意点按 → 解除音频自动播放限制
  const unlock = () => {
    if (!state.interacted) {
      state.interacted = true;
      music.engine.resume();
      if (state.pair && state.pair.music.nowPlaying && !music.isPlaying()) {
        music.start(state.pair.music.nowPlaying).catch(() => {});
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


