// seed-demo.js —— 创建一个演示小屋并填充示例数据（node scripts/seed-demo.js）
// 注意：post() 返回的是响应中的 data 对象本身。
const BASE = process.env.BASE || 'http://localhost:3000';
async function post(path, body) {
  const r = await fetch(BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!j.ok) throw new Error(path + ': ' + j.error);
  return j.data;
}
(async () => {
  const c = await post('/api/pair/create', { nickname: '杨皓翔' });
  const j = await post('/api/pair/join', { code: c.code, nickname: '韩诗妮' });
  const boyId = c.memberId, girlId = j.memberId, pairId = c.pairId;
  const M = (memberId, body) => Object.assign({ pairId, memberId }, body);

  await post('/api/anniversary', M(boyId, { date: '2023-02-14' }));
  await post('/api/entry', M(boyId, { type: 'mood', emoji: '😄', text: '今天和TA去了公园，超开心！', date: '2026-08-05' }));
  await post('/api/entry', M(girlId, { type: 'food', emoji: '🍲', text: '晚上一起吃了火锅～', date: '2026-08-05' }));
  await post('/api/todo', M(girlId, { text: '周末一起去游乐园' }));
  await post('/api/todo', M(boyId, { text: '给TA买奶茶' }));
  await post('/api/note', M(boyId, { date: '2026-08-05', text: '今天的你格外好看' }));
  await post('/api/status', M(girlId, { appName: '网易云音乐', packageName: 'com.netease.cloudmusic' }));
  await post('/api/music/pick', M(boyId, { trackId: 'bt_starry', source: 'builtin' }));

  console.log(JSON.stringify({ pairId, boyId, girlId, code: c.code }));
})().catch((e) => { console.error(e); process.exit(1); });
