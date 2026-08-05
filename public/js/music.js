// music.js —— 内置音乐引擎（Web Audio 程序合成，零音频文件、零版权问题）
// 每条内置曲目都是一段小循环：和弦垫 + 旋律 + 低音 + 轻鼓点。
// 播放器还支持上传自己的音乐（存到服务器，双方共享）。

export const BUILTIN_TRACKS = [
  {
    id: 'bt_sunrise', title: '晨光', emoji: '🌅', desc: '像清晨第一缕阳光一样温柔', bpm: 100,
    chords: [[60, 64, 67], [65, 69, 72], [57, 60, 64], [55, 59, 62]],
    melody: [
      [0, 0, 67, 2], [0, 2, 69, 2], [0, 4, 72, 4], [0, 8, 69, 2], [0, 10, 67, 2], [0, 12, 64, 2], [0, 14, 62, 2],
      [1, 0, 65, 2], [1, 2, 67, 2], [1, 4, 69, 4], [1, 8, 72, 2], [1, 10, 69, 2], [1, 12, 67, 4],
      [2, 0, 60, 2], [2, 2, 64, 2], [2, 4, 67, 4], [2, 8, 64, 2], [2, 10, 62, 2], [2, 12, 60, 4],
      [3, 0, 64, 2], [3, 2, 62, 2], [3, 4, 60, 2], [3, 6, 62, 2], [3, 8, 64, 4], [3, 12, 67, 4]
    ],
    bass: [[0, 0, 48, 6], [0, 8, 48, 6], [1, 0, 53, 6], [1, 8, 53, 6], [2, 0, 45, 6], [2, 8, 45, 6], [3, 0, 43, 6], [3, 8, 43, 6]],
    drums: { kick: [0, 8], hat: [2, 6, 10, 14] }
  },
  {
    id: 'bt_starry', title: '星夜', emoji: '🌙', desc: '夜深了，在想你', bpm: 84,
    chords: [[57, 60, 64], [53, 57, 60], [55, 60, 64], [55, 59, 62]],
    melody: [
      [0, 0, 69, 6], [0, 8, 72, 4], [0, 12, 71, 2],
      [1, 0, 69, 4], [1, 6, 67, 2], [1, 10, 65, 4],
      [2, 0, 64, 6], [2, 8, 67, 4], [2, 12, 64, 2],
      [3, 0, 62, 6], [3, 8, 59, 6]
    ],
    bass: [[0, 0, 45, 14], [1, 0, 41, 14], [2, 0, 43, 14], [3, 0, 43, 14]],
    drums: { hat: [4, 12], kick: [0] }
  },
  {
    id: 'bt_heartbeat', title: '心动', emoji: '💗', desc: '噗通噗通，都是你', bpm: 112,
    chords: [[60, 64, 67], [65, 69, 72], [55, 59, 62], [57, 60, 64]],
    melody: [
      [0, 0, 72, 1], [0, 1, 71, 1], [0, 2, 72, 1], [0, 3, 74, 1], [0, 4, 76, 2], [0, 6, 74, 1], [0, 7, 72, 1], [0, 8, 71, 2], [0, 10, 72, 2], [0, 12, 74, 2],
      [1, 0, 76, 2], [1, 2, 77, 2], [1, 4, 76, 2], [1, 6, 74, 2], [1, 8, 72, 4], [1, 12, 69, 2],
      [2, 0, 71, 2], [2, 2, 72, 2], [2, 4, 74, 2], [2, 6, 71, 2], [2, 8, 67, 4], [2, 12, 71, 2],
      [3, 0, 72, 2], [3, 2, 74, 2], [3, 4, 76, 2], [3, 6, 78, 2], [3, 8, 79, 4], [3, 12, 78, 2]
    ],
    bass: [[0, 0, 48, 2], [0, 4, 48, 2], [0, 8, 48, 2], [0, 12, 48, 2], [1, 0, 53, 2], [1, 4, 53, 2], [1, 8, 53, 2], [1, 12, 53, 2], [2, 0, 43, 2], [2, 4, 43, 2], [2, 8, 43, 2], [2, 12, 43, 2], [3, 0, 45, 2], [3, 4, 45, 2], [3, 8, 45, 2], [3, 12, 45, 2]],
    drums: { kick: [0, 4, 8, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14] }
  },
  {
    id: 'bt_cloud', title: '软绵绵', emoji: '☁️', desc: '一起窝在云朵里发呆', bpm: 70,
    chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]],
    melody: [
      [0, 0, 64, 4], [0, 4, 67, 4], [0, 8, 69, 4], [0, 12, 67, 2], [0, 14, 64, 2],
      [1, 0, 65, 6], [1, 8, 64, 4], [1, 12, 60, 2],
      [2, 0, 60, 4], [2, 4, 64, 4], [2, 8, 67, 6],
      [3, 0, 66, 4], [3, 4, 64, 4], [3, 8, 62, 6]
    ],
    bass: [[0, 0, 45, 12], [1, 0, 41, 12], [2, 0, 36, 12], [3, 0, 43, 12]],
    drums: { kick: [0, 10], hat: [2, 6, 10, 14], snare: [4, 12] }
  }
];

function midiHz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

export class MusicEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noise = null;
    this.scheduler = null;
    this.track = null;
    this.playing = false;
    this.step = 0;
    this.nextTime = 0;
    this.active = new Set();
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.42;
      this.master.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  async resume() {
    const ctx = this.ensure();
    if (ctx.state === 'suspended') { try { await ctx.resume(); } catch (e) { /* ignore */ } }
  }

  isPlaying() { return this.playing; }

  play(track) {
    this.stop();
    const ctx = this.ensure();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    this.track = track;
    this.playing = true;
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.08;
    this.scheduler = setInterval(() => this.schedule(), 25);
  }

  stop() {
    if (this.scheduler) { clearInterval(this.scheduler); this.scheduler = null; }
    this.playing = false;
    for (const node of this.active) {
      try { if (node.stop) node.stop(); } catch (e) { /* ignore */ }
      try { if (node.disconnect) node.disconnect(); } catch (e) { /* ignore */ }
    }
    this.active.clear();
    this.track = null;
  }

  schedule() {
    const ctx = this.ctx, track = this.track;
    if (!ctx || !track) return;
    const sps = 60 / track.bpm / 4; // 每 16 分音符秒数
    while (this.nextTime < ctx.currentTime + 0.16) {
      const bar = Math.floor(this.step / 16) % Math.max(1, track.chords.length);
      const s = this.step % 16;
      this.playStep(track, bar, s, this.nextTime, sps);
      this.nextTime += sps;
      this.step++;
    }
  }

  playStep(track, bar, s, t, sps) {
    if (s % 8 === 0 && track.chords[bar]) this.pad(track.chords[bar], t, sps * 8);
    for (const b of track.bass) if (b[0] === bar && b[1] === s) this.pluck(b[2] - 12, t, sps * b[3], 'sine', 0.5);
    for (const m of track.melody) if (m[0] === bar && m[1] === s) this.pluck(m[2], t, sps * m[3], 'triangle', 0.85);
    if (track.drums) {
      if (track.drums.kick && track.drums.kick.includes(s)) this.kick(t);
      if (track.drums.snare && track.drums.snare.includes(s)) this.snare(t);
      if (track.drums.hat && track.drums.hat.includes(s)) this.hat(t);
    }
  }

  pluck(freq, t, dur, type, vol) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol * 0.4, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    g.connect(this.master);
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = freq * 2;
    o.connect(g); o2.connect(g);
    o.start(t); o2.start(t);
    const end = t + dur + 0.05;
    o.stop(end); o2.stop(end);
    this.active.add(o); this.active.add(o2); this.active.add(g);
  }

  pad(midis, t, dur) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.10, t + dur * 0.4);
    g.gain.setValueAtTime(0.10, t + dur * 0.6);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 1500; f.Q.value = 0.4;
    f.connect(g); g.connect(this.master);
    for (const m of midis) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = midiHz(m);
      o.connect(f); o.start(t); o.stop(t + dur + 0.05);
      this.active.add(o);
    }
    this.active.add(f); this.active.add(g);
  }

  noiseBuf() {
    const ctx = this.ctx;
    if (!this.noise) {
      const len = Math.floor(ctx.sampleRate * 1);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;
    }
    return this.noise;
  }

  kick(t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.55, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.22);
    this.active.add(o); this.active.add(g);
  }

  hat(t) {
    const ctx = this.ctx;
    const dur = 0.05;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf();
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.10, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(hp); hp.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
    this.active.add(src); this.active.add(hp); this.active.add(g);
  }

  snare(t) {
    const ctx = this.ctx;
    const dur = 0.12;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf();
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
    this.active.add(src); this.active.add(bp); this.active.add(g);
  }
}
