// 隐界农场音效：纯 Web Audio API 程序合成，零静态资源。
// iOS Safari 要求 user gesture 才能让 AudioContext.resume()；首次调用时尝试 resume。

let ctx: AudioContext | null = null;
let muted = false;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return null;
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  if (ctx && ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

export function setFarmSfxMuted(value: boolean) {
  muted = value;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem("farm.sfx.muted", value ? "1" : "0");
    } catch {}
  }
}

export function isFarmSfxMuted(): boolean {
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem("farm.sfx.muted");
      if (raw === "1") return true;
    } catch {}
  }
  return muted;
}

interface ToneOptions {
  freq: number;
  endFreq?: number;
  durationMs: number;
  type?: OscillatorType;
  gain?: number;
}

function playTone({ freq, endFreq, durationMs, type = "sine", gain = 0.18 }: ToneOptions) {
  if (isFarmSfxMuted()) return;
  const c = getCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  if (endFreq != null) {
    osc.frequency.linearRampToValueAtTime(endFreq, c.currentTime + durationMs / 1000);
  }
  g.gain.value = 0;
  g.gain.linearRampToValueAtTime(gain, c.currentTime + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + durationMs / 1000);
  osc.connect(g).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + durationMs / 1000);
}

function playNoise(durationMs: number, gain = 0.08) {
  if (isFarmSfxMuted()) return;
  const c = getCtx();
  if (!c) return;
  const buffer = c.createBuffer(1, (c.sampleRate * durationMs) / 1000, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  }
  const source = c.createBufferSource();
  source.buffer = buffer;
  const g = c.createGain();
  g.gain.value = gain;
  source.connect(g).connect(c.destination);
  source.start();
}

export function playWaterDrop() {
  playTone({ freq: 880, endFreq: 220, durationMs: 220, type: "sine" });
}

export function playHarvestPop() {
  playTone({ freq: 520, endFreq: 1040, durationMs: 160, type: "triangle", gain: 0.22 });
  setTimeout(() => playTone({ freq: 880, durationMs: 90, type: "sine", gain: 0.1 }), 60);
}

export function playStealSwoosh() {
  playNoise(280, 0.1);
  playTone({ freq: 1320, endFreq: 220, durationMs: 200, type: "sawtooth", gain: 0.1 });
}

export function playDogBark() {
  playTone({ freq: 380, endFreq: 280, durationMs: 90, type: "square", gain: 0.18 });
  setTimeout(
    () => playTone({ freq: 420, endFreq: 320, durationMs: 90, type: "square", gain: 0.18 }),
    140,
  );
}

export function playLevelUp() {
  // 三连音琶音 do mi sol，给升级一点仪式感
  const base = 523.25; // C5
  [0, 200, 400].forEach((delay, i) => {
    setTimeout(
      () =>
        playTone({
          freq: base * Math.pow(2, i / 4),
          durationMs: 220,
          type: "triangle",
          gain: 0.16,
        }),
      delay,
    );
  });
}

export function playCheckin() {
  playTone({ freq: 600, durationMs: 120, type: "sine", gain: 0.18 });
  setTimeout(() => playTone({ freq: 800, durationMs: 150, type: "sine", gain: 0.18 }), 140);
}
