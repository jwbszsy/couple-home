'use strict';
// Default is dry-run. Upload only when --confirm-upload is explicitly provided.
const fs = require('fs');
const path = require('path');
const { insertSnapshotIfEmpty, getConfig } = require('../lib/supabase-store');

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (err) { if (err.code === 'ENOENT') return fallback; throw err; }
}
async function main() {
  const args = process.argv.slice(2);
  const approved = args.includes('--confirm-upload');
  const dirArg = args.find((arg) => arg.startsWith('--data-dir='));
  const dataDir = dirArg ? path.resolve(dirArg.slice('--data-dir='.length)) : path.resolve(__dirname, '../data');
  const snapshot = {
    db: readJson(path.join(dataDir, 'db.json'), { pairs: {} }),
    activations: readJson(path.join(dataDir, 'activations.json'), { codes: [], nextIndex: 0 }),
    stats: readJson(path.join(dataDir, 'stats.json'), { daily: {}, flagged: [] }),
    vapid: readJson(path.join(dataDir, 'vapid.json'), null)
  };
  const pairs = Object.values(snapshot.db.pairs || {});
  const members = pairs.reduce((sum, pair) => sum + Object.keys(pair.members || {}).length, 0);
  const messages = pairs.reduce((sum, pair) => sum + ((pair.chat && pair.chat.messages) || []).length, 0);
  console.log('迁移预览（不显示聊天正文，不上传数据）');
  console.log('数据目录：' + dataDir);
  console.log('小屋：' + pairs.length + '，成员：' + members + '，聊天消息：' + messages);
  console.log('激活码：' + ((snapshot.activations.codes || []).length) + '，统计日期：' + Object.keys(snapshot.stats.daily || {}).length);
  console.log('推送密钥：' + (snapshot.vapid && snapshot.vapid.publicKey ? '存在' : '无'));
  if (!approved) {
    console.log('Dry-run 完成。只有你明确确认迁移后，才加 --confirm-upload 执行上传。');
    return;
  }
  const config = getConfig();
  if (!config) throw new Error('请先设置 SUPABASE_URL 与 SUPABASE_SERVICE_ROLE_KEY');
  await insertSnapshotIfEmpty(snapshot, config);
  console.log('导入成功。已拒绝覆盖非空 Supabase 数据。');
}
main().catch((err) => { console.error('迁移失败：' + err.message); process.exitCode = 1; });