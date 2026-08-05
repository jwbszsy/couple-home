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

  const c = await post('/api/pair/create', { nickname: '杨皓翔' });
  check('创建小屋返回邀请码', !!(c.ok && c.data.code && c.data.pairId && c.data.memberId));
  const { pairId, memberId: boyId, code } = c.data;

  const j = await post('/api/pair/join', { code, nickname: '韩诗妮' });
  check('加入小屋（第二人）', !!(j.ok && j.data.memberId && j.data.memberId !== boyId));
  const girlId = j.data.memberId;

  const j2 = await post('/api/pair/join', { code, nickname: '第三人' });
  check('第三人被拒绝', !j2.ok);

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

  const td = await post('/api/todo', { pairId, memberId: girlId, text: '一起看电影' });
  const todoId = td.data.pair.todos[0].id;
  check('添加待办', td.ok);
  const tg = await post('/api/todo/toggle', { pairId, memberId: boyId, todoId, done: true });
  check('勾选待办', tg.ok && tg.data.pair.todos[0].done === true);

  const av = await post('/api/anniversary', { pairId, memberId: girlId, date: '2023-02-14' });
  check('纪念日设置', av.ok && av.data.pair.anniversary === '2023-02-14');

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
