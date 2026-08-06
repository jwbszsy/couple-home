// views.js —— 五个页面的渲染与交互
import { BUILTIN_TRACKS, ONLINE_TRACKS, findOnlineTrack } from './music.js';
import {
  $, $$, esc, toast, todayKey, fmtClock, daysTogether, compressImage,
  readAudioDataUrl, avatarHtml, openModal, confirmModal
} from './ui.js';
import * as api from './api.js';

const MOODS = [
  ['😄', '开心'], ['🥰', '想你'], ['😊', '平静'], ['😋', '吃货'],
  ['🥳', '兴奋'], ['😢', '难过'], ['😣', '累'], ['😠', '生气'],
  ['😴', '困困'], ['🤯', '头大'], ['🤒', '不舒服'], ['🎉', '小确幸']
];

const ROLE_LABEL = { boy: '男朋友', girl: '女朋友' };

// 每条动态待发送的评论图片（key=entryId）
let pendingCommentImg = {};

export function render(view, ctx) {
  const state = ctx.state;
  if (!state.pair || !state.me) {
    $('#view').innerHTML = '<div class="empty"><span class="empty-emoji">☁️</span>正在同步小屋数据…</div>';
    $$('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
    return;
  }
  const html = VIEWS[view] ? VIEWS[view](ctx) : '<div class="empty">页面不存在</div>';
  $('#view').innerHTML = html;
  $$('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  if (BIND[view]) BIND[view](ctx);
}

// ---------- 首页 ----------
function homeHtml(ctx) {
  const { pair, me, partner } = ctx.state;
  const pn = partner ? esc(partner.nickname) : '对方';
  const statusCard = partner && partner.status
    ? '<div class="card status-card">' +
      '<div class="status-emoji">' + (partner.status.type === 'app' ? '📱' : '💬') + '</div>' +
      '<div>' +
      '<div class="status-name">' + esc(partner.nickname) + (partner.status.type === 'app' ? ' 正在使用' : ' 说') + '</div>' +
      '<div class="status-detail">' + esc(partner.status.name) + ' · ' + minsAgo(partner.status.ts) + '</div>' +
      '</div></div>'
    : '<div class="card status-card"><div class="status-emoji">🌙</div><div>' +
      '<div class="status-name">' + pn + ' 还没分享状态</div>' +
      '<div class="status-detail">想念你的每一秒</div></div></div>';

  let noteCard;
  if (partner && partner.todayNote && partner.todayNote.date === todayKey()) {
    noteCard = '<div class="card note-card">' +
      '<div class="card-title">💌 ' + esc(partner.nickname) + ' 最想对你说</div>' +
      '<div class="note-quote">“' + esc(partner.todayNote.text) + '”</div>' +
      '<div class="note-from">— ' + esc(partner.nickname) + ' · ' + fmtClock(partner.todayNote.updatedAt) + '</div></div>';
  } else {
    noteCard = '<div class="card note-card"><div class="card-title">💌 今日小情话</div>' +
      '<div class="note-quote muted">' + pn + ' 今天还没给你写便签，去催催 TA～</div></div>';
  }

  const myNote = me.todayNote && me.todayNote.date === todayKey() ? me.todayNote.text : '';

  return '' +
    '<div class="hero">' +
    avatarHtml(me, 'hero-avatar') +
    '<div class="hero-name">' + esc(me.nickname) + ' <span class="tag">' + ROLE_LABEL[me.role] + '</span></div>' +
    '<div class="hero-role">和' + pn + '在一起的第 ' + daysTogether(pair.anniversary).days + ' 天 🍀</div>' +
    '</div>' +
    '<div class="card"><div class="card-title">✍️ 今天想对' + pn + '说</div>' +
    '<textarea id="note-input" rows="2" maxlength="200" placeholder="写一句最想对 TA 说的话…（自动保存）">' + esc(myNote) + '</textarea>' +
    '<p class="muted small" style="margin-top:6px;">对方打开软件就能看到，实时同步 ✨</p></div>' +
    statusCard +
    noteCard +
    '<div class="quick-grid">' +
    '<button class="quick-item" id="q-mood"><div class="quick-emoji">😊</div><div class="quick-label">记今日心情</div><div class="quick-desc">文字 + 表情</div></button>' +
    '<button class="quick-item" id="q-food"><div class="quick-emoji">🍜</div><div class="quick-label">记吃了啥</div><div class="quick-desc">文字 / 图片</div></button>' +
    '<button class="quick-item" id="q-status"><div class="quick-emoji">📱</div><div class="quick-label">我在用…</div><div class="quick-desc">手动分享状态</div></button>' +
    '<button class="quick-item" id="q-music"><div class="quick-emoji">🎵</div><div class="quick-label">一起听歌</div><div class="quick-desc">选一首我们都听到</div></button>' +
    '</div>';
}

function minsAgo(ts) {
  const m = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  if (m < 1) return '刚刚';
  if (m < 60) return m + ' 分钟前';
  const h = Math.floor(m / 60);
  return h + ' 小时前';
}

function bindHome(ctx) {
  const { pair, me } = ctx.state;
  const ta = $('#note-input');
  let timer = null;
  ta.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        const d = await api.setNote(pair.id, me.id, todayKey(), ta.value.trim());
        ctx.apply(d.pair);
        toast('便签已同步 💌');
      } catch (e) { toast(e.message); }
    }, 700);
  });
  $('#q-mood').onclick = () => moodModal(ctx);
  $('#q-food').onclick = () => foodModal(ctx);
  $('#q-status').onclick = () => statusModal(ctx);
  $('#q-music').onclick = () => ctx.go('music');
}

// ---------- 时间线 ----------
function timelineHtml(ctx) {
  const { pair, me } = ctx.state;
  const entries = pair.entries.slice().sort((a, b) => b.createdAt - a.createdAt);
  if (!entries.length) {
    return '<div class="empty"><span class="empty-emoji">📖</span>还没有记录哦<br/>记下今天的心情和好吃的吧～</div>';
  }
  const groups = {};
  for (const e of entries) (groups[e.date] = groups[e.date] || []).push(e);
  let html = '';
  for (const date of Object.keys(groups).sort().reverse()) {
    html += '<div class="day-group"><div class="day-label">' + esc(dayLabel(date)) + '</div>';
    for (const e of groups[date]) {
      const m = pair.members[e.memberId] || { nickname: '??', role: 'boy' };
      const comments = Array.isArray(e.comments) ? e.comments : [];
      html += '<div class="entry">' +
        avatarHtml(m, 'entry-avatar') +
        '<div class="entry-body">' +
        '<div class="entry-head"><b>' + esc(m.nickname) + '</b>' +
        (e.type === 'mood' ? '<span class="badge badge-b">心情</span>' : '<span class="badge badge-u">干饭</span>') +
        '<span>' + fmtClock(e.createdAt) + '</span>' +
        '<button class="entry-del" data-del="' + e.id + '" title="删除">✕</button>' +
        '</div>' +
        (e.emoji ? '<div class="entry-emoji">' + esc(e.emoji) + '</div>' : '') +
        (e.text ? '<div class="entry-text">' + esc(e.text) + '</div>' : '') +
        (e.image ? '<img class="entry-img viewable-img" data-src="' + e.image + '" src="' + e.image + '" alt="图片" />' : '') +
        entryCommentsHtml(pair, me, e, comments) +
        '</div></div>';
    }
    html += '</div>';
  }
  return html;
}

function bindTimeline(ctx) {
  const { pair, me } = ctx.state;
  const view = $('#view');
  $$('.entry-del', view).forEach((btn) => {
    btn.onclick = async () => {
      confirmModal('删除这条记录？', '删除后双方都看不到了哦。', async () => {
        try { const d = await api.deleteEntry(pair.id, me.id, btn.dataset.del); ctx.apply(d.pair); }
        catch (e) { toast(e.message); }
      }, '删除');
    };
  });
  const bar = document.createElement('div');
  bar.className = 'quick-grid';
  bar.style.marginBottom = '14px';
  bar.innerHTML = '<button class="quick-item" id="tl-mood"><div class="quick-emoji">😊</div><div class="quick-label">记心情</div></button>' +
    '<button class="quick-item" id="tl-food"><div class="quick-emoji">🍜</div><div class="quick-label">记吃了啥</div></button>';
  $('#view').prepend(bar);
  $('#tl-mood').onclick = () => moodModal(ctx);
  $('#tl-food').onclick = () => foodModal(ctx);

  // 评论：发送（文字 + 图片）
  $$('.comment-send', view).forEach((btn) => {
    btn.onclick = () => sendComment(ctx, btn.dataset.entry);
  });
  $$('.comment-input', view).forEach((inp) => {
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendComment(ctx, inp.dataset.entry); } });
  });
  // 评论：选图
  $$('.comment-img-btn', view).forEach((btn) => {
    btn.onclick = () => {
      const entryId = btn.dataset.entry;
      const fileInp = document.createElement('input');
      fileInp.type = 'file'; fileInp.accept = 'image/*';
      fileInp.onchange = async () => {
        const f = fileInp.files && fileInp.files[0];
        if (!f) return;
        try {
          const dataUrl = await compressImage(f, 900, 0.82);
          pendingCommentImg[entryId] = dataUrl;
          const chip = document.querySelector('.comment-pending[data-entry="' + entryId + '"]');
          if (chip) chip.classList.remove('hidden');
          toast('已选择评论图片 📷');
        } catch (err) { toast(err.message); }
      };
      fileInp.click();
    };
  });
  // 评论：移除已选图片
  $$('.comment-clear-img', view).forEach((btn) => {
    btn.onclick = () => {
      delete pendingCommentImg[btn.dataset.entry];
      const chip = document.querySelector('.comment-pending[data-entry="' + btn.dataset.entry + '"]');
      if (chip) chip.classList.add('hidden');
    };
  });
  // 评论：删除（仅自己的）
  $$('.comment-del', view).forEach((btn) => {
    btn.onclick = () => {
      confirmModal('删除这条评论？', '删除后双方都看不到了哦。', async () => {
        try {
          const d = await api.deleteComment(pair.id, me.id, btn.dataset.entry, btn.dataset.comment);
          ctx.apply(d.pair);
        } catch (e) { toast(e.message); }
      }, '删除');
    };
  });
  // 图片查看：轻点放大
  $$('.viewable-img', view).forEach((img) => {
    img.onclick = () => {
      const m = openModal('<img class="lightbox-img" src="' + img.dataset.src + '" alt="图片" />');
      m.root.addEventListener('click', (e) => { if (e.target === m.root) m.close(); });
    };
  });
}

async function sendComment(ctx, entryId) {
  const { pair, me } = ctx.state;
  const inp = document.querySelector('.comment-input[data-entry="' + entryId + '"]');
  const text = inp ? inp.value.trim() : '';
  const image = pendingCommentImg[entryId] || null;
  if (!text && !image) { toast('写点什么再发吧～'); return; }
  try {
    const d = await api.addComment(pair.id, me.id, entryId, text, image);
    if (inp) inp.value = '';
    delete pendingCommentImg[entryId];
    ctx.apply(d.pair);
    toast('评论已发送 💬');
  } catch (e) { toast(e.message); }
}


function entryCommentsHtml(pair, me, entry, comments) {
  let h = '<div class="entry-comments">';
  if (comments.length) {
    for (const c of comments) {
      const cm = pair.members[c.memberId] || { nickname: '??', role: 'boy' };
      h += '<div class="comment">' +
        avatarHtml(cm, 'comment-avatar') +
        '<div class="comment-body">' +
        '<div class="comment-head"><b>' + esc(cm.nickname) + '</b><span>' + fmtClock(c.createdAt) + '</span>' +
        (c.memberId === me.id ? '<button class="comment-del" data-entry="' + entry.id + '" data-comment="' + c.id + '" title="删除评论">✕</button>' : '') +
        '</div>' +
        (c.text ? '<div class="comment-text">' + esc(c.text) + '</div>' : '') +
        (c.image ? '<img class="comment-img viewable-img" data-src="' + c.image + '" src="' + c.image + '" alt="评论图片" />' : '') +
        '</div></div>';
    }
  }
  h += '<div class="comment-box">' +
    '<input class="comment-input" data-entry="' + entry.id + '" maxlength="500" placeholder="评论一下 TA 的动态…" />' +
    '<button class="comment-img-btn" data-entry="' + entry.id + '" title="添加图片">📷</button>' +
    '<button class="comment-send" data-entry="' + entry.id + '">发送</button>' +
    '</div>' +
    '<div class="comment-pending hidden" data-entry="' + entry.id + '"><span>已选 1 张图片</span><button class="comment-clear-img" data-entry="' + entry.id + '">✕ 移除</button></div>' +
    '</div>';
  return h;
}

function dayLabel(key) {
  const t = todayKey();
  if (key === t) return '今天';
  const y = new Date(); y.setDate(y.getDate() - 1);
  const yk = y.getFullYear() + '-' + String(y.getMonth() + 1).padStart(2, '0') + '-' + String(y.getDate()).padStart(2, '0');
  if (key === yk) return '昨天';
  return key;
}

// ---------- 清单 ----------
function todoHtml(ctx) {
  const { pair, me } = ctx.state;
  const todos = pair.todos.slice().sort((a, b) => (a.done === b.done ? b.createdAt - a.createdAt : a.done ? 1 : -1));
  const done = pair.todos.filter((t) => t.done).length;
  const pct = pair.todos.length ? Math.round(done / pair.todos.length * 100) : 0;
  let html = '<div class="card">' +
    '<div class="card-title">✅ 我们的清单</div>' +
    '<div class="todo-progress"><div style="width:' + pct + '%"></div></div>' +
    '<p class="muted small">完成 ' + done + ' / ' + pair.todos.length + '</p></div>' +
    '<div class="todo-add"><input id="todo-input" maxlength="200" placeholder="加一件想一起做的事…" />' +
    '<button class="btn-primary" id="todo-add" style="width:auto;padding:0 18px;border-radius:999px;">添加</button></div>';
  if (!pair.todos.length) html += '<div class="empty"><span class="empty-emoji">🛋️</span>还没有待办，一起计划点什么吧～</div>';
  for (const t of todos) {
    const m = pair.members[t.createdBy] || { nickname: '??' };
    html += '<div class="todo-item' + (t.done ? ' done' : '') + '">' +
      '<button class="todo-check" data-id="' + t.id + '">' + (t.done ? '✓' : '') + '</button>' +
      '<div><div class="todo-text">' + esc(t.text) + '</div>' +
      '<div class="todo-meta">' + esc(m.nickname) + ' 添加 · ' + fmtClock(t.createdAt) + '</div></div>' +
      '<button class="todo-del" data-id="' + t.id + '">🗑</button></div>';
  }
  return html;
}

function bindTodo(ctx) {
  const { pair, me } = ctx.state;
  const view = $('#view');
  const input = $('#todo-input');
  const doAdd = async () => {
    const text = input.value.trim();
    if (!text) return;
    try { const d = await api.addTodo(pair.id, me.id, text); ctx.apply(d.pair); toast('已添加 ✅'); }
    catch (e) { toast(e.message); }
  };
  $('#todo-add').onclick = doAdd;
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd(); });
  $$('.todo-check', view).forEach((b) => {
    b.onclick = async () => {
      const t = pair.todos.find((x) => x.id === b.dataset.id);
      if (!t) return;
      try { const d = await api.toggleTodo(pair.id, me.id, b.dataset.id, !t.done); ctx.apply(d.pair); }
      catch (e) { toast(e.message); }
    };
  });
  $$('.todo-del', view).forEach((b) => {
    b.onclick = () => confirmModal('删除这条待办？', '删除后双方都看不到了。', async () => {
      try { const d = await api.deleteTodo(pair.id, me.id, b.dataset.id); ctx.apply(d.pair); }
      catch (e) { toast(e.message); }
    }, '删除');
  });
}

// ---------- 音乐 ----------
function musicHtml(ctx) {
  const { pair, me } = ctx.state;
  const np = pair.music.nowPlaying;
  const cur = np ? resolveTrack(pair, np) : null;
  const chosenBy = np ? (pair.members[np.chosenBy] || { nickname: '对方' }) : null;

  let nowHtml = '<div class="empty"><span class="empty-emoji">🎧</span>还没选歌，选一首两个人的背景乐吧～</div>';
  if (np && cur) {
    nowHtml = '<div class="now-playing">' +
      '<div class="np-emoji">' + esc(cur.emoji || '🎧') + '</div>' +
      '<div><div class="np-title">' + esc(cur.title) + '</div>' +
      '<div class="np-sub">' + esc(cur.desc || '我们上传的音乐') + '</div>' +
      '<div class="np-sub">' + esc(chosenBy ? chosenBy.nickname : '') + ' 点的歌' +
      (np.updatedAt ? ' · ' + fmtClock(np.updatedAt) : '') + '</div></div>' +
      '<div class="np-controls"><button class="btn-ghost" id="np-pause">' + (ctx.music.isPlaying() ? '暂停' : '播放') + '</button></div>' +
      '</div>';
  }

  let builtin = '';
  for (const t of BUILTIN_TRACKS) {
    const active = np && np.source === 'builtin' && np.trackId === t.id;
    builtin += '<div class="track-item' + (active ? ' active' : '') + '" data-pick="' + t.id + '" data-src="builtin">' +
      '<div class="track-emoji">' + t.emoji + '</div>' +
      '<div class="track-info"><div class="track-name">' + esc(t.title) + ' <span class="badge badge-b">内置</span></div>' +
      '<div class="track-desc">' + esc(t.desc) + '</div></div>' +
      (active ? '<span class="badge badge-b">播放中</span>' : '') +
      '</div>';
  }


  let online = '';
  for (const t of ONLINE_TRACKS) {
    const active = np && np.source === 'online' && np.trackId === t.id;
    online += '<div class="track-item' + (active ? ' active' : '') + '" data-pick="' + t.id + '" data-src="online">' +
      '<div class="track-emoji">' + t.emoji + '</div>' +
      '<div class="track-info"><div class="track-name">' + esc(t.title) + ' <span class="badge badge-o">在线</span></div>' +
      '<div class="track-desc">' + esc(t.desc) + '</div></div>' +
      (active ? '<span class="badge badge-o">播放中</span>' : '') +
      '</div>';
  }

  let uploads = '';
  if (!pair.music.tracks.length) {
    uploads = '<div class="muted small" style="padding:4px 2px;">还没有上传音乐。双方都能上传，上传后两人都能听到。</div>';
  }
  for (const t of pair.music.tracks) {
    const active = np && np.source === 'upload' && np.trackId === t.id;
    const adder = pair.members[t.addedBy] || { nickname: '??' };
    uploads += '<div class="track-item' + (active ? ' active' : '') + '" data-pick="' + t.id + '" data-src="upload">' +
      '<div class="track-emoji">🎧</div>' +
      '<div class="track-info"><div class="track-name">' + esc(t.title) + ' <span class="badge badge-u">上传</span></div>' +
      '<div class="track-desc">' + esc(adder.nickname) + ' 上传</div></div>' +
      '<button class="track-del" data-del="' + t.id + '" title="删除">🗑</button>' +
      '</div>';
  }

  return nowHtml +
    '<div class="card"><div class="card-title">🎵 内置音乐（纯合成，无版权）</div>' + builtin + '</div>' +
    '<div class="card"><div class="card-title">🌐 在线音乐库（联网播放）</div>' + online +
    '<p class="muted small" style="padding:2px 2px 0;">在线曲目需要网络，加载快慢取决于网络环境；双方听到的是同一首 🎧</p></div>' +
    '<div class="card"><div class="card-title">📤 我们的音乐</div>' + uploads +
    '<button class="btn-ghost" id="music-upload" style="margin-top:10px;">＋ 上传一首歌</button></div>' +
    '<p class="muted small" style="padding:0 4px;">选好后，双方进入软件都会自动听到这首歌 💕</p>';
}

function resolveTrack(pair, np) {
  if (np.source === 'upload') return pair.music.tracks.find((t) => t.id === np.trackId) || null;
  if (np.source === 'online') return findOnlineTrack(np.trackId);
  return BUILTIN_TRACKS.find((t) => t.id === np.trackId) || null;
}

function bindMusic(ctx) {
  const { pair, me } = ctx.state;
  const view = $('#view');
  const np = pair.music.nowPlaying;
  const npBtn = $('#np-pause');
  if (npBtn) npBtn.onclick = () => ctx.music.toggle();
  $$('.track-item', view).forEach((item) => {
    item.onclick = async (ev) => {
      if (ev.target.closest('.track-del')) return;
      const id = item.dataset.pick, src = item.dataset.src;
      try { const d = await api.pickMusic(pair.id, me.id, id, src); ctx.apply(d.pair); toast('已点歌，TA 那边也会响起 🎶'); }
      catch (e) { toast(e.message); }
    };
  });
  $$('.track-del', view).forEach((b) => {
    b.onclick = () => confirmModal('删除这首音乐？', '删除后双方都听不到了。', async () => {
      try { const d = await api.removeMusic(pair.id, me.id, b.dataset.del); ctx.apply(d.pair); }
      catch (e) { toast(e.message); }
    }, '删除');
  });
  $('#music-upload').onclick = () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'audio/*';
    inp.onchange = async () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      try {
        const { dataUrl, name } = await readAudioDataUrl(f);
        const d = await api.addMusic(pair.id, me.id, name || '我的音乐', dataUrl);
        ctx.apply(d.pair);
        toast('上传成功，已设为播放 🎶');
      } catch (e) { toast(e.message); }
    };
    inp.click();
  };
}

// ---------- 我的 / 设置 ----------
function profileHtml(ctx) {
  const { pair, me, partner } = ctx.state;
  const isGirl = me.role === 'girl';
  const bgNote = isGirl
    ? '<button class="btn-ghost" id="set-bg">🖼 更换背景</button> <button class="btn-ghost" id="clear-bg">恢复默认</button>'
    : '<span class="muted small">🔒 只有女方可以更换背景哦</span>';

  return '' +
    '<div class="card profile-row">' +
    avatarHtml(me, 'profile-avatar') +
    '<div><div style="font-size:17px;font-weight:800;">' + esc(me.nickname) + '</div>' +
    '<div class="muted small">' + ROLE_LABEL[me.role] + ' · 对方：' + esc(partner ? partner.nickname : '还没加入') + '</div>' +
    '<button class="btn-ghost" id="edit-profile" style="margin-top:8px;padding:6px 14px;font-size:12.5px;">编辑昵称 / 头像</button>' +
    '</div></div>' +

    '<div class="card">' +
    '<div class="card-title">💑 我们</div>' +
    '<div class="setting-row"><div><div class="setting-label">在一起纪念日</div><div class="setting-desc">从这天开始计算天数</div></div>' +
    '<input type="date" id="set-anniversary" value="' + esc(pair.anniversary) + '" style="width:150px;" /></div>' +
    '<div class="setting-row"><div><div class="setting-label">小屋背景</div><div class="setting-desc">' + (isGirl ? '只有你（女方）能改哦' : '仅女方可更换') + '</div></div>' +
    '<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;">' + bgNote + '</div></div>' +
    '<div class="setting-row"><div><div class="setting-label">邀请码</div><div class="setting-desc">对方用这个码加入</div></div>' +
    '<div style="display:flex;gap:6px;align-items:center;"><b style="letter-spacing:2px;">' + esc(pair.code) + '</b>' +
    '<button class="btn-ghost" id="copy-code" style="padding:5px 12px;font-size:12px;">复制</button></div></div>' +
    '</div>' +

    '<div class="card">' +
    '<div class="card-title">🤖 安卓实时状态伴侣端</div>' +
    '<p class="muted small" style="line-height:1.8;">在安卓手机上安装“伴侣端”后，填入下面的令牌即可自动分享你正在使用的 App（需要“使用情况访问权限”）。</p>' +
    '<div class="field" style="margin-top:10px;"><label>Pair ID</label><input type="text" readonly value="' + esc(pair.id) + '" id="copy-pair" /></div>' +
    '<div class="field"><label>Member ID（本机）</label><input type="text" readonly value="' + esc(me.id) + '" id="copy-member" /></div>' +
    '<button class="btn-ghost" id="copy-token" style="width:100%;">复制令牌（PairID + MemberID）</button>' +
    '</div>' +

    '<div class="card">' +
    '<div class="card-title">⚙️ 设置</div>' +
    '<div class="setting-row"><div><div class="setting-label">重新配对 / 退出</div><div class="setting-desc">清除本机数据，重新创建或加入</div></div>' +
    '<button class="btn-danger" id="reset-app">退出</button></div>' +
    '</div>' +

    '<div class="dev-credit">由 <span class="dev-name" id="dev-name">杨皓翔 &amp; 韩诗妮</span> 用心制作<br/><span class="small muted">连续点我 5 次有惊喜哦 🎁</span></div>';
}

function bindProfile(ctx) {
  const { pair, me } = ctx.state;
  const isGirl = me.role === 'girl';

  $('#edit-profile').onclick = () => editProfileModal(ctx);

  const av = $('#set-anniversary');
  av.addEventListener('change', async () => {
    try { const d = await api.setAnniversary(pair.id, me.id, av.value); ctx.apply(d.pair); toast('纪念日已更新 💕'); }
    catch (e) { toast(e.message); }
  });

  if (isGirl) {
    $('#set-bg').onclick = () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*';
      inp.onchange = async () => {
        const f = inp.files && inp.files[0];
        if (!f) return;
        try {
          const dataUrl = await compressImage(f, 1400, 0.82);
          const d = await api.setBackground(pair.id, me.id, dataUrl);
          ctx.apply(d.pair); toast('背景已更换 🖼');
        } catch (e) { toast(e.message); }
      };
      inp.click();
    };
    $('#clear-bg').onclick = async () => {
      try { const d = await api.setBackground(pair.id, me.id, null); ctx.apply(d.pair); toast('已恢复默认背景'); }
      catch (e) { toast(e.message); }
    };
  }

  $('#copy-code').onclick = () => {
    navigator.clipboard.writeText(pair.code).then(() => toast('邀请码已复制：' + pair.code)).catch(() => toast(pair.code));
  };
  $('#copy-token').onclick = () => {
    const text = 'pairId=' + pair.id + '\nmemberId=' + me.id;
    navigator.clipboard.writeText(text).then(() => toast('令牌已复制')).catch(() => toast(text));
  };
  $('#reset-app').onclick = () => {
    confirmModal('退出当前小屋？', '本机数据将被清除；小屋数据仍保留在服务器上。', () => {
      localStorage.removeItem('couple_token');
      location.reload();
    }, '退出');
  };

  // 彩蛋：连续点开发者名字 5 次 → 邦多利官网
  const dev = $('#dev-name');
  let count = 0, timer = null;
  dev.onclick = () => {
    count++;
    clearTimeout(timer);
    timer = setTimeout(() => { count = 0; }, 2500);
    if (count === 3) toast('嘿嘿，再点两下…');
    if (count >= 5) {
      count = 0;
      toast('🎉 彩蛋触发！前往邦多利…');
      // 优先开新标签页；若被浏览器/内置浏览器拦截，则直接当前页跳转
      try {
        const w = window.open('https://bang-dream.com/', '_blank');
        if (!w) location.href = 'https://bang-dream.com/';
      } catch (e) {
        location.href = 'https://bang-dream.com/';
      }
    }
  };
}

// ---------- 弹窗 ----------
function moodModal(ctx) {
  const { pair, me } = ctx.state;
  let sel = '', img = null;
  const m = openModal(
    '<h3>😊 今日心情</h3>' +
    '<div class="emoji-pick">' + MOODS.map((x) => '<button data-e="' + x[0] + '" title="' + x[1] + '">' + x[0] + '</button>').join('') + '</div>' +
    '<div class="field"><label>想说点什么（可选）</label><textarea id="mood-text" rows="2" maxlength="500" placeholder="今天的心情是…"></textarea></div>' +
    '<div class="field"><label>配图（可选）</label><input type="file" id="mood-file" accept="image/*" /></div>' +
    '<img class="img-preview" id="mood-prev" alt="预览" />' +
    '<div class="modal-actions"><button class="btn-ghost" id="mood-cancel">取消</button><button class="btn-primary" id="mood-ok">记下来 💗</button></div>'
  );
  $$('.emoji-pick button', m.root).forEach((b) => {
    b.onclick = () => {
      $$('.emoji-pick button', m.root).forEach((x) => x.classList.remove('sel'));
      b.classList.add('sel'); sel = b.dataset.e;
    };
  });
  const prev = $('#mood-prev');
  $('#mood-file').onchange = async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try { img = await compressImage(f, 900, 0.82); prev.src = img; prev.classList.add('show'); }
    catch (err) { toast(err.message); }
  };
  $('#mood-cancel').onclick = m.close;
  $('#mood-ok').onclick = async () => {
    const text = $('#mood-text').value.trim();
    if (!text && !sel && !img) { toast('至少填一点哦'); return; }
    try {
      const d = await api.addEntry(pair.id, me.id, { type: 'mood', emoji: sel, text, image: img });
      ctx.apply(d.pair); m.close(); toast('心情已记录 😊');
    } catch (e) { toast(e.message); }
  };
}

function foodModal(ctx) {
  const { pair, me } = ctx.state;
  let img = null, emoji = '🍚';
  const m = openModal(
    '<h3>🍜 今天吃了啥</h3>' +
    '<div class="field"><label>吃了什么（可选）</label><textarea id="food-text" rows="2" maxlength="500" placeholder="比如：超好吃的火锅 🍲"></textarea></div>' +
    '<div class="field"><label>照片（可选）</label><input type="file" id="food-file" accept="image/*" /></div>' +
    '<img class="img-preview" id="food-prev" alt="预览" />' +
    '<div class="modal-actions"><button class="btn-ghost" id="food-cancel">取消</button><button class="btn-primary" id="food-ok">记下来 🍽</button></div>'
  );
  const prev = $('#food-prev');
  $('#food-file').onchange = async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try { img = await compressImage(f, 900, 0.82); prev.src = img; prev.classList.add('show'); }
    catch (err) { toast(err.message); }
  };
  $('#food-cancel').onclick = m.close;
  $('#food-ok').onclick = async () => {
    const text = $('#food-text').value.trim();
    if (!text && !img) { toast('至少写点或传张图哦'); return; }
    try {
      const d = await api.addEntry(pair.id, me.id, { type: 'food', emoji, text, image: img });
      ctx.apply(d.pair); m.close(); toast('干饭记录 +1 🍜');
    } catch (e) { toast(e.message); }
  };
}

function statusModal(ctx) {
  const { pair, me } = ctx.state;
  const m = openModal(
    '<h3>📱 我正在…</h3>' +
    '<div class="field"><input type="text" id="status-text" maxlength="40" placeholder="比如：听周杰伦 / 刷抖音 / 写作业" /></div>' +
    '<p class="muted small">安卓装了“伴侣端”后会全自动分享，这里是手动版。</p>' +
    '<div class="modal-actions"><button class="btn-ghost" id="st-cancel">取消</button><button class="btn-primary" id="st-ok">分享</button></div>'
  );
  $('#st-cancel').onclick = m.close;
  $('#st-ok').onclick = async () => {
    const v = $('#status-text').value.trim();
    if (!v) { toast('写点什么吧'); return; }
    try { const d = await api.setStatus(pair.id, me.id, { manualStatus: v }); ctx.apply(d.pair); m.close(); toast('状态已同步 📱'); }
    catch (e) { toast(e.message); }
  };
}

function editProfileModal(ctx) {
  const { pair, me } = ctx.state;
  let avatar = null;
  const m = openModal(
    '<h3>✏️ 编辑资料</h3>' +
    '<div class="field"><label>昵称</label><input type="text" id="pf-nickname" maxlength="20" value="' + esc(me.nickname) + '" /></div>' +
    '<div class="field"><label>角色</label><div class="seg">' +
    '<button class="seg-btn' + (me.role === 'boy' ? ' active' : '') + '" data-role="boy">🧑 男朋友</button>' +
    '<button class="seg-btn' + (me.role === 'girl' ? ' active' : '') + '" data-role="girl">👩 女朋友</button></div>' +
    '<p class="muted small">背景只有“女朋友”能换，角色可以在这里调整。</p></div>' +
    '<div class="field"><label>头像</label><input type="file" id="pf-avatar" accept="image/*" /></div>' +
    '<img class="img-preview" id="pf-prev" alt="预览" />' +
    '<div class="modal-actions"><button class="btn-ghost" id="pf-cancel">取消</button><button class="btn-primary" id="pf-save">保存</button></div>'
  );
  let role = me.role;
  $$('.seg-btn', m.root).forEach((b) => {
    b.onclick = () => { $$('.seg-btn', m.root).forEach((x) => x.classList.remove('active')); b.classList.add('active'); role = b.dataset.role; };
  });
  $('#pf-avatar').onchange = async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try { avatar = await compressImage(f, 600, 0.85); $('#pf-prev').src = avatar; $('#pf-prev').classList.add('show'); }
    catch (err) { toast(err.message); }
  };
  $('#pf-cancel').onclick = m.close;
  $('#pf-save').onclick = async () => {
    const nickname = $('#pf-nickname').value.trim();
    try {
      const patch = {};
      if (nickname) patch.nickname = nickname;
      if (role !== me.role) patch.role = role;
      if (avatar) patch.avatar = avatar;
      const d = await api.updateProfile(pair.id, me.id, patch);
      ctx.apply(d.pair); m.close(); toast('已保存 ✨');
    } catch (e) { toast(e.message); }
  };
}

const VIEWS = { home: homeHtml, timeline: timelineHtml, todo: todoHtml, music: musicHtml, profile: profileHtml };
const BIND = { home: bindHome, timeline: bindTimeline, todo: bindTodo, music: bindMusic, profile: bindProfile };
