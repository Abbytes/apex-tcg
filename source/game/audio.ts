import type { WeaponKind } from "./weapons";

let ctx: AudioContext | null = null;
let unlocked = false;

type Mixer = {
  ac: AudioContext;
  master: GainNode;
  sfx: GainNode;
  ui: GainNode;
  bed: GainNode;
  duck: GainNode;
  dry: GainNode;
  wet: GainNode;
};

let mixer: Mixer | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC({ latencyHint: "interactive" });
    } catch {
      try {
        ctx = new AC();
      } catch {
        return null;
      }
    }
  }
  if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  return ctx;
}

function makeShaper(ac: AudioContext, amount: number) {
  const n = 256;
  const curve = new Float32Array(n);
  const k = amount * 18;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  const node = ac.createWaveShaper();
  node.curve = curve;
  node.oversample = "2x";
  return node;
}

function ensureMixer(): Mixer | null {
  const ac = audio();
  if (!ac) return null;
  if (mixer && mixer.ac === ac) return mixer;

  const master = ac.createGain();
  master.gain.value = 0.92;

  const limiter = ac.createDynamicsCompressor();
  limiter.threshold.value = -14;
  limiter.knee.value = 10;
  limiter.ratio.value = 6;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.16;

  const sfx = ac.createGain();
  sfx.gain.value = 0.86;
  const ui = ac.createGain();
  ui.gain.value = 0.42;
  const bed = ac.createGain();
  bed.gain.value = 0.5;
  const duck = ac.createGain();
  duck.gain.value = 1;
  const dry = ac.createGain();
  dry.gain.value = 1;
  const wet = ac.createGain();
  wet.gain.value = 0.24;

  const delay = ac.createDelay(0.4);
  delay.delayTime.value = 0.086;
  const fb = ac.createGain();
  fb.gain.value = 0.26;
  const damp = ac.createBiquadFilter();
  damp.type = "lowpass";
  damp.frequency.value = 2600;
  damp.Q.value = 0.5;

  wet.connect(delay);
  delay.connect(damp);
  damp.connect(fb);
  fb.connect(delay);
  damp.connect(sfx);

  dry.connect(sfx);
  sfx.connect(limiter);
  ui.connect(limiter);
  bed.connect(duck);
  duck.connect(limiter);
  limiter.connect(master);
  master.connect(ac.destination);

  mixer = { ac, master, sfx, ui, bed, duck, dry, wet };
  return mixer;
}

export function unlockAudio() {
  unlocked = true;
  try {
    audio();
    ensureMixer();
  } catch {
    /* iOS / muted preview — never block a tap */
  }
}

if (typeof window !== "undefined") {
  const wake = () => {
    unlockAudio();
  };
  window.addEventListener("pointerdown", wake, { once: true });
  window.addEventListener("keydown", wake, { once: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && unlocked) audio();
  });
}

function bus(send: "dry" | "wet" | "bed" | "ui"): GainNode | null {
  const m = ensureMixer();
  if (!m) return null;
  if (send === "wet") return m.wet;
  if (send === "bed") return m.bed;
  if (send === "ui") return m.ui;
  return m.dry;
}

function duckBed(amount = 0.32, hold = 0.2) {
  const m = ensureMixer();
  if (!m) return;
  const t = m.ac.currentTime;
  const g = m.duck.gain;
  g.cancelScheduledValues(t);
  g.setValueAtTime(Math.max(0.0001, g.value), t);
  g.linearRampToValueAtTime(amount, t + 0.028);
  g.setValueAtTime(amount, t + hold);
  g.linearRampToValueAtTime(1, t + hold + 0.24);
}

type Tone = {
  freq: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  slide?: number;
  hp?: number;
  lp?: number;
  peak?: number;
  peakGain?: number;
  pan?: number;
  send?: "dry" | "wet" | "bed" | "ui";
  delay?: number;
  sat?: boolean;
};

function jitter(n: number, amt = 0.08) {
  return n * (1 - amt + Math.random() * amt * 2);
}

function tone(opts: Tone) {
  const m = ensureMixer();
  const dest = bus(opts.send ?? "dry");
  if (!m || !dest) return;
  const t0 = m.ac.currentTime + (opts.delay ?? 0);
  const dur = opts.dur;
  const gain = opts.gain ?? 0.05;
  const osc = m.ac.createOscillator();
  osc.type = opts.type ?? "sine";
  const f = jitter(opts.freq, 0.06);
  osc.frequency.setValueAtTime(f, t0);
  if (opts.slide) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f * opts.slide), t0 + dur);
  }

  const env = m.ac.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), t0 + Math.min(0.012, dur * 0.12));
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  let node: AudioNode = osc;
  if (opts.hp) {
    const hp = m.ac.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = opts.hp;
    node.connect(hp);
    node = hp;
  }
  if (opts.lp) {
    const lp = m.ac.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = opts.lp;
    node.connect(lp);
    node = lp;
  }
  if (opts.peak) {
    const peak = m.ac.createBiquadFilter();
    peak.type = "peaking";
    peak.frequency.value = opts.peak;
    peak.gain.value = opts.peakGain ?? 5;
    peak.Q.value = 1.2;
    node.connect(peak);
    node = peak;
  }
  if (opts.sat) {
    const sat = makeShaper(m.ac, 0.5);
    node.connect(sat);
    node = sat;
  }
  const pan = m.ac.createStereoPanner();
  pan.pan.value = opts.pan ?? (Math.random() * 0.16 - 0.08);
  node.connect(pan);
  pan.connect(env);
  env.connect(dest);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
  osc.onended = () => {
    try {
      osc.disconnect();
      env.disconnect();
      pan.disconnect();
    } catch {
      /* already gone */
    }
  };
}

function noise(opts: {
  dur: number;
  gain: number;
  hp?: number;
  lp?: number;
  pan?: number;
  send?: "dry" | "wet" | "bed" | "ui";
  delay?: number;
}) {
  const m = ensureMixer();
  const dest = bus(opts.send ?? "dry");
  if (!m || !dest) return;
  const t0 = m.ac.currentTime + (opts.delay ?? 0);
  const n = Math.max(32, Math.floor(m.ac.sampleRate * opts.dur));
  const buf = m.ac.createBuffer(1, n, m.ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = m.ac.createBufferSource();
  src.buffer = buf;

  const env = m.ac.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(Math.max(0.0001, opts.gain), t0 + 0.008);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.dur);

  const hp = m.ac.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = opts.hp ?? 180;
  const lp = m.ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = opts.lp ?? 1400;
  const pan = m.ac.createStereoPanner();
  pan.pan.value = opts.pan ?? (Math.random() * 0.2 - 0.1);

  src.connect(hp);
  hp.connect(lp);
  lp.connect(pan);
  pan.connect(env);
  env.connect(dest);
  src.start(t0);
  src.stop(t0 + opts.dur + 0.02);
}

function later(ms: number, fn: () => void) {
  const m = ensureMixer();
  if (!m) {
    window.setTimeout(fn, ms);
    return;
  }
  window.setTimeout(fn, ms);
}

function strikeSpear() {
  duckBed(0.55, 0.12);
  noise({ dur: 0.038, gain: 0.038, hp: 1600, lp: 7800, pan: -0.12 });
  tone({ freq: 1880, dur: 0.05, type: "sine", gain: 0.028, slide: 1.18, hp: 800, pan: -0.1 });
  tone({ freq: 96, dur: 0.13, type: "triangle", gain: 0.048, slide: 0.42, lp: 900, delay: 0.022, sat: true });
  noise({ dur: 0.07, gain: 0.055, hp: 140, lp: 1100, delay: 0.02 });
  tone({ freq: 640, dur: 0.08, type: "sine", gain: 0.016, slide: 0.7, send: "wet", delay: 0.048 });
}

function strikeBlade() {
  duckBed(0.45, 0.14);
  noise({ dur: 0.055, gain: 0.05, hp: 2200, lp: 9800, pan: -0.18 });
  tone({ freq: 2120, dur: 0.08, type: "sine", gain: 0.038, slide: 0.62, peak: 2400, peakGain: 6, pan: -0.12 });
  tone({ freq: 3180, dur: 0.07, type: "triangle", gain: 0.022, slide: 0.7, pan: 0.22, delay: 0.012, send: "wet" });
  noise({ dur: 0.08, gain: 0.048, hp: 280, lp: 2200, delay: 0.03 });
  tone({ freq: 220, dur: 0.07, type: "square", gain: 0.028, slide: 0.5, lp: 1200, delay: 0.03, sat: true });
  tone({ freq: 1480, dur: 0.16, type: "triangle", gain: 0.018, slide: 0.55, send: "wet", delay: 0.068 });
}

function strikeShield() {
  duckBed(0.5, 0.12);
  noise({ dur: 0.12, gain: 0.07, hp: 60, lp: 900 });
  tone({ freq: 168, dur: 0.15, type: "triangle", gain: 0.048, slide: 0.6, lp: 1400, sat: true });
  tone({ freq: 920, dur: 0.09, type: "sine", gain: 0.024, delay: 0.024, send: "wet" });
  tone({ freq: 460, dur: 0.09, type: "triangle", gain: 0.016, delay: 0.07, send: "wet" });
}

function strikeClaw() {
  duckBed(0.6, 0.1);
  noise({ dur: 0.036, gain: 0.046, hp: 800, lp: 4200, pan: -0.2 });
  tone({ freq: 420, dur: 0.05, type: "sawtooth", gain: 0.024, slide: 0.65, lp: 2400, pan: -0.16 });
  noise({ dur: 0.045, gain: 0.048, hp: 520, lp: 3400, pan: 0.18, delay: 0.038 });
  tone({ freq: 260, dur: 0.07, type: "sawtooth", gain: 0.03, slide: 0.5, lp: 1800, delay: 0.038, sat: true });
  tone({ freq: 180, dur: 0.06, type: "square", gain: 0.02, slide: 0.45, delay: 0.08 });
}

function strikeFang() {
  duckBed(0.55, 0.1);
  noise({ dur: 0.06, gain: 0.05, hp: 140, lp: 720 });
  tone({ freq: 90, dur: 0.09, type: "square", gain: 0.04, slide: 0.55, lp: 700, sat: true });
  noise({ dur: 0.05, gain: 0.032, hp: 400, lp: 1800, delay: 0.032 });
  tone({ freq: 210, dur: 0.07, type: "sawtooth", gain: 0.024, slide: 0.4, delay: 0.032 });
}

function strikeCrush() {
  duckBed(0.28, 0.22);
  noise({ dur: 0.2, gain: 0.09, hp: 28, lp: 420 });
  tone({ freq: 38, dur: 0.26, type: "sawtooth", gain: 0.07, slide: 0.32, lp: 280, sat: true });
  noise({ dur: 0.12, gain: 0.045, hp: 50, lp: 480, delay: 0.04, send: "wet" });
  tone({ freq: 70, dur: 0.12, type: "triangle", gain: 0.024, slide: 0.4, delay: 0.09, send: "wet" });
}

function strikeTentacle() {
  duckBed(0.5, 0.16);
  noise({ dur: 0.15, gain: 0.062, hp: 40, lp: 560, send: "wet" });
  tone({ freq: 64, dur: 0.18, type: "sine", gain: 0.044, slide: 0.42, lp: 500, sat: true });
  noise({ dur: 0.1, gain: 0.036, hp: 80, lp: 800, delay: 0.08 });
  tone({ freq: 140, dur: 0.1, type: "triangle", gain: 0.022, slide: 0.55, delay: 0.08, send: "wet" });
}

function strikeWraith() {
  duckBed(0.62, 0.2);
  noise({ dur: 0.22, gain: 0.034, hp: 1700, lp: 7600, send: "wet", pan: -0.25 });
  tone({ freq: 480, dur: 0.24, type: "sine", gain: 0.028, slide: 1.32, send: "wet", pan: -0.15 });
  tone({ freq: 760, dur: 0.2, type: "triangle", gain: 0.018, slide: 0.8, delay: 0.05, send: "wet", pan: 0.2 });
  tone({ freq: 1100, dur: 0.14, type: "sine", gain: 0.012, slide: 0.7, delay: 0.14, send: "wet" });
}

function roarBeast() {
  duckBed(0.22, 0.38);
  noise({ dur: 0.4, gain: 0.06, hp: 70, lp: 620, send: "wet" });
  tone({
    freq: 68,
    dur: 0.48,
    type: "sawtooth",
    gain: 0.072,
    slide: 0.42,
    hp: 40,
    lp: 720,
    peak: 240,
    peakGain: 4,
    sat: true,
  });
  tone({ freq: 102, dur: 0.42, type: "square", gain: 0.032, slide: 0.48, lp: 900, delay: 0.016 });
  tone({ freq: 156, dur: 0.22, type: "triangle", gain: 0.028, slide: 0.55, delay: 0.11, send: "wet" });
  noise({ dur: 0.14, gain: 0.042, hp: 180, lp: 900, delay: 0.18 });
  tone({ freq: 84, dur: 0.16, type: "sawtooth", gain: 0.032, slide: 0.38, delay: 0.18, sat: true });
  tone({ freq: 48, dur: 0.2, type: "sine", gain: 0.026, slide: 0.5, delay: 0.28, send: "wet" });
}

function playVoice(weapon: WeaponKind) {
  if (weapon === "spear") strikeSpear();
  else if (weapon === "blade") strikeBlade();
  else if (weapon === "shield") strikeShield();
  else if (weapon === "claw") strikeClaw();
  else if (weapon === "fang") strikeFang();
  else if (weapon === "crush") strikeCrush();
  else if (weapon === "tentacle") strikeTentacle();
  else if (weapon === "roar") roarBeast();
  else strikeWraith();
}

function cinematicBed(heavy: boolean) {
  const m = ensureMixer();
  if (!m) return;
  m.bed.gain.setTargetAtTime(heavy ? 0.62 : 0.42, m.ac.currentTime, 0.04);
  tone({ freq: 36, dur: heavy ? 0.7 : 0.48, type: "sine", gain: heavy ? 0.045 : 0.03, send: "bed", lp: 220 });
  tone({ freq: 520, dur: 0.28, type: "sine", gain: 0.014, slide: 1.2, send: "bed", delay: 0.12 });
  tone({ freq: 780, dur: 0.3, type: "triangle", gain: 0.012, slide: 1.12, send: "bed", delay: 0.22 });
  tone({ freq: 1040, dur: 0.22, type: "sine", gain: 0.01, slide: 0.85, send: "bed", delay: 0.48 });
}

export const sfx = {
  play: () => tone({ freq: 180, dur: 0.12, type: "triangle", gain: 0.035, send: "ui", lp: 1200 }),
  attack: () => strikeBlade(),
  strike: (weapon: WeaponKind, face = false) => {
    playVoice(weapon);
    if (face) {
      noise({ dur: 0.11, gain: 0.042, hp: 50, lp: 480, delay: 0.07, send: "wet" });
      tone({ freq: 56, dur: 0.13, type: "sawtooth", gain: 0.03, slide: 0.4, delay: 0.07, lp: 400, sat: true });
    }
  },
  face: () => {
    noise({ dur: 0.16, gain: 0.07, hp: 60, lp: 680 });
    tone({ freq: 70, dur: 0.2, type: "sawtooth", gain: 0.05, slide: 0.35, lp: 500, sat: true });
    tone({ freq: 180, dur: 0.1, type: "triangle", gain: 0.022 });
  },
  hit: () => {
    noise({ dur: 0.07, gain: 0.04, hp: 220, lp: 1700 });
    tone({ freq: 140, dur: 0.09, type: "square", gain: 0.024, slide: 0.6, lp: 900 });
  },
  death: () => {
    duckBed(0.4, 0.18);
    noise({ dur: 0.18, gain: 0.05, hp: 80, lp: 900, send: "wet" });
    tone({ freq: 110, dur: 0.22, type: "sawtooth", gain: 0.032, slide: 0.3, lp: 600, sat: true });
  },
  power: () => {
    tone({ freq: 240, dur: 0.1, type: "triangle", gain: 0.032, send: "ui" });
    tone({ freq: 380, dur: 0.14, type: "sine", gain: 0.024, send: "ui" });
  },
  powerStrike: (weapon: WeaponKind = "spear", epic = false) => {
    if (epic) {
      cinematicBed(true);
      noise({ dur: 0.26, gain: 0.09, hp: 22, lp: 280, delay: 0.18, send: "bed" });
      later(880, () => playVoice(weapon));
      later(1020, () => {
        if (weapon === "roar") later(80, () => strikeCrush());
      });
      noise({ dur: 0.14, gain: 0.055, hp: 36, lp: 460, delay: 1.48, send: "wet" });
      tone({ freq: 520, dur: 0.26, type: "sine", gain: 0.016, slide: 1.2, send: "bed", delay: 2.1 });
      return;
    }
    playVoice(weapon);
    noise({ dur: 0.1, gain: 0.045, hp: 40, lp: 480, delay: 0.09, send: "wet" });
    tone({ freq: 52, dur: 0.14, type: "sawtooth", gain: 0.03, slide: 0.38, delay: 0.09, lp: 360 });
  },
  draw: () => tone({ freq: 420, dur: 0.08, type: "sine", gain: 0.024, send: "ui" }),
  hurt: () => tone({ freq: 70, dur: 0.16, type: "square", gain: 0.036, lp: 700, send: "ui" }),
  win: () => {
    tone({ freq: 330, dur: 0.16, type: "triangle", gain: 0.04, send: "ui" });
    tone({ freq: 440, dur: 0.2, type: "triangle", gain: 0.04, send: "ui", delay: 0.12 });
    tone({ freq: 550, dur: 0.28, type: "triangle", gain: 0.042, send: "ui", delay: 0.24 });
  },
  lose: () => tone({ freq: 110, dur: 0.4, type: "sawtooth", gain: 0.032, slide: 0.5, lp: 500, send: "ui" }),
  pack: () => {
    tone({ freq: 520, dur: 0.1, type: "sine", gain: 0.032, send: "ui" });
    tone({ freq: 680, dur: 0.12, type: "sine", gain: 0.03, send: "ui", delay: 0.09 });
  },
  ui: () => tone({ freq: 260, dur: 0.05, type: "sine", gain: 0.016, send: "ui" }),
  hint: () => {
    tone({ freq: 520, dur: 0.08, type: "sine", gain: 0.024, send: "ui" });
    tone({ freq: 780, dur: 0.12, type: "triangle", gain: 0.02, send: "ui" });
  },
};
