import { useEffect, useState } from "react";
import { msg } from "@lingui/macro";
import { UserRound } from "lucide-react";
import type {
  AvatarEncounterPartner,
  AvatarEncounterTurn,
} from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { cn } from "@yinjie/ui";

type AvatarEncounterTranscriptProps = {
  summary: string;
  turns: AvatarEncounterTurn[];
  partner: AvatarEncounterPartner;
  // 初次相遇时一来一回逐条揭示（带「正在输入」指示器），让等待像真的在聊；
  // 查看历史相遇 / 续聊回看时不传 → 即时全量渲染，不重播。
  revealProgressively?: boolean;
};

// 揭示节奏：首条略等一下，之后每条之间停顿，模拟一来一回。
const REVEAL_FIRST_DELAY_MS = 360;
const REVEAL_STEP_MS = 880;

// 「对方正在输入」三点跳动。
function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-[color:var(--text-dim)]"
          style={{ animationDelay: `${i * 0.16}s` }}
        />
      ))}
    </span>
  );
}

// 分身相遇脚本：一段匿名对方画像头部 + 多轮气泡。turns[].speaker 已经是
// **相对查看者**视角（"mine" = 自己分身，"theirs" = 对方分身），后端按请求者
// 身份翻译过，前端不再二次映射。
// 隐私红线：matched 之前对方始终匿名——这里只渲染 partner.nickname（昵称伪名）
// + personaBlurb + matchReason，绝不渲染真名/头像/联系方式（contact 由调用方
// 在 status==='matched' 时单独披露，不进这个组件）。
export function AvatarEncounterTranscript({
  summary,
  turns,
  partner,
  revealProgressively = false,
}: AvatarEncounterTranscriptProps) {
  const t = useRuntimeTranslator();

  // 逐条揭示：visibleCount 从 0 增到 turns.length；typing 表示下一条还在「输入中」。
  // 非渐进（默认）直接全量。turns 引用稳定（来自 react-query 缓存的 session/view），
  // 依赖它只在首次拿到脚本时跑一次。
  const [visibleCount, setVisibleCount] = useState(
    revealProgressively ? 0 : turns.length,
  );
  const [typing, setTyping] = useState(false);

  useEffect(() => {
    if (!revealProgressively) {
      setVisibleCount(turns.length);
      setTyping(false);
      return;
    }
    setVisibleCount(0);
    setTyping(turns.length > 0);
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < turns.length; i += 1) {
      timers.push(
        setTimeout(
          () => {
            setVisibleCount(i + 1);
            setTyping(i + 1 < turns.length);
          },
          REVEAL_FIRST_DELAY_MS + i * REVEAL_STEP_MS,
        ),
      );
    }
    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, [turns, revealProgressively]);

  const visibleTurns = turns.slice(0, visibleCount);
  const nextSpeaker = turns[visibleCount]?.speaker;

  return (
    <section className="space-y-3">
      {/* 匿名对方画像卡：昵称 + 一句画像简介 + 为什么匹配上你。 */}
      <div className="rounded-[var(--radius-md)] border border-[color:var(--brand-primary)]/16 bg-[color:var(--surface-card)] px-4 py-3.5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-[color:var(--brand-soft)] text-[color:var(--brand-primary)]">
            <UserRound size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[length:var(--text-base)] font-semibold text-[color:var(--text-primary)]">
              {partner.nickname}
            </div>
            {partner.personaBlurb ? (
              <div className="mt-0.5 text-[length:var(--text-caption)] leading-5 text-[color:var(--text-secondary)]">
                {partner.personaBlurb}
              </div>
            ) : null}
          </div>
        </div>
        {partner.matchReason ? (
          <div className="mt-2.5 rounded-[var(--radius-sm)] bg-[color-mix(in_srgb,var(--brand-primary)_6%,transparent)] px-3 py-2 text-[length:var(--text-caption)] leading-5 text-[color:var(--brand-primary)]">
            {t(msg`匹配理由`)}：{partner.matchReason}
          </div>
        ) : null}
      </div>

      {summary ? (
        <div className="text-center text-[length:var(--text-caption)] leading-5 text-[color:var(--text-muted)]">
          {summary}
        </div>
      ) : null}

      {/* 对话气泡：mine 右对齐（--brand-soft 蜜橙底），theirs 左对齐（白底 + 浅边框）。
          多轮续聊时在轮次切换处插「继续聊」分隔线（turn.round 缺省视为单轮，向后兼容）。 */}
      <div className="space-y-2.5">
        {visibleTurns.map((turn, index) => {
          const isMine = turn.speaker === "mine";
          const prevRound = index > 0 ? turns[index - 1]?.round : undefined;
          const showDivider =
            typeof turn.round === "number" &&
            turn.round > 1 &&
            turn.round !== prevRound;
          return (
            <div key={index}>
              {showDivider ? (
                <div className="my-2 flex items-center gap-2 px-1 text-[length:var(--text-eyebrow)] text-[color:var(--text-muted)]">
                  <span className="h-px flex-1 bg-[color:var(--border-faint)]" />
                  {t(msg`继续聊`)}
                  <span className="h-px flex-1 bg-[color:var(--border-faint)]" />
                </div>
              ) : null}
              <div
                className={cn(
                  "flex",
                  isMine ? "justify-end" : "justify-start",
                )}
              >
                <div
                  className={cn(
                    "max-w-[78%] whitespace-pre-wrap break-words rounded-[18px] px-3.5 py-2.5 text-[length:var(--text-caption)] leading-6",
                    isMine
                      ? "bg-[color:var(--brand-soft)] text-[color:var(--text-primary)]"
                      : "border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] text-[color:var(--text-primary)]",
                  )}
                >
                  {turn.text}
                </div>
              </div>
            </div>
          );
        })}

        {/* 下一条还在「输入中」：在对应说话人一侧显示三点跳动气泡。 */}
        {typing ? (
          <div
            className={cn(
              "flex",
              nextSpeaker === "mine" ? "justify-end" : "justify-start",
            )}
          >
            <div
              className={cn(
                "rounded-[18px] px-3.5 py-3",
                nextSpeaker === "mine"
                  ? "bg-[color:var(--brand-soft)]"
                  : "border border-[color:var(--border-faint)] bg-[color:var(--surface-card)]",
              )}
            >
              <TypingDots />
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
