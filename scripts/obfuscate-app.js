// 混淆 App 包内的前端 JS（只影响 capacitor 打包资源，网页版保持原版）
const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'public', 'js');
const DEST = path.join(ROOT, 'capacitor-app', 'android', 'app', 'src', 'main', 'assets', 'public', 'js');
const FILES = ['app.js', 'api.js', 'views.js', 'chat-crypto.js', 'ui.js', 'music.js'];
const OPTIONS = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.4,
  deadCodeInjection: false,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  selfDefending: true,
  stringArray: true,
  rotateStringArray: true,
  stringArrayThreshold: 0.75,
  splitStrings: false,
  unicodeEscapeSequence: false
};
for (const file of FILES) {
  const src = path.join(SRC, file);
  const dest = path.join(DEST, file);
  if (!fs.existsSync(src)) { console.log('skip missing ' + file); continue; }
  const code = fs.readFileSync(src, 'utf8');
  const out = JavaScriptObfuscator.obfuscate(code, OPTIONS).getObfuscatedCode();
  fs.writeFileSync(dest, out, 'utf8');
  console.log('obfuscated ' + file + ' (' + code.length + ' -> ' + out.length + ' bytes)');
}
console.log('done');