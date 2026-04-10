import { Injectable } from '@nestjs/common';

type ProviderSessionInput = {
  sessionId: string;
  characterName: string;
  posterUrl?: string;
};

type ProviderTurnInput = {
  sessionId: string;
  assistantAudioUrl: string;
  assistantText: string;
  assistantMessageId: string;
  posterUrl?: string;
};

type ProviderSessionPayload = {
  provider: 'mock_digital_human';
  presentationMode: 'provider_stream';
  transport: 'player_url';
  playerUrl: string;
  streamUrl?: string;
  posterUrl?: string;
  capabilities: {
    supportsRealtimeStream: false;
    supportsInterrupt: false;
    supportsSubtitle: true;
  };
};

type ProviderTurnPayload = {
  renderStatus: 'ready';
} & ProviderSessionPayload;

export interface DigitalHumanProviderAdapter {
  createSession(input: ProviderSessionInput): ProviderSessionPayload;
  prepareTurn(input: ProviderTurnInput): ProviderTurnPayload;
  renderPlayerPage(input: {
    sessionId: string;
    characterName: string;
  }): string;
}

@Injectable()
export class MockDigitalHumanProviderAdapter
  implements DigitalHumanProviderAdapter
{
  createSession(input: ProviderSessionInput): ProviderSessionPayload {
    return {
      provider: 'mock_digital_human',
      presentationMode: 'provider_stream',
      transport: 'player_url',
      playerUrl: this.buildPlayerUrl(input.sessionId),
      streamUrl: undefined,
      posterUrl: input.posterUrl,
      capabilities: {
        supportsRealtimeStream: false,
        supportsInterrupt: false,
        supportsSubtitle: true,
      },
    };
  }

  prepareTurn(input: ProviderTurnInput): ProviderTurnPayload {
    return {
      ...this.createSession({
        sessionId: input.sessionId,
        characterName: input.assistantText,
        posterUrl: input.posterUrl,
      }),
      renderStatus: 'ready',
    };
  }

  renderPlayerPage(input: { sessionId: string; characterName: string }) {
    const escapedName = escapeHtml(input.characterName || 'AI 数字人');

    return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapedName}</title>
    <style>
      :root {
        color-scheme: dark;
      }
      * {
        box-sizing: border-box;
      }
      html, body {
        margin: 0;
        height: 100%;
        font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
        background:
          radial-gradient(circle at top, rgba(52, 211, 153, 0.18), transparent 30%),
          linear-gradient(180deg, #111827 0%, #0f172a 48%, #020617 100%);
        color: #fff;
      }
      body {
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }
      .stage {
        position: relative;
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-direction: column;
        gap: 18px;
        padding: 24px;
        text-align: center;
      }
      .halo {
        position: absolute;
        inset: 18% auto auto 50%;
        width: 280px;
        height: 280px;
        transform: translateX(-50%);
        border-radius: 999px;
        background: radial-gradient(circle, rgba(59, 130, 246, 0.24), transparent 68%);
        filter: blur(32px);
        pointer-events: none;
      }
      .portrait {
        position: relative;
        width: 232px;
        height: 232px;
        border-radius: 999px;
        overflow: hidden;
        border: 1px solid rgba(255, 255, 255, 0.14);
        background: linear-gradient(180deg, rgba(30, 41, 59, 0.96), rgba(15, 23, 42, 0.98));
        box-shadow: 0 26px 80px rgba(2, 6, 23, 0.46);
      }
      .portrait img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: none;
      }
      .portrait[data-has-poster="true"] img {
        display: block;
      }
      .fallback {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 64px;
        font-weight: 700;
        color: rgba(255, 255, 255, 0.86);
      }
      .portrait[data-has-poster="true"] .fallback {
        display: none;
      }
      .title {
        font-size: 30px;
        font-weight: 700;
        letter-spacing: 0.01em;
      }
      .subtitle {
        max-width: 560px;
        font-size: 14px;
        line-height: 1.8;
        color: rgba(255, 255, 255, 0.72);
      }
      .pill {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        min-height: 42px;
        padding: 0 16px;
        border-radius: 999px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        background: rgba(255, 255, 255, 0.08);
      }
      .bars {
        display: flex;
        align-items: flex-end;
        gap: 4px;
      }
      .bar {
        width: 6px;
        height: 10px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.28);
        transition: all 160ms ease;
      }
      body[data-playing="true"] .bar {
        animation: bounce 1s ease-in-out infinite;
        background: #34d399;
      }
      body[data-playing="true"] .bar:nth-child(2) {
        animation-delay: 120ms;
      }
      body[data-playing="true"] .bar:nth-child(3) {
        animation-delay: 240ms;
      }
      .caption {
        max-width: 720px;
        min-height: 52px;
        padding: 14px 18px;
        border-radius: 20px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        background: rgba(2, 6, 23, 0.36);
        font-size: 15px;
        line-height: 1.7;
        color: rgba(255, 255, 255, 0.88);
      }
      audio {
        display: none;
      }
      @keyframes bounce {
        0%, 100% { height: 10px; }
        50% { height: 28px; }
      }
    </style>
  </head>
  <body data-playing="false">
    <div class="stage">
      <div class="halo"></div>
      <div id="portrait" class="portrait" data-has-poster="false">
        <img id="poster" alt="${escapedName}" />
        <div class="fallback">${escapeHtml(escapedName.slice(0, 1) || 'AI')}</div>
      </div>
      <div class="title">${escapedName}</div>
      <div id="subtitle" class="subtitle">正在连接数字人播放器，等待本轮播报内容。</div>
      <div class="pill">
        <div class="bars">
          <span class="bar"></span>
          <span class="bar"></span>
          <span class="bar"></span>
        </div>
        <span id="stateLabel">数字人待命中</span>
      </div>
      <div id="caption" class="caption">接通后，数字人的本轮回复会在这里同步显示。</div>
    </div>
    <audio id="audio" preload="auto"></audio>
    <script>
      const audio = document.getElementById("audio");
      const poster = document.getElementById("poster");
      const portrait = document.getElementById("portrait");
      const caption = document.getElementById("caption");
      const subtitle = document.getElementById("subtitle");
      const stateLabel = document.getElementById("stateLabel");
      const sessionPath = window.location.pathname.replace(/\\/player$/, "");
      let lastMessageId = "";
      let pollTimer = null;

      function setPlaying(playing) {
        document.body.dataset.playing = playing ? "true" : "false";
        stateLabel.textContent = playing ? "数字人播报中" : "数字人待命中";
      }

      function updatePoster(nextPosterUrl) {
        if (!nextPosterUrl) {
          portrait.dataset.hasPoster = "false";
          poster.removeAttribute("src");
          return;
        }

        portrait.dataset.hasPoster = "true";
        if (poster.src !== nextPosterUrl) {
          poster.src = nextPosterUrl;
        }
      }

      async function refreshSession() {
        try {
          const response = await fetch(sessionPath, { cache: "no-store" });
          if (!response.ok) {
            throw new Error("load session failed");
          }

          const session = await response.json();
          updatePoster(session.posterUrl);

          if (session.lastTurn?.assistantText) {
            caption.textContent = session.lastTurn.assistantText;
            subtitle.textContent = "当前播放器协议已接通，数字人会在这里自动播报最新一轮回复。";
          } else {
            caption.textContent = "接通后，数字人的本轮回复会在这里同步显示。";
            subtitle.textContent = "正在连接数字人播放器，等待本轮播报内容。";
          }

          if (session.lastTurn?.assistantMessageId && session.lastTurn.assistantMessageId !== lastMessageId) {
            lastMessageId = session.lastTurn.assistantMessageId;
            if (session.lastTurn.assistantAudioUrl) {
              audio.src = session.lastTurn.assistantAudioUrl;
              audio.currentTime = 0;
              audio.play().catch(() => {});
            }
          }
        } catch {
          subtitle.textContent = "播放器暂时无法同步最新数字人状态。";
        }
      }

      audio.addEventListener("play", () => setPlaying(true));
      audio.addEventListener("pause", () => setPlaying(false));
      audio.addEventListener("ended", () => setPlaying(false));
      audio.addEventListener("error", () => setPlaying(false));

      refreshSession();
      pollTimer = window.setInterval(refreshSession, 1200);
      window.addEventListener("beforeunload", () => {
        if (pollTimer) {
          window.clearInterval(pollTimer);
        }
      });
    </script>
  </body>
</html>`;
  }

  private buildPlayerUrl(sessionId: string) {
    return `/api/chat/digital-human-calls/sessions/${sessionId}/player`;
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
