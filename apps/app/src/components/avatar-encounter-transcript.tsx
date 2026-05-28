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
};

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
}: AvatarEncounterTranscriptProps) {
  const t = useRuntimeTranslator();

  return (
    <section className="space-y-3">
      {/* 匿名对方画像卡：昵称 + 一句画像简介 + 为什么匹配上你。 */}
      <div className="rounded-[16px] border border-[color:var(--brand-primary)]/16 bg-[color:var(--surface-card)] px-4 py-3.5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-[color:var(--brand-soft)] text-[color:var(--brand-primary)]">
            <UserRound size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold text-[color:var(--text-primary)]">
              {partner.nickname}
            </div>
            {partner.personaBlurb ? (
              <div className="mt-0.5 text-[12px] leading-5 text-[color:var(--text-secondary)]">
                {partner.personaBlurb}
              </div>
            ) : null}
          </div>
        </div>
        {partner.matchReason ? (
          <div className="mt-2.5 rounded-[12px] bg-[color-mix(in_srgb,var(--brand-primary)_6%,transparent)] px-3 py-2 text-[12px] leading-5 text-[color:var(--brand-primary)]">
            {t(msg`匹配理由`)}：{partner.matchReason}
          </div>
        ) : null}
      </div>

      {summary ? (
        <div className="text-center text-[12px] leading-5 text-[color:var(--text-muted)]">
          {summary}
        </div>
      ) : null}

      {/* 对话气泡：mine 右对齐（--brand-soft 蜜橙底），theirs 左对齐（白底 + 浅边框）。 */}
      <div className="space-y-2.5">
        {turns.map((turn, index) => {
          const isMine = turn.speaker === "mine";
          return (
            <div
              key={index}
              className={cn(
                "flex",
                isMine ? "justify-end" : "justify-start",
              )}
            >
              <div
                className={cn(
                  "max-w-[78%] whitespace-pre-wrap break-words rounded-[18px] px-3.5 py-2.5 text-[13px] leading-6",
                  isMine
                    ? "bg-[color:var(--brand-soft)] text-[color:var(--text-primary)]"
                    : "border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] text-[color:var(--text-primary)]",
                )}
              >
                {turn.text}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
