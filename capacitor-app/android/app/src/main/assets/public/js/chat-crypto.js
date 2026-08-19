// chat-crypto.js —— 端到端加密（AES-GCM，密钥由房间码派生，客户端本地完成）
const SALT = new TextEncoder().encode('couple-chat-v1');
let cachedKey = null;
let cachedCode = '';

async function deriveKey(code) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(String(code || '')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: SALT, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}
async function getKey(code) {
  if (cachedKey && cachedCode === code) return cachedKey;
  cachedCode = code;
  cachedKey = await deriveKey(code);
  return cachedKey;
}
function b64(u8) { let s = ''; for (const b of u8) s += String.fromCharCode(b); return btoa(s); }
function fromB64(s) { const bin = atob(s); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); return u8; }

export async function encryptText(code, text) {
  const key = await getKey(code);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text));
  return { iv: b64(iv), ct: b64(new Uint8Array(ct)) };
}
export async function decryptText(code, ivB64, ctB64) {
  const key = await getKey(code);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(ivB64) }, key, fromB64(ctB64));
  return new TextDecoder().decode(pt);
}