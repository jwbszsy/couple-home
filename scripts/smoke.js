// smoke.js —— 端到端接口测试（node scripts/smoke.js）
const BASE = process.env.BASE || 'http://localhost:3000';
let passed = 0, failed = 0;
function check(name, cond) { if (cond) { passed++; console.log('  ok  ' + name); } else { failed++; console.log('  FAIL ' + name); } }
async function post(path, body) {
  const r = await fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  return r.json();
}

(async () => {
  const idx = await fetch(BASE + '/').then((r) => r.text()).catch(() => '');
  check('静态首页可访问且含标题', idx.includes('我们的小屋'));
  const fs = require('fs');
  const crypto = require('crypto');
  const chatKey = (code) => crypto.pbkdf2Sync(String(code || ''), Buffer.from('couple-chat-v1'), 100000, 32, 'sha256');
  function chatEncrypt(code, text) {
    const key = chatKey(code);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ct = Buffer.concat([cipher.update(text, 'utf8'), cipher.final(), cipher.getAuthTag()]);
    return { iv: iv.toString('base64'), ct: ct.toString('base64') };
  }
  function takeCode() {
    const a = JSON.parse(fs.readFileSync('data/activations.json', 'utf8'));
    const x = a.codes.find((v) => !v.used);
    if (!x) throw new Error('没有可用激活码');
    return x.code;
  }
  const okCode = takeCode();

  const noAct = await post('/api/pair/create', { nickname: '无码' });
  check('创建无激活码被拒', !noAct.ok);
  const badAct = await post('/api/pair/create', { nickname: '错码', activationCode: 'XXXX-XXXX' });
  check('错误激活码被拒', !badAct.ok);

  const c = await post('/api/pair/create', { nickname: '杨皓翔', activationCode: okCode });
  check('创建小屋返回邀请码', !!(c.ok && c.data.code && c.data.pairId && c.data.memberId));
  const { pairId, memberId: boyId, code } = c.data;

  const j = await post('/api/pair/join', { code, nickname: '韩诗妮' });
  check('加入小屋（第二人）', !!(j.ok && j.data.memberId && j.data.memberId !== boyId));
  const girlId = j.data.memberId;

  const j2 = await post('/api/pair/join', { code, nickname: '第三人' });
  check('第三人被拒绝', !j2.ok);

  const al = await post('/api/admin/login', { password: 'admin888' });
  check('管理后台登录', al.ok && !!al.data.token);
  const aToken = al.data.token;
  const adStats = await post('/api/admin/stats', { token: aToken });
  check('后台统计', adStats.ok && adStats.data.total >= 200 && adStats.data.used >= 1);
  const exp = await post('/api/admin/codes/export', { token: aToken });
  check('导出未用码', exp.ok && exp.data.text.split('\n').length > 0);
  const gen = await post('/api/admin/codes/generate', { token: aToken, count: 5 });
  check('补充码', gen.ok && gen.data.codes.length === 5);
  const adStats2 = await post('/api/admin/stats', { token: aToken });
  check('补充后总数增加', adStats2.ok && adStats2.data.total === adStats.data.total + 5);
  const badLogin = await post('/api/admin/login', { password: 'wrong' });
  check('错误管理密码被拒', !badLogin.ok);

  const ps = await post('/api/push/subscribe', { pairId, memberId: boyId, subscription: { endpoint: 'https://fcm.example/x', keys: { p256dh: 'a', auth: 'b' } } });
  check('推送订阅保存', ps.ok && ps.data.pair.members[boyId].pushSub && ps.data.pair.members[boyId].pushSub.endpoint === 'https://fcm.example/x');

  const cs = await post('/api/chat/send', { pairId, memberId: boyId, kind: 'text', iv: 'aGVsbG8=', ct: 'd29ybGQ=' });
  check('发送加密消息', cs.ok && cs.data.pair.chat.messages.length === 1);
  const cid = cs.data.pair.chat.messages[0].id;
  const cs2 = await post('/api/chat/send', { pairId, memberId: girlId, kind: 'text', iv: 'aA==', ct: 'Yg==' });
  const cid2 = cs2.data.pair.chat.messages[1].id;
  const crO = await post('/api/chat/revoke', { pairId, memberId: boyId, messageId: cid2 });
  check('不能撤回对方消息', crO.ok && crO.data.pair.chat.messages[1].revoked === false);
  const crM = await post('/api/chat/revoke', { pairId, memberId: girlId, messageId: cid2 });
  check('撤回自己的消息', crM.ok && crM.data.pair.chat.messages[1].revoked === true);
  const crd = await post('/api/chat/read', { pairId, memberId: girlId, ts: Date.now() });
  check('标记已读', crd.ok && crd.data.pair.members[girlId].chatReadTs > 0);
  const dd = await post('/api/admin/stats/daily', { token: aToken });
  check('后台每日统计', dd.ok && dd.data.days.length === 30 && dd.data.totals.pairs > 0 && dd.data.totals.members > 0);

  // 真实加密消息 → 后台可解密监看
  const enc = chatEncrypt(code, 'hello audit secret');
  const ce = await post('/api/chat/send', { pairId, memberId: boyId, kind: 'text', iv: enc.iv, ct: enc.ct });
  check('发送真实加密消息', ce.ok);
  const ch = await post('/api/admin/chat/history', { token: aToken, pairId });
  check('后台解密聊天记录', ch.ok && ch.data.messages.length > 0 && ch.data.messages[0].preview === 'hello audit secret', ch.ok ? ch.data.messages[0].preview : '');
  const badEnc = chatEncrypt(code, '帮你搞个赌博网站');
  const cb = await post('/api/chat/send', { pairId, memberId: girlId, kind: 'text', iv: badEnc.iv, ct: badEnc.ct });
  check('违规消息被标记', cb.ok && cb.data.pair.chat.messages.some((m) => m.flagged && m.flaggedWords.includes('赌博')));
  const fl = await post('/api/admin/flagged', { token: aToken });
  check('后台违规记录', fl.ok && fl.data.flagged.length > 0);

  const ap = await post('/api/admin/pairs', { token: aToken });
  check('后台小屋列表', ap.ok && ap.data.pairs.length > 0 && ap.data.pairs.some((x) => x.id === pairId));
  const dis = await post('/api/admin/pair/set', { token: aToken, pairId, disabled: true });
  check('停用小屋', dis.ok && dis.data.disabled === true);
  const afterDis = await post('/api/sync', { pairId, memberId: boyId });
  check('停用后访问被拒', !afterDis.ok);
  const en = await post('/api/admin/pair/set', { token: aToken, pairId, disabled: false });
  check('启用小屋', en.ok && en.data.disabled === false);
  const afterEn = await post('/api/sync', { pairId, memberId: boyId });
  check('启用后恢复访问', afterEn.ok);

  const rsB = await post('/api/restore', { code, role: 'boy' });
  check('房间码+男方恢复', rsB.ok && rsB.data.pairId === pairId && rsB.data.memberId === boyId);
  const rsG = await post('/api/restore', { code, role: 'girl' });
  check('房间码+女方恢复', rsG.ok && rsG.data.memberId === girlId);
  const rsBad = await post('/api/restore', { code: 'ZZZZZZZZ', role: 'boy' });
  check('错误房间码恢复被拒', !rsBad.ok);

  const p1 = await post('/api/profile', { pairId, memberId: boyId, nickname: '杨皓翔', role: 'boy' });
  check('更新资料', p1.ok && p1.data.pair.members[boyId].nickname === '杨皓翔');

  const bgBoy = await post('/api/background', { pairId, memberId: boyId, image: 'data:image/jpeg;base64,AAAA' });
  check('男方改背景被拒绝', !bgBoy.ok);
  const bgGirl = await post('/api/background', { pairId, memberId: girlId, image: 'data:image/jpeg;base64,AAAA' });
  check('女方改背景成功', bgGirl.ok && bgGirl.data.pair.background !== null);

  const st = await post('/api/status', { pairId, memberId: boyId, appName: '微信', packageName: 'com.tencent.mm' });
  check('实时状态同步', st.ok && st.data.pair.members[boyId].status.name === '微信');

  const nt = await post('/api/note', { pairId, memberId: boyId, date: '2026-08-05', text: '今天好想你' });
  check('每日便签', nt.ok && nt.data.pair.members[boyId].todayNote.text === '今天好想你');

  const em = await post('/api/entry', { pairId, memberId: boyId, type: 'mood', emoji: '😄', text: '开心的一天' });
  check('心情记录', em.ok && em.data.pair.entries.length === 1);
  const ef = await post('/api/entry', { pairId, memberId: girlId, type: 'food', text: '火锅', emoji: '🍲' });
  check('干饭记录', ef.ok && ef.data.pair.entries.length === 2);


  // ---- 时间线评论 ----
  const entryId = ef.data.pair.entries[1].id;
  const cm = await post('/api/entry/comment', { pairId, memberId: girlId, entryId, text: '看起来好好吃！', image: 'data:image/jpeg;base64,AAAA' });
  check('评论动态（文字+图片）', cm.ok && cm.data.pair.entries[1].comments.length === 1);
  const commentId = cm.data.pair.entries[1].comments[0].id;
  const cmBad = await post('/api/entry/comment/delete', { pairId, memberId: boyId, entryId, commentId });
  check('不能删除他人评论', !cmBad.ok);
  const cmDel = await post('/api/entry/comment/delete', { pairId, memberId: girlId, entryId, commentId });
  check('删除自己的评论', cmDel.ok && cmDel.data.pair.entries[1].comments.length === 0);
  const cmEmpty = await post('/api/entry/comment', { pairId, memberId: girlId, entryId, text: '' });
  check('空评论被拒绝', !cmEmpty.ok);

  // ---- 在线音乐 ----
  const mo = await post('/api/music/pick', { pairId, memberId: girlId, trackId: 'ol_song1', source: 'online' });
  check('在线音乐点歌', mo.ok && mo.data.pair.music.nowPlaying.source === 'online' && mo.data.pair.music.nowPlaying.trackId === 'ol_song1');

  // ---- 头像上传 ----
  const avp = await post('/api/profile', { pairId, memberId: boyId, avatar: 'data:image/jpeg;base64,AAAA' });
  check('头像上传', avp.ok && avp.data.pair.members[boyId].avatar !== null);

  const td = await post('/api/todo', { pairId, memberId: girlId, text: '一起看电影' });
  const todoId = td.data.pair.todos[0].id;
  check('添加待办', td.ok);
  const tg = await post('/api/todo/toggle', { pairId, memberId: boyId, todoId, done: true });
  check('勾选待办', tg.ok && tg.data.pair.todos[0].done === true);

  const av = await post('/api/anniversary', { pairId, memberId: girlId, date: '2023-02-14' });
  check('纪念日设置', av.ok && av.data.pair.anniversary === '2023-02-14');

  const anAdd = await post('/api/anniversary/add', { pairId, memberId: boyId, title: '认识纪念日', date: '2025-01-01' });
  check('添加纪念日', anAdd.ok && anAdd.data.pair.anniversaries.length === 1);
  const anId = anAdd.data.pair.anniversaries[0].id;
  const anBad = await post('/api/anniversary/add', { pairId, memberId: girlId, title: '', date: '2025-01-01' });
  check('空名称纪念日被拒绝', !anBad.ok);
  const anRm = await post('/api/anniversary/remove', { pairId, memberId: girlId, annivId: anId });
  check('删除纪念日', anRm.ok && anRm.data.pair.anniversaries.length === 0);

  const ty = await post('/api/tyrant', { pairId, memberId: boyId, text: '想你了！' });
  check('暴君刷屏发送', ty.ok && ty.data.pair.tyrant && ty.data.pair.tyrant.text === '想你了！' && ty.data.pair.tyrant.fromMemberId === boyId);

  const mi = await post('/api/miss', { pairId, memberId: boyId });
  check('想你了打卡', mi.ok && mi.data.pair.members[boyId].missYou && mi.data.pair.members[boyId].missYou.count === 1);
  const mi2 = await post('/api/miss', { pairId, memberId: boyId });
  check('想你了再点一次 +1', mi2.ok && mi2.data.pair.members[boyId].missYou.count === 2);
  const th = await post('/api/theme', { pairId, memberId: boyId, theme: 'mint' });
  check('更换主题', th.ok && th.data.pair.theme === 'mint');
  const thBad = await post('/api/theme', { pairId, memberId: boyId, theme: 'nope' });
  check('非法主题被拒绝', !thBad.ok);
  const dec = await post('/api/declaration', { pairId, memberId: girlId, text: '世界很大只有我们' });
  check('爱情宣言', dec.ok && dec.data.pair.declaration === '世界很大只有我们');
  const cap = await post('/api/capsule/add', { pairId, memberId: boyId, title: '一年后', content: '希望我们还在一起', openDate: '2099-01-01' });
  check('添加时空胶囊', cap.ok && cap.data.pair.capsules.length === 1);
  const capId = cap.data.pair.capsules[0].id;
  const capRm = await post('/api/capsule/delete', { pairId, memberId: girlId, capsuleId: capId });
  check('删除时空胶囊', capRm.ok && capRm.data.pair.capsules.length === 0);
  const et = await post('/api/entry', { pairId, memberId: girlId, type: 'food', text: 'tag test', tag: '约会', location: '上海' });
  check('动态带标签与地点', et.ok && et.data.pair.entries.some((e) => e.tag === '约会' && e.location === '上海'));
  const ev = await post('/api/entry', { pairId, memberId: girlId, type: 'mood', emoji: '🎤', voice: 'data:audio/webm;base64,AAAA' });
  check('动态带语音', ev.ok && ev.data.pair.entries.some((e) => e.voice && e.voice.startsWith('data:audio/')));

  const mp = await post('/api/music/pick', { pairId, memberId: boyId, trackId: 'bt_sunrise', source: 'builtin' });
  check('点内置歌', mp.ok && mp.data.pair.music.nowPlaying.trackId === 'bt_sunrise');

  const mu = await post('/api/music/add', { pairId, memberId: girlId, title: '我们的歌', dataUrl: 'data:audio/wav;base64,AAAA' });
  check('上传音乐', mu.ok && mu.data.pair.music.tracks.length === 1);

  const sy = await post('/api/sync', { pairId, memberId: boyId });
  check('断线重连同步', sy.ok && sy.data.pair.todos.length === 1);

  const es = await fetch(BASE + '/api/events/' + pairId + '/' + boyId);
  check('SSE 事件流 Content-Type', (es.headers.get('content-type') || '').includes('text/event-stream'));
  const reader = es.body.getReader();
  const { value } = await reader.read();
  const text = new TextDecoder().decode(value);
  check('SSE 首帧包含状态数据', text.includes('"todos"'));
  reader.cancel();

  // 无效成员访问
  const bad = await post('/api/sync', { pairId, memberId: 'm_wrong' });
  check('非法成员被拒绝', !bad.ok);

  console.log('');
  console.log('结果: ' + passed + ' 通过, ' + failed + ' 失败');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('测试崩溃:', e); process.exit(1); });
