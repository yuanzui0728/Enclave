import { useEffect, useMemo, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import { translateRuntimeMessage } from "@yinjie/i18n";
import {
  fetchCommunityGameArtifact,
  listGamePlayCharacters,
  requestGameAiTurn,
  type GamePlayCharacter,
} from "@yinjie/contracts";

const t = translateRuntimeMessage;
import {
  buildGameSrcDoc,
  isBridgeEnvelope,
  postToGame,
} from "./game-bridge";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; html: string };

/**
 * 在隐界 App 里安全运行一个 embedded_web 社区游戏。
 * - 拉产物 HTML（cloud-api 全局板块）+ 当前世界可陪玩角色（world child）。
 * - 合成 srcdoc（CSP + in-game SDK + html）塞进 sandbox iframe（无 same-origin）。
 * - 监听桥消息：AI_TURN → requestGameAiTurn（world AI，按角色口吻回应）。
 */
export function EmbeddedGameHost({
  gameId,
  playerName,
  onExit,
}: {
  gameId: string;
  playerName?: string;
  onExit?: () => void;
}) {
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const charactersRef = useRef<GamePlayCharacter[]>([]);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const inFlightRef = useRef(false);

  // 拉产物 + 角色列表。
  useEffect(() => {
    let alive = true;
    setLoad({ status: "loading" });
    (async () => {
      try {
        const [artifact, characters] = await Promise.all([
          fetchCommunityGameArtifact(gameId),
          listGamePlayCharacters(gameId).catch(() => [] as GamePlayCharacter[]),
        ]);
        if (!alive) return;
        charactersRef.current = Array.isArray(characters) ? characters : [];
        setLoad({ status: "ready", html: buildGameSrcDoc(artifact.html) });
      } catch (err) {
        if (!alive) return;
        setLoad({
          status: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    })();
    return () => {
      alive = false;
    };
  }, [gameId]);

  // 桥消息路由。
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      const frame = iframeRef.current;
      // opaque origin 下 origin 为 "null"，只能靠 source 身份校验。
      if (!frame || e.source !== frame.contentWindow) return;
      const data = e.data;
      if (!isBridgeEnvelope(data)) return;
      const win = frame.contentWindow;
      if (!win) return;

      switch (data.type) {
        case "READY":
          postToGame(win, data.id, "INIT", {
            gameId,
            locale: "zh-CN",
            characters: charactersRef.current,
            player: { displayName: playerName ?? "玩家" }, // i18n-ignore-line: 玩家名占位，内嵌游戏固定 zh-CN 运行
          });
          break;
        case "LIST_CHARACTERS":
          postToGame(win, data.id, "CHARACTERS", {
            characters: charactersRef.current,
          });
          break;
        case "AI_TURN":
          void handleAiTurn(win, data.id, data.payload);
          break;
        case "REPORT_SCORE":
          // v1：分数仅本地（排行榜留 Phase 5）。回 ACK 让游戏继续。
          postToGame(win, data.id, "SCORE_ACK", { ok: true });
          break;
        case "REQUEST_EXIT":
          onExit?.();
          break;
        default:
          break;
      }
    }

    async function handleAiTurn(win: Window, id: string, payload: unknown) {
      const opts = (payload ?? {}) as {
        prompt?: string;
        characterId?: string;
        context?: string;
        history?: { role: "user" | "assistant"; content: string }[];
        maxTokens?: number;
      };
      if (!opts.prompt || typeof opts.prompt !== "string") {
        postToGame(win, id, "AI_TURN_ERROR", {
          id,
          code: "BAD_REQUEST",
          message: "prompt is required", // i18n-ignore-line: 内部协议错误英文，非展示
        });
        return;
      }
      // 串行：一次只跑一个 AI 回合，防游戏刷爆配额。
      if (inFlightRef.current) {
        postToGame(win, id, "AI_TURN_ERROR", {
          id,
          code: "BUSY",
          message: "上一回合还在进行", // i18n-ignore-line: 游戏桥接错误，内嵌游戏固定 zh-CN 运行
        });
        return;
      }
      inFlightRef.current = true;
      try {
        const res = await requestGameAiTurn(gameId, {
          prompt: opts.prompt,
          characterId: opts.characterId,
          context: opts.context,
          history: opts.history,
          maxTokens: opts.maxTokens,
        });
        postToGame(win, id, "AI_TURN_RESULT", { id, ...res });
      } catch (err) {
        postToGame(win, id, "AI_TURN_ERROR", {
          id,
          code: "UNKNOWN",
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        inFlightRef.current = false;
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [gameId, playerName, onExit]);

  const srcDoc = useMemo(
    () => (load.status === "ready" ? load.html : ""),
    [load],
  );

  if (load.status === "loading") {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-white/70">
        {t(msg`正在载入游戏…`)}
      </div>
    );
  }
  if (load.status === "error") {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-white/70">
        <div>{t(msg`游戏载入失败`)}</div>
        <div className="text-xs text-white/40">{load.message}</div>
      </div>
    );
  }
  return (
    <iframe
      ref={iframeRef}
      title="game" // i18n-ignore-line: iframe 通用标题
      srcDoc={srcDoc}
      sandbox="allow-scripts allow-pointer-lock"
      referrerPolicy="no-referrer"
      allow="autoplay; gamepad; fullscreen"
      className="h-full w-full"
      style={{ border: 0, background: "#000" }}
    />
  );
}
