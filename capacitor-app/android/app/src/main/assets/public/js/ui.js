// ui.js —— 通用 UI / 工具函数

export const $ = (sel, root) => (root || document).querySelector(sel);
export const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function toast(msg, ms) {
  ms = ms || 2200;
  const root = $('#toast-root');
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  root.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .4s'; }, ms - 400);
  setTimeout(() => t.remove(), ms);
}

export function todayKey() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function fmtClock(ts) {
  const d = new Date(ts);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

// 在一起天数：返回 {days, hours, mins, secs}
export function daysTogether(anniversary) {
  const p = String(anniversary || '').split('-').map(Number);
  if (p.length !== 3 || p.some(isNaN)) return { days: 0, hours: 0, mins: 0, secs: 0 };
  const start = new Date(p[0], p[1] - 1, p[2], 0, 0, 0);
  let diff = Date.now() - start.getTime();
  if (diff < 0) diff = 0;
  const secs = Math.floor(diff / 1000);
  return {
    days: Math.floor(secs / 86400),
    hours: Math.floor((secs % 86400) / 3600),
    mins: Math.floor((secs % 3600) / 60),
    secs: secs % 60
  };
}

// 图片压缩（canvas）→ dataURL；失败时给出友好提示
export function compressImage(file, maxDim, quality) {
  quality = quality == null ? 0.85 : quality;
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const raw = reader.result;
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', quality));
        } catch (err) {
          // canvas 被污染或转换失败 → 图片不大时退回原图，否则提示换一张
          if (raw && raw.length < 4.5 * 1024 * 1024) resolve(raw);
          else reject(new Error('图片处理失败，请换一张试试'));
        }
      };
      img.onerror = () => reject(new Error('图片解析失败：如果是 iPhone 的 HEIC 照片，请先在相册里转成 JPEG/PNG 再上传'));
      img.src = raw;
    };
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}

// 音频文件 → dataURL（客户端限制大小，服务端还会再校验）
export function readAudioDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!/^audio\//.test(file.type)) { reject(new Error('请选择音频文件（mp3/m4a/ogg/wav）')); return; }
    if (file.size > 8 * 1024 * 1024) { reject(new Error('音频不能超过 8MB')); return; }
    const reader = new FileReader();
    reader.onload = () => resolve({ dataUrl: reader.result, name: file.name.replace(/\.[^.]+$/, '').slice(0, 60) });
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}

export function avatarHtml(member, cls) {
  if (member && member.avatar) {
    return '<img class="' + (cls || 'avatar') + '" src="' + member.avatar + '" alt="头像" />';
  }
  return '<div class="' + (cls || 'avatar') + ' avatar-fallback">' + (member && member.role === 'girl' ? '👧' : '🧑') + '</div>';
}

// 简单弹窗：html 为内容；返回 {root, close}
export function openModal(html) {
  const mask = document.createElement('div');
  mask.className = 'modal-mask';
  mask.innerHTML = '<div class="modal">' + html + '</div>';
  const modal = mask.firstChild;
  mask.addEventListener('click', (e) => { if (e.target === mask) close(); });
  $('#modal-root').appendChild(mask);
  function close() { mask.remove(); }
  return { root: modal, close };
}

export function confirmModal(title, text, onOk, okLabel) {
  const m = openModal(
    '<h3>' + esc(title) + '</h3>' +
    '<p class="muted" style="font-size:14px;line-height:1.7;">' + esc(text) + '</p>' +
    '<div class="modal-actions">' +
    '<button class="btn-ghost" id="m-cancel">再想想</button>' +
    '<button class="btn-primary" id="m-ok">' + esc(okLabel || '确定') + '</button>' +
    '</div>'
  );
  m.root.querySelector('#m-cancel').onclick = m.close;
  m.root.querySelector('#m-ok').onclick = () => { m.close(); onOk(); };
  return m;
}
