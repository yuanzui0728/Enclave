import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { drawWorld } from "./tank-war-renderer";
import {
  createWorld,
  emptyInput,
  isGameOver,
  isStageBeaten,
  setMuted as engineSetMuted,
  startStage,
  tick,
  togglePause,
} from "./tank-war-engine";
import type {
  GameWorld,
  HudSnapshot,
  InputState,
  PlayerMode,
} from "./tank-war-types";
import { createSfx, type Sfx } from "./tank-war-audio";
import { loadPersist, savePersist, type TankWarPersist } from "./tank-war-storage";
import type { SpriteSheet } from "./tank-war-bake-sprites";

type Options = {
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  getSprites: () => SpriteSheet | null;
};

export type WorldControls = {
  start: (mode: PlayerMode, stage: number) => void;
  resume: () => void;
  restart: () => void;
  toggleMute: () => void;
  togglePause: () => void;
};

export type UseTankWarWorldResult = {
  hud: HudSnapshot;
  controls: WorldControls;
  inputRef: React.MutableRefObject<InputState>;
};

export function useTankWarWorld(opts: Options): UseTankWarWorldResult {
  const worldRef = useRef<GameWorld>(createWorld());
  const inputRef = useRef<InputState>(emptyInput());
  const sfxRef = useRef<Sfx | null>(null);
  const persistRef = useRef<TankWarPersist>(loadPersist());
  const rafRef = useRef<number | null>(null);
  const stageClearHandledAt = useRef<number | null>(null);
  const gameOverSavedRef = useRef(false);

  // 调用方每次 render 都会传新的 `getSprites: () => spritesRef.current` 字面量，
  // 如果 RAF effect deps 直接读 opts.getSprites，每个 setHud (120ms) 都会
  // cancel + restart RAF，frame 卡顿且 lastTs 漂移。把 opts 缓在 ref 里，RAF
  // effect 走空 deps 只跑一次。
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const [hud, setHud] = useState<HudSnapshot>(() =>
    snapshot(worldRef.current, persistRef.current),
  );

  // 初始化 sfx
  useEffect(() => {
    sfxRef.current = createSfx();
    sfxRef.current.setMuted(persistRef.current.muted);
    worldRef.current.muted = persistRef.current.muted;
    return () => {
      sfxRef.current?.dispose();
      sfxRef.current = null;
    };
  }, []);

  // RAF loop
  useEffect(() => {
    let lastTs = performance.now();
    const loop = (ts: number) => {
      lastTs = ts;
      const world = worldRef.current;
      const sheet = optsRef.current.getSprites();
      // tick when playing
      tick(world, inputRef.current, sfxRef.current);

      // 关卡通关：立即写解锁记录。原版用 STAGE_CLEAR_MS (2.2s) 延迟才 savePersist，
      // 但用户在 stage-clear 动画里点 "下一关" / "再来一局" 会让 status 跳出
      // stage-clear，下一帧落进 else 分支把 ref 清零、unlock 永远不会触发——
      // 进度回滚 bug。STAGE_CLEAR_MS 现在只是 UI 转场时长，跟存档无关。
      if (isStageBeaten(world)) {
        if (stageClearHandledAt.current === null) {
          stageClearHandledAt.current = world.stageClearAt ?? performance.now();
          const next = Math.min(35, world.stage + 1);
          if (next > persistRef.current.maxUnlockedStage) {
            persistRef.current.maxUnlockedStage = next;
            savePersist(persistRef.current);
          }
        }
      } else {
        stageClearHandledAt.current = null;
      }

      if (isGameOver(world)) {
        if (!gameOverSavedRef.current) {
          persistRef.current.highScoreP1 = Math.max(
            persistRef.current.highScoreP1,
            world.scoreP1,
          );
          persistRef.current.highScoreP2 = Math.max(
            persistRef.current.highScoreP2,
            world.scoreP2,
          );
          savePersist(persistRef.current);
          gameOverSavedRef.current = true;
        }
      } else {
        gameOverSavedRef.current = false;
      }

      const canvas = optsRef.current.canvasRef.current;
      if (canvas && sheet) {
        const ctx = canvas.getContext("2d", { alpha: false });
        if (ctx) {
          ctx.imageSmoothingEnabled = false;
          drawWorld(ctx, world, sheet);
        }
      }

      rafRef.current = window.requestAnimationFrame(loop);
    };
    rafRef.current = window.requestAnimationFrame(loop);
    return () => {
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
    void lastTs;
  }, []);

  // HUD 投影 — 每 120ms 拍一次快照，只在内容真的变了才 setState；
  // 否则 React 每秒做 8 次空 reconcile（boot/paused/stage-clear 静止
  // 场景尤其浪费）。setHud 接 prev => 比较，避免外面再缓存一份 lastRef。
  useEffect(() => {
    const id = window.setInterval(() => {
      const next = snapshot(worldRef.current, persistRef.current);
      setHud((prev) => (hudEqual(prev, next) ? prev : next));
    }, 120);
    return () => window.clearInterval(id);
  }, []);

  // visibility 暂停
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === "hidden") {
        if (worldRef.current.status === "playing") {
          togglePause(worldRef.current, sfxRef.current);
        }
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  // pauseToggle 是 keydown 置 true 的一次性请求信号；这里轮询消费并立刻清零，
  // 让下一次按 P/Esc 又能触发一次 togglePause。不要用边沿检测——前一版用 cur && !last
  // 配合 keydown 翻转 pauseToggle，第二次按下相当于把信号写成下降沿，被 poller 吞掉。
  // 触发后立刻 setHud：HUD 投影的 setInterval 是 120ms 一拍，按 P 后"暂停 / 继续"
  // 文字翻转有最高 120ms 延迟 — 玩家以为按键没生效又按一下，被吞掉一次。
  useEffect(() => {
    const id = window.setInterval(() => {
      if (inputRef.current.pauseToggle) {
        inputRef.current.pauseToggle = false;
        togglePause(worldRef.current, sfxRef.current);
        setHud(snapshot(worldRef.current, persistRef.current));
      }
    }, 50);
    return () => window.clearInterval(id);
  }, []);

  // iOS Safari 要求 AudioContext 在 user gesture 里 resume 才能出声。引擎里
  // 第一声 audio.play 来自 RAF 的 fireBullet —— 那不算 gesture，于是 ctx 一直
  // suspended，整局都是哑的，要等用户去点 pause 按钮（pause 路径在 togglePause
  // 里直接调 audio.play）才会"解锁"。这里在 onClick 起的 start/resume/restart
  // 里 nudge 一下 audio.play("stageStart")，第一次按"开始游戏"就把 ctx 解锁。
  const nudgeAudio = (id: "stageStart" | "pause") => {
    sfxRef.current?.play(id);
  };

  const start = useCallback((mode: PlayerMode, stage: number) => {
    const w = worldRef.current;
    startStage(w, stage, mode, { resetLives: true, resetScores: true });
    setHud(snapshot(w, persistRef.current));
    nudgeAudio("stageStart");
  }, []);

  const resume = useCallback(() => {
    const w = worldRef.current;
    if (w.status === "stage-clear") {
      const next = Math.min(35, w.stage + 1);
      startStage(w, next, w.mode);
      setHud(snapshot(w, persistRef.current));
      nudgeAudio("stageStart");
    } else if (w.status === "paused") {
      togglePause(w, sfxRef.current);
    }
  }, []);

  const restart = useCallback(() => {
    const w = worldRef.current;
    startStage(w, 1, w.mode, { resetLives: true, resetScores: true });
    setHud(snapshot(w, persistRef.current));
    nudgeAudio("stageStart");
  }, []);

  const toggleMute = useCallback(() => {
    const next = !persistRef.current.muted;
    persistRef.current.muted = next;
    savePersist(persistRef.current);
    engineSetMuted(worldRef.current, sfxRef.current, next);
    setHud(snapshot(worldRef.current, persistRef.current));
    // 从 muted -> unmuted 时 nudge 一下，让 ctx 在 gesture 里 resume，否则
    // 用户保留静音存档启动后取消静音，下一发子弹的 fire 是 RAF 调的、不会
    // 把 ctx 唤醒，要等到点 pause 按钮才有声。
    if (!next) nudgeAudio("pause");
  }, []);

  const togglePauseCb = useCallback(() => {
    togglePause(worldRef.current, sfxRef.current);
    // 同步刷新 HUD：按钮 onClick 不能等 120ms 投影才换文字（按下后用户看
    // 「继续 / 暂停」label 没变 → 再按一次 → 实际触发了第二次 togglePause）。
    setHud(snapshot(worldRef.current, persistRef.current));
  }, []);

  const controls = useMemo<WorldControls>(
    () => ({
      start,
      resume,
      restart,
      toggleMute,
      togglePause: togglePauseCb,
    }),
    [start, resume, restart, toggleMute, togglePauseCb],
  );

  return { hud, controls, inputRef };
}

function hudEqual(a: HudSnapshot, b: HudSnapshot): boolean {
  return (
    a.status === b.status &&
    a.mode === b.mode &&
    a.stage === b.stage &&
    a.lives === b.lives &&
    a.livesP2 === b.livesP2 &&
    a.enemyRemaining === b.enemyRemaining &&
    a.score === b.score &&
    a.scoreP2 === b.scoreP2 &&
    a.muted === b.muted &&
    a.maxUnlockedStage === b.maxUnlockedStage
  );
}

function snapshot(world: GameWorld, persist: TankWarPersist): HudSnapshot {
  return {
    status: world.status,
    mode: world.mode,
    stage: world.stage,
    lives: world.livesP1,
    livesP2: world.mode === "two-player" ? world.livesP2 : undefined,
    enemyRemaining: Math.max(
      0,
      world.enemyQueue.length -
        world.spawnCursor +
        world.tanks.filter((t) => t.owner === "enemy").length,
    ),
    score: world.scoreP1,
    scoreP2: world.mode === "two-player" ? world.scoreP2 : undefined,
    muted: world.muted || persist.muted,
    maxUnlockedStage: persist.maxUnlockedStage,
  };
}
