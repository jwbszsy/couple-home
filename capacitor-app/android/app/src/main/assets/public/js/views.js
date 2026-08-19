// views.js —— 五个页面的渲染与交互
import { BUILTIN_TRACKS, ONLINE_TRACKS, findOnlineTrack } from './music.js';
import {
  $, $$, esc, toast, todayKey, fmtClock, daysTogether, compressImage,
  readAudioDataUrl, avatarHtml, openModal, confirmModal
} from './ui.js';
import * as api from './api.js';
import { encryptText, decryptText } from './chat-crypto.js';

const MOODS = [
  ['😄', '开心'], ['🥰', '想你'], ['😊', '平静'], ['😋', '吃货'],
  ['🥳', '兴奋'], ['😢', '难过'], ['😣', '累'], ['😠', '生气'],
  ['😴', '困困'], ['🤯', '头大'], ['🤒', '不舒服'], ['🎉', '小确幸']
];

const ROLE_LABEL = { boy: '男朋友', girl: '女朋友' };
const TYRANT_PWD = 'hsn67';

const ENTRY_TAGS = ['约会', '旅行', '日常', '纪念日', '想吃', '其他'];
const THEME_LIST = [
  { key: 'pink', label: '少女粉', color: '#ff8fab' },
  { key: 'purple', label: '梦幻紫', color: '#b388ff' },
  { key: 'mint', label: '薄荷绿', color: '#7fd8c0' },
  { key: 'sun', label: '暖阳橘', color: '#ffb35c' },
  { key: 'blue', label: '静谧蓝', color: '#7ab8ff' }
];

// 时间线筛选状态（标签 / 日期）
let timelineFilter = { tag: '', date: '' };

// 每条动态待发送的评论图片（key=entryId）
let pendingCommentImg = {};

// 记录上一次渲染的页面：只有切换页面时才播放入场动画（避免数据同步导致卡片反复跳动/重叠）
let lastView = null;

export function render(view, ctx) {
  const state = ctx.state;
  if (!state.pair || !state.me) {
    $('#view').innerHTML = '<div class="empty"><span class="empty-emoji">☁️</span>正在同步小屋数据…</div>';
    $$('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
    return;
  }
  const switched = lastView !== view;
  lastView = view;
  const v = $('#view');
  v.classList.toggle('anim-in', switched);
  const html = VIEWS[view] ? VIEWS[view](ctx) : '<div class="empty">页面不存在</div>';
  v.innerHTML = html;
  $$('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  const unread = ((state.pair.chat && state.pair.chat.messages) || []).filter((m) => m.fromMemberId !== state.me.id && !m.revoked && m.ts > (state.me.chatReadTs || 0)).length;
  $$('.nav-btn').forEach((b) => { if (b.dataset.view === 'chat') b.classList.toggle('has-unread', unread > 0); });
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
    (pair.declaration ? '<div class="hero-decl">💌 “' + esc(pair.declaration) + '”</div>' : '') +
    '</div>' +
    '<div class="card"><div class="card-title">✍️ 今天想对' + pn + '说</div>' +
    '<textarea id="note-input" rows="2" maxlength="200" placeholder="写一句最想对 TA 说的话…（自动保存）">' + esc(myNote) + '</textarea>' +
    '<p class="muted small" style="margin-top:6px;">对方打开软件就能看到，实时同步 ✨</p></div>' +
    statusCard +
    noteCard +
    missCardHtml(pair, me, partner, pn) +
    weeklyReportHtml(pair) +
    '<div class="quick-grid">' +
    '<button class="quick-item" id="q-mood"><div class="quick-emoji">😊</div><div class="quick-label">记今日心情</div><div class="quick-desc">文字 + 表情</div></button>' +
    '<button class="quick-item" id="q-food"><div class="quick-emoji">🍜</div><div class="quick-label">记吃了啥</div><div class="quick-desc">文字 / 图片</div></button>' +
    '<button class="quick-item" id="q-status"><div class="quick-emoji">📱</div><div class="quick-label">我在用…</div><div class="quick-desc">手动分享状态</div></button>' +
    '<button class="quick-item" id="q-music"><div class="quick-emoji">🎵</div><div class="quick-label">一起听歌</div><div class="quick-desc">选一首我们都听到</div></button>' +
    '</div>' +
    anniversariesCardHtml(pair);
}

function missCardHtml(pair, me, partner, pn) {
  const today = todayKey();
  const myMiss = me.missYou && me.missYou.date === today ? me.missYou.count : 0;
  const pMiss = partner && partner.missYou && partner.missYou.date === today ? partner.missYou.count : 0;
  return '<div class="card miss-card">' +
    '<div class="card-title">💗 今日互动</div>' +
    streakHtml(pair) +
    '<div class="miss-line">' + (pMiss > 0
      ? '<span class="miss-from">' + esc(partner.nickname) + ' 今天想你了 <b>' + pMiss + '</b> 次</span>'
      : '<span class="miss-from muted">' + pn + ' 今天还没说想我…</span>') + '</div>' +
    '<button class="btn-primary miss-btn" id="miss-btn">' + (myMiss > 0 ? '想你了 💗 ×' + myMiss : '想你了 💗') + '</button>' +
    '<p class="muted small" style="margin-top:8px;">点一下让 TA 知道你在想 TA，每天都能点 ✨</p>' +
    '</div>';
}

function streakHtml(pair) {
  const st = currentStreak(pair);
  if (st.days > 0) {
    return '<div class="miss-streak">🔥 已连续互动 <b>' + st.days + '</b> 天' + (st.todayActive ? '' : '，今天还没互动哦') + '</div>';
  }
  return '<div class="miss-streak muted">🔥 今天还没互动，点下面按钮开启连续天数吧</div>';
}

function dateKey(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// 互动日：当天有动态 / 有待办完成 / 有想你了打卡
function interactDays(pair) {
  const act = new Set();
  for (const e of pair.entries) act.add(e.date);
  for (const t of pair.todos) if (t.done && t.doneAt) act.add(dateKey(new Date(t.doneAt)));
  for (const m of Object.values(pair.members || {})) if (m.missYou && m.missYou.date) act.add(m.missYou.date);
  return act;
}

// 连续互动天数：今天没互动时从昨天开始算（今天算“待定”）
function currentStreak(pair) {
  const act = interactDays(pair);
  const today = dateKey(new Date());
  const todayActive = act.has(today);
  const start = new Date();
  if (!todayActive) start.setDate(start.getDate() - 1);
  let days = 0;
  const d = new Date(start);
  for (let i = 0; i < 10000; i++) {
    if (!act.has(dateKey(d))) break;
    days++;
    d.setDate(d.getDate() - 1);
  }
  return { days, todayActive };
}

// 本周小报：近 7 天
function weeklyReportHtml(pair) {
  const cutoff = Date.now() - 7 * 86400000;
  const es = pair.entries.filter((e) => e.createdAt >= cutoff);
  const photos = es.filter((e) => e.image).length;
  const comments = es.reduce((s, e) => s + (Array.isArray(e.comments) ? e.comments.length : 0), 0);
  const done = pair.todos.filter((t) => t.done && t.doneAt && t.doneAt >= cutoff).length;
  const st = currentStreak(pair);
  const parts = [];
  if (es.length) parts.push(es.length + ' 条动态');
  if (photos) parts.push(photos + ' 张照片');
  if (comments) parts.push(comments + ' 条评论');
  if (done) parts.push('完成 ' + done + ' 件小事');
  if (!parts.length) parts.push('还没有留下记录');
  return '<div class="card weekly-card">' +
    '<div class="card-title">📰 本周小报</div>' +
    '<div class="weekly-line">' + parts.join(' · ') + (st.days ? ' · 🔥 连续 ' + st.days + ' 天' : '') + '</div>' +
    '<p class="muted small" style="margin-top:6px;">下一周也要一起创造回忆呀 ✨</p>' +
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
  $('#miss-btn').onclick = async () => {
    try {
      const d = await api.missYou(pair.id, me.id);
      ctx.apply(d.pair);
      const b = $('#miss-btn');
      b.classList.remove('miss-pop'); void b.offsetWidth; b.classList.add('miss-pop');
      toast('已告诉 TA：想你了 💗');
    } catch (e) { toast(e.message); }
  };
  $('#anv-add').onclick = () => annivAddModal(ctx);
  $$('.anv-del').forEach((b) => {
    b.onclick = async () => {
      try {
        const d = await api.removeAnniversary(pair.id, me.id, b.dataset.anv);
        ctx.apply(d.pair); toast('纪念日已删除');
      } catch (e) { toast(e.message); }
    };
  });
}

function anniversariesCardHtml(pair) {
  const list = Array.isArray(pair.anniversaries) ? pair.anniversaries : [];
  if (!list.length) {
    return '<div class="card"><div class="card-title">🎊 纪念日</div>' +
      '<p class="muted small">记录你们的重要日子，自动倒计时～</p>' +
      '<button class="btn-ghost" id="anv-add" style="width:100%;margin-top:10px;">＋ 添加纪念日</button></div>';
  }
  return '<div class="card"><div class="card-title">🎊 纪念日</div><div class="anv-list">' +
    list.map((a) => {
      const diff = annivDays(a.date);
      const label = diff === null ? '' : diff === 0 ? '🎉 就是今天！' : diff > 0 ? '还有 ' + diff + ' 天' : '已 ' + (-diff) + ' 天';
      return '<div class="anv-row"><div class="anv-info"><div class="anv-title">' + esc(a.title) + '</div>' +
        '<div class="anv-date">' + esc(a.date) + '</div></div>' +
        '<div class="anv-days">' + label + '</div>' +
        '<button class="anv-del" data-anv="' + esc(a.id) + '" title="删除">✕</button></div>';
    }).join('') + '</div>' +
    '<button class="btn-ghost" id="anv-add" style="width:100%;margin-top:10px;">＋ 添加纪念日</button></div>';
}

function annivDays(dateStr) {
  const p = String(dateStr || '').split('-').map(Number);
  if (p.length !== 3 || p.some(isNaN)) return null;
  const d = new Date(p[0], p[1] - 1, p[2], 0, 0, 0);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - t.getTime()) / 86400000);
}

function annivAddModal(ctx) {
  const { pair, me } = ctx.state;
  const m = openModal(
    '<h3>🎊 添加纪念日</h3>' +
    '<div class="field"><label>名称</label><input id="anv-title" maxlength="30" placeholder="例如：认识一周年" /></div>' +
    '<div class="field"><label>日期</label><input type="date" id="anv-date" value="' + todayKey() + '" /></div>' +
    '<div class="modal-actions"><button class="btn-ghost" id="anv-cancel">取消</button><button class="btn-primary" id="anv-ok">保存</button></div>'
  );
  $('#anv-cancel').onclick = () => m.close();
  $('#anv-ok').onclick = async () => {
    const title = $('#anv-title').value.trim();
    const date = $('#anv-date').value;
    if (!title) { toast('给纪念日起个名字吧'); return; }
    if (!date) { toast('请选择日期'); return; }
    try {
      const d = await api.addAnniversary(pair.id, me.id, title, date);
      ctx.apply(d.pair); m.close(); toast('纪念日已添加 🎊');
    } catch (e) { toast(e.message); }
  };
}

// ---------- 时间线 ----------
function timelineHtml(ctx) {
  const { pair, me } = ctx.state;
  let entries = pair.entries.slice().sort((a, b) => b.createdAt - a.createdAt);
  const tagSet = [...new Set(pair.entries.map((e) => e.tag).filter(Boolean))];
  if (timelineFilter.tag) entries = entries.filter((e) => e.tag === timelineFilter.tag);
  if (timelineFilter.date) entries = entries.filter((e) => e.date === timelineFilter.date);

  const filterBar = '<div class="tl-filters">' +
    '<button class="tl-chip' + (timelineFilter.tag === '' ? ' on' : '') + '" data-tag="">全部</button>' +
    tagSet.map((t) => '<button class="tl-chip' + (timelineFilter.tag === t ? ' on' : '') + '" data-tag="' + esc(t) + '">' + esc(t) + '</button>').join('') +
    (timelineFilter.date ? '<button class="tl-chip on" data-clearday="1">📅 ' + esc(timelineFilter.date) + ' ✕</button>' : '') +
    '</div>';

  let body;
  if (!entries.length) {
    body = '<div class="empty"><span class="empty-emoji">' + (pair.entries.length ? '🔍' : '📖') + '</span>' +
      (pair.entries.length ? '没有符合的记录哦<br/>换个标签或清掉日期筛选吧～' : '还没有记录哦<br/>记下今天的心情和好吃的吧～') + '</div>';
  } else {
    const groups = {};
    for (const e of entries) (groups[e.date] = groups[e.date] || []).push(e);
    body = '';
    for (const date of Object.keys(groups).sort().reverse()) {
      body += '<div class="day-group"><div class="day-label">' + esc(dayLabel(date)) + '</div>';
      for (const e of groups[date]) {
        const m = pair.members[e.memberId] || { nickname: '??', role: 'boy' };
        const comments = Array.isArray(e.comments) ? e.comments : [];
        body += '<div class="entry">' +
          avatarHtml(m, 'entry-avatar') +
          '<div class="entry-body">' +
          '<div class="entry-head"><b>' + esc(m.nickname) + '</b>' +
          (e.type === 'mood' ? '<span class="badge badge-b">心情</span>' : '<span class="badge badge-u">干饭</span>') +
          (e.tag ? '<span class="badge badge-o">#' + esc(e.tag) + '</span>' : '') +
          '<span>' + fmtClock(e.createdAt) + '</span>' +
          '<button class="entry-del" data-del="' + e.id + '" title="删除">✕</button>' +
          '</div>' +
          (e.emoji ? '<div class="entry-emoji">' + esc(e.emoji) + '</div>' : '') +
          (e.text ? '<div class="entry-text">' + esc(e.text) + '</div>' : '') +
          (e.location ? '<div class="entry-loc">📍 ' + esc(e.location) + '</div>' : '') +
          (e.image ? '<img class="entry-img viewable-img" data-src="' + e.image + '" src="' + e.image + '" alt="图片" />' : '') +
          (e.voice ? '<audio class="voice-player" controls preload="metadata" src="' + e.voice + '"></audio>' : '') +
          entryCommentsHtml(pair, me, e, comments) +
          '</div></div>';
      }
      body += '</div>';
    }
  }
  return filterBar + heatmapHtml(pair) + body;
}

// GitHub 风格热力图：近 14 周每日互动（动态 / 待办完成 / 想你了）
function heatmapHtml(pair) {
  const counts = {};
  for (const e of pair.entries) counts[e.date] = (counts[e.date] || 0) + 1;
  for (const t of pair.todos) if (t.done && t.doneAt) { const k = dateKey(new Date(t.doneAt)); counts[k] = (counts[k] || 0) + 1; }
  for (const m of Object.values(pair.members || {})) if (m.missYou && m.missYou.date) counts[m.missYou.date] = (counts[m.missYou.date] || 0) + (m.missYou.count || 1);
  const dayMs = 86400000;
  const total = 98;
  let cells = '';
  let active = 0;
  for (let i = total - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * dayMs);
    const key = dateKey(d);
    const n = counts[key] || 0;
    if (n > 0) active++;
    const lvl = n === 0 ? 0 : n >= 5 ? 4 : n >= 3 ? 3 : n >= 2 ? 2 : 1;
    cells += '<button class="hm-cell lv' + lvl + '" data-day="' + key + '" title="' + key + (n ? ' · ' + n + ' 次互动' : '') + '"></button>';
  }
  const st = currentStreak(pair);
  return '<div class="card heatmap-card">' +
    '<div class="card-title">📊 互动热力图 · 近 14 周</div>' +
    '<div class="hm-summary">近 14 周你们有 <b>' + active + '</b> 天留下过互动' + (st.days ? ' · 🔥 连续互动 <b>' + st.days + '</b> 天' : '') + '</div>' +
    '<div class="hm-grid">' + cells + '</div>' +
    '<div class="hm-legend"><span>少</span><i class="hm-cell lv1"></i><i class="hm-cell lv2"></i><i class="hm-cell lv3"></i><i class="hm-cell lv4"></i><span>多</span></div>' +
    '<p class="muted small" style="margin-top:8px;">点某个小格子可只看那一天的记录，再点一下取消。</p>' +
    '</div>';
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

  // 标签 / 日期筛选
  $$('.tl-chip', view).forEach((b) => {
    b.onclick = () => {
      if (b.dataset.clearday) timelineFilter.date = '';
      else if (b.dataset.tag !== undefined) { timelineFilter.tag = b.dataset.tag; timelineFilter.date = ''; }
      ctx.go('timeline');
    };
  });
  $$('.hm-cell', view).forEach((cell) => {
    cell.onclick = () => {
      const day = cell.dataset.day;
      timelineFilter.date = (timelineFilter.date === day) ? '' : day;
      ctx.go('timeline');
    };
  });

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
      fileInp.style.display = 'none';
      document.body.appendChild(fileInp);
      const cleanup = () => { if (fileInp.parentNode) fileInp.parentNode.removeChild(fileInp); };
      fileInp.onchange = async () => {
        const f = fileInp.files && fileInp.files[0];
        if (!f) { cleanup(); return; }
        try {
          const dataUrl = await compressImage(f, 900, 0.82);
          pendingCommentImg[entryId] = dataUrl;
          const chip = document.querySelector('.comment-pending[data-entry="' + entryId + '"]');
          if (chip) chip.classList.remove('hidden');
          toast('已选择评论图片 📷');
        } catch (err) { toast(err.message); }
        cleanup();
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

    '<div class="card"><div class="card-title">📊 恋爱数据</div>' +
    statsHtml(pair) +
    '</div>' +

    '<div class="card">' +
    '<div class="card-title">💑 我们</div>' +
    '<div class="setting-row"><div><div class="setting-label">在一起纪念日</div><div class="setting-desc">从这天开始计算天数</div></div>' +
    '<input type="date" id="set-anniversary" value="' + esc(pair.anniversary) + '" style="width:150px;" /></div>' +
    '<div class="setting-row"><div><div class="setting-label">空间装扮</div><div class="setting-desc">换一个主题色</div></div>' +
    '<div class="theme-dots">' + THEME_LIST.map((t) => '<button class="theme-dot' + (pair.theme === t.key ? ' on' : '') + '" data-theme="' + t.key + '" style="background:' + t.color + ';" title="' + t.label + '"></button>').join('') + '</div></div>' +
    '<div class="setting-row"><div><div class="setting-label">小屋背景</div><div class="setting-desc">' + (isGirl ? '只有你（女方）能改哦' : '仅女方可更换') + '</div></div>' +
    '<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;">' + bgNote + '</div></div>' +
    '<div class="setting-row"><div><div class="setting-label">邀请码</div><div class="setting-desc">对方用这个码加入</div></div>' +
    '<div style="display:flex;gap:6px;align-items:center;"><b style="letter-spacing:2px;">' + esc(pair.code) + '</b>' +
    '<button class="btn-ghost" id="copy-code" style="padding:5px 12px;font-size:12px;">复制</button></div></div>' +
    '<div class="setting-row" style="flex-direction:column;align-items:stretch;"><div><div class="setting-label">我的令牌（换设备找回账号）</div><div class="setting-desc">新设备选「恢复账号」粘贴</div></div>' +
    '<div class="token-box">' + esc(pair.id) + '<br/>' + esc(me.id) + '</div>' +
    '<button class="btn-ghost" id="copy-token" style="width:100%;margin-top:8px;">复制令牌</button></div>' +
    '<div class="setting-row" style="flex-direction:column;align-items:stretch;"><div><div class="setting-label">爱情宣言</div><div class="setting-desc">写一句我们的话（首页展示）</div></div>' +
    '<div style="display:flex;gap:8px;margin-top:8px;"><input id="declaration-input" maxlength="60" placeholder="例如：世界很大，只有我们。" value="' + esc(pair.declaration) + '" /><button class="btn-ghost" id="declaration-save" style="flex:none;">保存</button></div></div>' +
    '</div>' +

    '<div class="card">' +
    '<div class="card-title">💌 时空胶囊</div>' +
    capsulesHtml(pair) +
    '<button class="btn-ghost" id="capsule-add" style="width:100%;margin-top:10px;">＋ 写一封给未来</button></div>' +

    '<div class="card">' +
    '<div class="card-title">⚙️ 设置</div>' +
    '<div class="setting-row"><div><div class="setting-label">数据备份</div><div class="setting-desc">把你们的回忆导出为文件</div></div>' +
    '<button class="btn-ghost" id="export-data" style="padding:6px 12px;font-size:12px;">导出</button></div>' +
    '<div class="setting-row"><div><div class="setting-label">重新配对 / 退出</div><div class="setting-desc">清除本机数据，重新创建或加入</div></div>' +
    '<button class="btn-danger" id="reset-app">退出</button></div>' +
    '</div>' +

    '<div class="dev-credit">由 <span class="dev-name" id="dev-name">杨皓翔 &amp; 韩诗妮</span> 制作<br/><span class="small muted">此处有彩蛋</span></div>';
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

  $$('.theme-dot').forEach((b) => {
    b.onclick = async () => {
      try { const d = await api.setTheme(pair.id, me.id, b.dataset.theme); ctx.apply(d.pair); toast('主题已更换 🎨'); }
      catch (e) { toast(e.message); }
    };
  });
  $('#declaration-save').onclick = async () => {
    const text = $('#declaration-input').value.trim();
    try { const d = await api.setDeclaration(pair.id, me.id, text); ctx.apply(d.pair); toast('宣言已更新 💌'); }
    catch (e) { toast(e.message); }
  };
  $('#capsule-add').onclick = () => capsuleAddModal(ctx);
  $$('.capsule-del').forEach((b) => {
    b.onclick = () => confirmModal('删除这封胶囊？', '删除后双方都看不到了。', async () => {
      try { const d = await api.deleteCapsule(pair.id, me.id, b.dataset.capsule); ctx.apply(d.pair); }
      catch (e) { toast(e.message); }
    }, '删除');
  });
  $('#export-data').onclick = () => {
    const d = new Date();
    const key = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
    const blob = new Blob([JSON.stringify(pair, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'couple-home-backup-' + key + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(a.href);
    toast('已导出备份文件 💾');
  };
  $('#copy-token').onclick = () => {
    const text = pair.id + '\n' + me.id;
    navigator.clipboard.writeText(text).then(() => toast('令牌已复制，去新设备「恢复账号」粘贴吧')).catch(() => toast(text));
  };
  $('#copy-code').onclick = () => {
    navigator.clipboard.writeText(pair.code).then(() => toast('邀请码已复制：' + pair.code)).catch(() => toast(pair.code));
  };
  $('#reset-app').onclick = () => {
    confirmModal('退出当前小屋？', '本机数据将被清除；小屋数据仍保留在服务器上。', () => {
      localStorage.removeItem('couple_token');
      location.reload();
    }, '退出');
  };

  // 彩蛋：连点开发者名字 10 次 → 选择：跳转邦多利 / 输入密码进入 gbcnina 暴君模式
  const dev = $('#dev-name');
  let count = 0, timer = null;
  dev.onclick = () => {
    count++;
    clearTimeout(timer);
    timer = setTimeout(() => { count = 0; }, 2500);
    if (count === 5) toast('嘿嘿，再点五下…');
    if (count >= 10) {
      count = 0;
      eggMenuModal(ctx);
    }
  };
}

// ---------- 数据统计 / 时空胶囊 ----------
function statsHtml(pair) {
  const entries = pair.entries;
  const photos = entries.filter((e) => e.image).length;
  const comments = entries.reduce((s, e) => s + (Array.isArray(e.comments) ? e.comments.length : 0), 0);
  const done = pair.todos.filter((t) => t.done).length;
  const days = daysTogether(pair.anniversary).days;
  return '<div class="stats-grid">' +
    statTile('⏱', days + ' 天', '在一起') +
    statTile('📖', entries.length, '动态') +
    statTile('🖼', photos, '照片') +
    statTile('💬', comments, '评论') +
    statTile('🎊', pair.anniversaries.length, '纪念日') +
    statTile('✅', done, '完成清单') +
    '</div>';
}
function statTile(icon, num, label) {
  return '<div class="stat-tile"><div class="stat-num">' + icon + ' ' + num + '</div><div class="stat-label">' + label + '</div></div>';
}

function capsulesHtml(pair) {
  const list = Array.isArray(pair.capsules) ? pair.capsules : [];
  if (!list.length) return '<p class="muted small">写一封信给未来的 TA，时间到了才能打开 🔒</p>';
  return '<div class="capsule-list">' + list.slice().sort((a, b) => (a.openDate < b.openDate ? -1 : 1)).map((x) => {
    const locked = x.openDate > todayKey();
    const days = annivDays(x.openDate);
    return '<div class="capsule-item' + (locked ? ' locked' : ' open') + '">' +
      '<div class="capsule-head"><span class="capsule-ico">' + (locked ? '🔒' : '💌') + '</span>' +
      '<b>' + esc(x.title) + '</b>' +
      '<span class="capsule-date">' + esc(x.openDate) + (locked ? ' · ' + days + ' 天后开启' : ' · 已开启') + '</span>' +
      '<button class="capsule-del" data-capsule="' + esc(x.id) + '" title="删除">✕</button></div>' +
      (locked
        ? '<div class="capsule-locked muted">一封写给未来的信，还没到开启时间哦</div>'
        : '<div class="capsule-content">' + esc(x.content).replace(/\n/g, '<br/>') + '</div>') +
      '</div>';
  }).join('') + '</div>';
}

function capsuleAddModal(ctx) {
  const { pair, me } = ctx.state;
  const defaultDate = new Date(Date.now() + 365 * 86400000);
  const dstr = defaultDate.getFullYear() + '-' + String(defaultDate.getMonth() + 1).padStart(2, '0') + '-' + String(defaultDate.getDate()).padStart(2, '0');
  const m = openModal(
    '<h3>💌 写给未来</h3>' +
    '<div class="field"><label>标题</label><input id="cap-title" maxlength="20" placeholder="给未来的一封信" /></div>' +
    '<div class="field"><label>内容</label><textarea id="cap-content" rows="4" maxlength="1000" placeholder="想对未来的我们说什么…"></textarea></div>' +
    '<div class="field"><label>开启日期（到这天双方才能看）</label><input type="date" id="cap-date" value="' + dstr + '" /></div>' +
    '<div class="modal-actions"><button class="btn-ghost" id="cap-cancel">取消</button><button class="btn-primary" id="cap-ok">封存 💌</button></div>'
  );
  $('#cap-cancel').onclick = () => m.close();
  $('#cap-ok').onclick = async () => {
    const title = $('#cap-title').value.trim();
    const content = $('#cap-content').value.trim();
    const openDate = $('#cap-date').value;
    if (!title) { toast('给胶囊起个标题吧'); return; }
    if (!content) { toast('写点什么封进去吧'); return; }
    if (!openDate) { toast('选一个开启日期'); return; }
    try {
      const d = await api.addCapsule(pair.id, me.id, title, content, openDate);
      ctx.apply(d.pair); m.close(); toast('已封存，等时间开启 💌');
    } catch (e) { toast(e.message); }
  };
}

// ---------- 彩蛋弹窗 ----------
function eggMenuModal(ctx) {
  const m = openModal(
    '<h3>🥚 彩蛋</h3>' +
    '<p class="muted small" style="margin:0 0 14px;">选一个神秘入口吧～</p>' +
    '<div class="modal-actions" style="flex-direction:column;gap:8px;">' +
    '<button class="btn-primary" id="egg-bang" style="width:100%;">🎸 前往邦多利官网</button>' +
    '<button class="btn-ghost" id="egg-tyrant" style="width:100%;">😈 gbcnina 暴君模式（需密码）</button>' +
    '</div>'
  );
  $('#egg-bang').onclick = () => {
    m.close();
    toast('🎉 前往邦多利…');
    try {
      const w = window.open('https://bang-dream.com/', '_blank');
      if (!w) location.href = 'https://bang-dream.com/';
    } catch (e) {
      location.href = 'https://bang-dream.com/';
    }
  };
  $('#egg-tyrant').onclick = () => { m.close(); tyrantLoginModal(ctx); };
}

function tyrantLoginModal(ctx) {
  const m = openModal(
    '<h3>😈 gbcnina 暴君模式</h3>' +
    '<div class="field"><label>密码</label><input type="password" id="tyrant-pwd" placeholder="输入密码解锁" /></div>' +
    '<p class="muted small">解锁后可以给对方刷满屏像素爱心 + 烟花炸弹哦</p>' +
    '<div class="modal-actions"><button class="btn-ghost" id="tyrant-cancel">取消</button><button class="btn-primary" id="tyrant-ok">解锁</button></div>'
  );
  $('#tyrant-cancel').onclick = () => m.close();
  $('#tyrant-ok').onclick = () => {
    if ($('#tyrant-pwd').value.trim() !== TYRANT_PWD) { toast('密码不对哦 😝'); return; }
    m.close();
    tyrantComposeModal(ctx);
  };
}

function tyrantComposeModal(ctx) {
  const { pair, me } = ctx.state;
  const m = openModal(
    '<h3>💥 向 TA 开炮</h3>' +
    '<div class="field"><label>刷屏文字（可留空，只刷爱心）</label><textarea id="tyrant-text" rows="2" maxlength="40" placeholder="写点狠话…"></textarea></div>' +
    '<p class="muted small">发射后对方屏幕会满屏像素爱心 + 烟花炸弹，TA 要手动点“关闭”才会消失～</p>' +
    '<div class="modal-actions"><button class="btn-ghost" id="tyrant-cancel">取消</button><button class="btn-primary" id="tyrant-fire">发射 💥</button></div>'
  );
  $('#tyrant-cancel').onclick = () => m.close();
  $('#tyrant-fire').onclick = async () => {
    const text = $('#tyrant-text').value.trim();
    try {
      const d = await api.sendTyrant(pair.id, me.id, text);
      ctx.apply(d.pair); m.close(); toast('已发射！等 TA 尖叫吧 😈');
    } catch (e) { toast(e.message); }
  };
}

// ---------- 弹窗 ----------
function tagPickHtml(id) {
  return '<div class="field"><label>标签（可选）</label><div class="tag-pick" id="' + id + '">' +
    ENTRY_TAGS.map((t) => '<button data-tag="' + t + '">' + t + '</button>').join('') +
    '</div></div>';
}

function recordVoice(onReady, onFail) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
    if (onFail) onFail(new Error('当前设备不支持录音，请改用“选择音频文件”'));
    return;
  }
  navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
    const rec = new MediaRecorder(stream);
    const chunks = [];
    const timer = setTimeout(() => { if (rec.state !== 'inactive') rec.stop(); }, 60000);
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      clearTimeout(timer);
      const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
      const reader = new FileReader();
      reader.onload = () => onReady(reader.result);
      reader.readAsDataURL(blob);
    };
    rec.start();
  }).catch((e) => { if (onFail) onFail(e); });
}

function voicePickHtml(id) {
  return '<div class="field"><label>语音留言（可选，≤60 秒）</label>' +
    '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
    '<button type="button" class="btn-ghost" id="' + id + '-rec">🎤 录音</button>' +
    '<button type="button" class="btn-ghost" id="' + id + '-file">📁 选音频文件</button>' +
    '<span class="muted small" id="' + id + '-state"></span></div></div>';
}

function bindVoicePick(root, id, setVoice) {
  const stateEl = $('#' + id + '-state', root);
  const setState = (t) => { stateEl.textContent = t; };
  $('#' + id + '-rec', root).onclick = () => {
    recordVoice((dataUrl) => { setVoice(dataUrl); setState('已录音 ✓ 再点可重录'); },
      (err) => { setState(''); toast(err.message); });
  };
  $('#' + id + '-file', root).onclick = () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'audio/*';
    inp.onchange = async () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      try {
        const r = await readAudioDataUrl(f);
        setVoice(r.dataUrl); setState('已选音频 ✓');
      } catch (e) { toast(e.message); }
    };
    inp.click();
  };
}

function moodModal(ctx) {
  const { pair, me } = ctx.state;
  let sel = '', img = null, tag = '', voice = null;
  const m = openModal(
    '<h3>😊 今日心情</h3>' +
    '<div class="emoji-pick">' + MOODS.map((x) => '<button data-e="' + x[0] + '" title="' + x[1] + '">' + x[0] + '</button>').join('') + '</div>' +
    '<div class="field"><label>想说点什么（可选）</label><textarea id="mood-text" rows="2" maxlength="500" placeholder="今天的心情是…"></textarea></div>' +
    tagPickHtml('mood-tags') +
    '<div class="field"><label>地点（可选）</label><input id="mood-loc" maxlength="30" placeholder="在哪呢？" /></div>' +
    '<div class="field"><label>配图（可选）</label><input type="file" id="mood-file" accept="image/*" /></div>' +
    voicePickHtml('mood-v') +
    '<img class="img-preview" id="mood-prev" alt="预览" />' +
    '<div class="modal-actions"><button class="btn-ghost" id="mood-cancel">取消</button><button class="btn-primary" id="mood-ok">记下来 💗</button></div>'
  );
  $$('.emoji-pick button', m.root).forEach((b) => {
    b.onclick = () => {
      $$('.emoji-pick button', m.root).forEach((x) => x.classList.remove('sel'));
      b.classList.add('sel'); sel = b.dataset.e;
    };
  });
  $$('.tag-pick button', m.root).forEach((b) => {
    b.onclick = () => {
      if (b.classList.contains('on')) { b.classList.remove('on'); tag = ''; return; }
      $$('.tag-pick button', m.root).forEach((x) => x.classList.remove('on'));
      b.classList.add('on'); tag = b.dataset.tag;
    };
  });
  bindVoicePick(m.root, 'mood-v', (d) => { voice = d; });
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
    if (!text && !sel && !img && !voice) { toast('至少填一点哦'); return; }
    try {
      const d = await api.addEntry(pair.id, me.id, { type: 'mood', emoji: sel, text, image: img, voice, tag, location: $('#mood-loc').value.trim() });
      ctx.apply(d.pair); m.close(); toast('心情已记录 😊');
    } catch (e) { toast(e.message); }
  };
}

function foodModal(ctx) {
  const { pair, me } = ctx.state;
  let img = null, emoji = '🍚', tag = '', voice = null;
  const m = openModal(
    '<h3>🍜 今天吃了啥</h3>' +
    '<div class="field"><label>吃了什么（可选）</label><textarea id="food-text" rows="2" maxlength="500" placeholder="比如：超好吃的火锅 🍲"></textarea></div>' +
    tagPickHtml('food-tags') +
    '<div class="field"><label>地点（可选）</label><input id="food-loc" maxlength="30" placeholder="在哪吃的？" /></div>' +
    '<div class="field"><label>照片（可选）</label><input type="file" id="food-file" accept="image/*" /></div>' +
    voicePickHtml('food-v') +
    '<img class="img-preview" id="food-prev" alt="预览" />' +
    '<div class="modal-actions"><button class="btn-ghost" id="food-cancel">取消</button><button class="btn-primary" id="food-ok">记下来 🍽</button></div>'
  );
  $$('.tag-pick button', m.root).forEach((b) => {
    b.onclick = () => {
      if (b.classList.contains('on')) { b.classList.remove('on'); tag = ''; return; }
      $$('.tag-pick button', m.root).forEach((x) => x.classList.remove('on'));
      b.classList.add('on'); tag = b.dataset.tag;
    };
  });
  bindVoicePick(m.root, 'food-v', (d) => { voice = d; });
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
    if (!text && !img && !voice) { toast('至少写点或传张图哦'); return; }
    try {
      const d = await api.addEntry(pair.id, me.id, { type: 'food', emoji, text, image: img, voice, tag, location: $('#food-loc').value.trim() });
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

// ---------- 私密聊天（端到端加密） ----------
function chatHtml(ctx) {
  const { pair, me } = ctx.state;
  const msgs = (pair.chat && pair.chat.messages) || [];
  return '<div class="chat-top">🔒 私密聊天 <span class="muted small">端到端加密 · 仅你们可见</span></div>' +
    '<div class="chat-list" id="chat-list">' + msgs.map((m) => chatMsgHtml(pair, me, m)).join('') + '</div>' +
    '<div class="chat-input-bar">' +
    '<button class="chat-btn" id="chat-img" title="图片">📷</button>' +
    '<button class="chat-btn" id="chat-voice" title="语音">🎤</button>' +
    '<input id="chat-text" maxlength="500" placeholder="说点什么…" autocomplete="off" />' +
    '<button class="chat-send" id="chat-send">发送</button>' +
    '</div>';
}

function chatMsgHtml(pair, me, m) {
  const mine = m.fromMemberId === me.id;
  const from = pair.members[m.fromMemberId] || { nickname: '??' };
  const body = m.revoked
    ? '<div class="chat-revoked">已撤回一条消息</div>'
    : '<div class="chat-cipher" data-cid="' + m.id + '">🔒 加密消息…</div>';
  return '<div class="chat-msg ' + (mine ? 'mine' : 'theirs') + '" data-cid="' + m.id + '">' +
    (mine && !m.revoked ? '<button class="chat-revoke" data-revoke="' + m.id + '" title="撤回">↩</button>' : '') +
    '<div class="chat-bubble">' + body + '</div>' +
    '<div class="chat-meta">' + (mine ? '' : esc(from.nickname) + ' · ') + fmtClock(m.ts) + '</div>' +
    '</div>';
}

let chatInputKeep = '';
async function bindChat(ctx) {
  const { pair, me } = ctx.state;
  const code = pair.code;
  const msgsAll = (pair.chat && pair.chat.messages) || [];
  const unread = msgsAll.filter((m) => m.fromMemberId !== me.id && !m.revoked && m.ts > (me.chatReadTs || 0)).length;
  if (unread > 0) api.chatRead(pair.id, me.id, Date.now()).catch(() => {});
  const msgs = (pair.chat && pair.chat.messages) || [];
  for (const m of msgs) {
    if (m.revoked) continue;
    const el = document.querySelector('.chat-cipher[data-cid="' + m.id + '"]');
    try {
      const plain = await decryptText(code, m.iv, m.ct);
      if (m.kind === 'text') { if (el) el.textContent = plain; }
      else {
        const bubble = document.querySelector('.chat-msg[data-cid="' + m.id + '"] .chat-bubble');
        if (bubble) {
          bubble.innerHTML = m.kind === 'image'
            ? '<img class="chat-img viewable-img" data-src="' + plain + '" src="' + plain + '" alt="图片" />'
            : '<audio class="chat-audio" controls preload="metadata" src="' + plain + '"></audio>';
        }
      }
    } catch (e) { if (el) el.textContent = '⚠️ 无法解密（可能房间码已更换）'; }
  }
  const list = $('#chat-list');
  if (list) list.scrollTop = list.scrollHeight;

  const input = $('#chat-text');
  input.value = chatInputKeep;
  input.addEventListener('input', () => { chatInputKeep = input.value; });
  const doSend = async () => {
    const text = input.value.trim();
    if (!text) return;
    try {
      const { iv, ct } = await encryptText(code, text);
      await api.chatSend(pair.id, me.id, 'text', iv, ct);
      input.value = '';
    } catch (e) { toast(e.message); }
  };
  $('#chat-send').onclick = doSend;
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); } });

  $('#chat-img').onclick = () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = async () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      try {
        const dataUrl = await compressImage(f, 900, 0.82);
        const { iv, ct } = await encryptText(code, dataUrl);
        await api.chatSend(pair.id, me.id, 'image', iv, ct);
      } catch (e) { toast(e.message); }
    };
    inp.click();
  };
  $('#chat-voice').onclick = () => {
    recordVoice(async (dataUrl) => {
      try {
        const { iv, ct } = await encryptText(code, dataUrl);
        await api.chatSend(pair.id, me.id, 'voice', iv, ct);
      } catch (e) { toast(e.message); }
    }, (err) => toast(err.message));
  };
  $$('.chat-revoke', $('#view')).forEach((b) => {
    b.onclick = async () => {
      try { const d = await api.chatRevoke(pair.id, me.id, b.dataset.revoke); ctx.apply(d.pair); }
      catch (e) { toast(e.message); }
    };
  });
}

const VIEWS = { home: homeHtml, timeline: timelineHtml, todo: todoHtml, music: musicHtml, chat: chatHtml, profile: profileHtml };
const BIND = { home: bindHome, timeline: bindTimeline, todo: bindTodo, music: bindMusic, chat: bindChat, profile: bindProfile };
