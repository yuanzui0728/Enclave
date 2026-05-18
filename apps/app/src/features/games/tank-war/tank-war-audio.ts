// 8-bit 音效合成 — 不依赖任何外部音频资源。
// 用 Web Audio API 的 OscillatorNode / BufferSource(噪声) + GainNode ADSR。
// AudioContext 懒初始化（首次 play 之前 resume）。

export type SfxId =
  | "fire"
  | "hit"
  | "explodeSmall"
  | "explodeBig"
  | "pickup"
  | "powerup"
  | "stageStart"
  | "gameOver"
  | "pause"
  | "idle"
  | "move";

export type Sfx = {
  play: (id: SfxId) => void;
  setMoveActive: (on: boolean) => void;
  setMuted: (b: boolean) => void;
  dispose: () => void;
};

export function createSfx(): Sfx {
  let ctx: AudioContext | null = null;
  let muted = false;
  let moveOsc: OscillatorNode | null = null;
  let moveGain: GainNode | null = null;
  let moveActive = false;

  function ensureCtx(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!ctx) {
      const AC = (window.AudioContext as any) || (window as any).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC() as AudioContext;
    }
    if (ctx.state === "suspended") {
      void ctx.resume();
    }
    return ctx;
  }

  function noiseBuffer(duration: number): AudioBuffer | null {
    const c = ensureCtx();
    if (!c) return null;
    const sr = c.sampleRate;
    const len = Math.max(1, Math.floor(sr * duration));
    const buf = c.createBuffer(1, len, sr);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function tone(
    type: OscillatorType,
    freq: number,
    duration: number,
    attack = 0.01,
    decay = 0.05,
    sustainGain = 0.0,
  ): void {
    const c = ensureCtx();
    if (!c || muted) return;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const now = c.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.2, now + attack);
    gain.gain.linearRampToValueAtTime(
      sustainGain,
      now + attack + decay,
    );
    gain.gain.linearRampToValueAtTime(0, now + duration);
    osc.connect(gain).connect(c.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  function sweepTone(
    type: OscillatorType,
    fromHz: number,
    toHz: number,
    duration: number,
    peak = 0.18,
  ): void {
    const c = ensureCtx();
    if (!c || muted) return;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    const now = c.currentTime;
    osc.frequency.setValueAtTime(fromHz, now);
    osc.frequency.linearRampToValueAtTime(toHz, now + duration);
    gain.gain.setValueAtTime(peak, now);
    gain.gain.linearRampToValueAtTime(0, now + duration);
    osc.connect(gain).connect(c.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  function noiseBurst(duration: number, peak = 0.3): void {
    const c = ensureCtx();
    if (!c || muted) return;
    const buf = noiseBuffer(duration);
    if (!buf) return;
    const src = c.createBufferSource();
    src.buffer = buf;
    const gain = c.createGain();
    const now = c.currentTime;
    gain.gain.setValueAtTime(peak, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    src.connect(gain).connect(c.destination);
    src.start(now);
    src.stop(now + duration + 0.02);
  }

  function arpeggio(notes: number[], step: number, peak = 0.18): void {
    const c = ensureCtx();
    if (!c || muted) return;
    const now = c.currentTime;
    notes.forEach((f, i) => {
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = "square";
      osc.frequency.value = f;
      const start = now + i * step;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(peak, start + 0.005);
      gain.gain.linearRampToValueAtTime(0, start + step);
      osc.connect(gain).connect(c.destination);
      osc.start(start);
      osc.stop(start + step + 0.02);
    });
  }

  function ensureMoveOsc(): void {
    const c = ensureCtx();
    if (!c) return;
    if (moveOsc) return;
    moveOsc = c.createOscillator();
    moveGain = c.createGain();
    moveOsc.type = "sawtooth";
    moveOsc.frequency.value = 55;
    moveGain.gain.value = 0;
    moveOsc.connect(moveGain).connect(c.destination);
    moveOsc.start();
  }

  function applyMoveGain(): void {
    if (!moveGain || !ctx) return;
    const target = !muted && moveActive ? 0.04 : 0;
    moveGain.gain.cancelScheduledValues(ctx.currentTime);
    moveGain.gain.linearRampToValueAtTime(target, ctx.currentTime + 0.05);
  }

  function play(id: SfxId): void {
    // 先打 ensureCtx：iOS Safari 要求 AudioContext.resume() 在 user gesture 里
    // 调用才能真正出声；如果先 if (muted) return 跳过 ensureCtx，等以后用户
    // 再去 toggle 静音，play 是从 RAF 调的（非 gesture），ctx 永远 suspended。
    // 让 ensureCtx 早走一步，gesture handler 里 nudge play() 即使是静音状态也
    // 能把 ctx unlocked，后面取消静音就直接出声。
    ensureCtx();
    if (muted) return;
    switch (id) {
      case "fire":
        sweepTone("square", 220, 80, 0.08, 0.22);
        return;
      case "hit":
        noiseBurst(0.06, 0.2);
        tone("square", 80, 0.06, 0.005, 0.04);
        return;
      case "explodeSmall":
        noiseBurst(0.18, 0.3);
        return;
      case "explodeBig":
        noiseBurst(0.5, 0.35);
        sweepTone("triangle", 220, 50, 0.45, 0.2);
        return;
      case "pickup":
        arpeggio([523, 659, 784], 0.06, 0.18);
        return;
      case "powerup":
        arpeggio([392, 523, 659, 784, 1047], 0.07, 0.18);
        return;
      case "stageStart":
        arpeggio([523, 659, 784], 0.12, 0.2);
        return;
      case "gameOver":
        sweepTone("square", 400, 80, 0.9, 0.22);
        return;
      case "pause":
        tone("square", 660, 0.08, 0.005, 0.05);
        return;
      case "idle":
        return;
      case "move":
        return; // 通过 setMoveActive 控制
    }
  }

  function setMoveActive(on: boolean): void {
    // 短路：状态没变就别再 cancelScheduledValues + linearRampToValueAtTime
    // 一遍。引擎每个 tick 都喊一次 setMoveActive(false)（非 playing 状态），
    // 已经 false 还重排一次 gain ramp 是纯浪费 — RAF 频率下尤其明显。
    if (moveActive === on) return;
    moveActive = on;
    ensureMoveOsc();
    applyMoveGain();
  }

  function setMuted(b: boolean): void {
    muted = b;
    applyMoveGain();
  }

  function dispose(): void {
    try {
      if (moveOsc) {
        moveOsc.stop();
        moveOsc.disconnect();
      }
      if (moveGain) moveGain.disconnect();
      moveOsc = null;
      moveGain = null;
      if (ctx) void ctx.close();
      ctx = null;
    } catch {
      /* ignore */
    }
  }

  return { play, setMoveActive, setMuted, dispose };
}
