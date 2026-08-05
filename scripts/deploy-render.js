// deploy-render.js —— 用 Render API 从 GitHub 仓库创建免费 Web 服务
// 用法：$env:RENDER_API_KEY='...' ; node scripts/deploy-render.js
const KEY = process.env.RENDER_API_KEY;
if (!KEY) { console.error('缺少 RENDER_API_KEY'); process.exit(1); }
const BASE = 'https://api.render.com/v1';
async function api(path, opts = {}) {
  const r = await fetch(BASE + path, Object.assign({
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + KEY }
  }, opts));
  const text = await r.text();
  let j = null; try { j = JSON.parse(text); } catch (e) { /* ignore */ }
  if (!r.ok) throw new Error('Render ' + r.status + ': ' + (text.slice(0, 300)));
  return j;
}
(async () => {
  // 1) 验证 key 并找到 owner id
  const owners = await api('/owners');
  console.log('owners:', JSON.stringify(owners.map(o => ({ id: o.id, name: o.name, type: o.type }))));
  const owner = owners.find(o => o.type === 'user') || owners[0];
  // 2) 创建服务
  const payload = {
    type: 'web_service',
    name: 'couple-home',
    ownerId: owner.id,
    repo: 'https://github.com/jwbszsy/couple-home',
    branch: 'main',
    plan: 'free',
    region: 'singapore',
    autoDeploy: true,
    healthCheckPath: '/health',
    envVars: [
      { key: 'NODE_VERSION', value: '20' },
      { key: 'PORT', value: '10000' }
    ],
    serviceDetails: {
      env: 'node',
      buildCommand: 'npm install',
      startCommand: 'node server.js'
    }
  };
  const svc = await api('/services', { method: 'POST', body: JSON.stringify(payload) });
  console.log('SERVICE_CREATED:', svc.id, svc.serviceDetails && svc.serviceDetails.url);
  // 3) 等待部署完成
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 10000));
    try {
      const s = await api('/services/' + svc.id);
      const d = (s.lastSuccessfulDeploy || s.lastDeploy || {}).commit;
      console.log('status:', s.suspended, 'deploys:', JSON.stringify((s.deploys || []).slice(0, 1)));
    } catch (e) { /* ignore */ }
  }
})().catch((e) => { console.error('FAIL ' + e.message); process.exit(1); });
