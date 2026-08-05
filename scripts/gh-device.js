// gh-device.js —— GitHub OAuth 设备码授权（配合官方 GitHub CLI 的公开 client_id）
// 用法：node scripts/gh-device.js code   → 生成授权码
//       node scripts/gh-device.js poll   → 轮询是否已授权，成功则保存 token
const https = require('https');
const fs = require('fs');
const path = require('path');
const CLIENT_ID = '178c6fc778ccc68e1d6a'; // GitHub CLI 公开 client_id
const SAVE_DIR = path.join(__dirname, '..', 'data', '.gh-device');

function postForm(host, p, data) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(data).toString();
    const req = https.request({
      host, path: p, method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'User-Agent': 'couple-home-device',
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(new Error('bad response: ' + d.slice(0, 200))); } });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

(async () => {
  fs.mkdirSync(SAVE_DIR, { recursive: true });
  const mode = process.argv[2] || 'code';
  if (mode === 'code') {
    const r = await postForm('github.com', '/login/device/code', { client_id: CLIENT_ID, scope: 'repo workflow write:packages read:packages' });
    if (r.error) throw new Error(r.error_description || r.error);
    fs.writeFileSync(path.join(SAVE_DIR, 'device.json'), JSON.stringify(r));
    console.log('USER_CODE=' + r.user_code);
    console.log('URL=' + (r.verification_uri || 'https://github.com/login/device'));
    console.log('EXPIRES_IN=' + r.expires_in);
  } else if (mode === 'poll') {
    const saved = JSON.parse(fs.readFileSync(path.join(SAVE_DIR, 'device.json'), 'utf8'));
    const r = await postForm('github.com', '/login/oauth/access_token', {
      client_id: CLIENT_ID,
      device_code: saved.device_code,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
    });
    if (r.access_token) {
      fs.writeFileSync(path.join(SAVE_DIR, 'gh-token.txt'), r.access_token);
      console.log('TOKEN_OK');
    } else {
      console.log('STATUS=' + (r.error || 'unknown') + ' ' + (r.error_description || ''));
    }
  }
})().catch((e) => { console.error('ERR ' + e.message); process.exit(1); });

