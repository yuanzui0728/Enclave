import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { msg } from "@lingui/macro";
import { LoaderCircle, Sparkles, X } from "lucide-react";
import {
  getCyberAvatarSelfAnalysis,
  isApiRequestError,
  type CyberAvatarSelfAnalysisReport,
  type CyberAvatarSelfProfile,
} from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { InlineNotice, cn } from "@yinjie/ui";
import { translateAppErrorCode } from "../../lib/error-translate";

type Props = {
  open: boolean;
  onClose: () => void;
  profile: CyberAvatarSelfProfile;
  baseUrl: string | undefined;
};

// 「结论报告」底部 sheet：把分身的画像凝练成一份叙事化自我报告（性格速写/优势/盲点/
// 行为模式/社交风格/建议）。原始分析仪表盘（信号数/置信度/数据来源）只在管理后台可见，
// 不再暴露给用户——这里只留有情感价值的成稿报告。
export function CyberAvatarReportSheet({
  open,
  onClose,
  profile,
  baseUrl,
}: Props) {
  const t = useRuntimeTranslator();
  const queryClient = useQueryClient();

  // 报告缓存进 react-query：sheet 关掉再打开、组件卸载重挂都不丢报告，省一次 LLM 重生成。
  const [report, setReport] = useState<CyberAvatarSelfAnalysisReport | null>(
    () =>
      queryClient.getQueryData<CyberAvatarSelfAnalysisReport>([
        "cyber-avatar-analysis",
        baseUrl,
      ]) ?? null,
  );

  const analysisMutation = useMutation({
    mutationFn: () => getCyberAvatarSelfAnalysis(baseUrl),
    onSuccess: (data) => {
      setReport(data);
      queryClient.setQueryData(["cyber-avatar-analysis", baseUrl], data);
    },
  });

  if (!open) {
    return null;
  }

  // 信号为 0 时分身还没素材，生成只会得到空报告——直接给温和引导，别让用户白点一次。
  const noData = profile.signalCount === 0;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-[rgba(17,24,39,0.42)]">
      <button
        type="button"
        aria-label={t(msg`关闭结论报告`)}
        onClick={onClose}
        className="absolute inset-0"
      />
      <div className="relative max-h-[82vh] overflow-y-auto rounded-t-[22px] bg-[color:var(--surface-card)] pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] shadow-[0_-12px_32px_rgba(60,40,110,0.16)]">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-5 py-4">
          <div className="flex items-center gap-2 text-[length:var(--text-title)] font-medium text-[color:var(--text-primary)]">
            <Sparkles size={18} className="text-[color:var(--brand-primary)]" />
            {t(msg`结论报告`)}
          </div>
          <button
            type="button"
            aria-label={t(msg`关闭`)}
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-[color:var(--text-muted)] active:bg-black/5"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          {noData ? (
            <InlineNotice
              className="rounded-[12px] px-3 py-2 text-[12px] leading-5 shadow-none"
              tone="info"
              role="status"
            >
              {t(msg`数据还不够，先去世界里多聊聊、发发动态，再回来生成专属报告。`)}
            </InlineNotice>
          ) : (
            <>
              {/* 生成 / 重新生成结论报告。 */}
              <button
                type="button"
                onClick={() => analysisMutation.mutate()}
                disabled={analysisMutation.isPending}
                aria-busy={analysisMutation.isPending || undefined}
                className={cn(
                  "flex h-12 w-full items-center justify-center gap-2 rounded-[16px] bg-[linear-gradient(135deg,var(--brand-primary),var(--brand-secondary))] text-[14px] font-semibold text-[color:var(--text-on-brand)] transition-opacity active:opacity-90",
                  analysisMutation.isPending && "opacity-60",
                )}
              >
                {analysisMutation.isPending ? (
                  <>
                    <LoaderCircle size={16} className="animate-spin" />
                    {t(msg`正在生成结论…`)}
                  </>
                ) : (
                  <>
                    <Sparkles size={16} />
                    {report ? t(msg`重新生成结论`) : t(msg`生成结论报告`)}
                  </>
                )}
              </button>

              {analysisMutation.isError &&
              analysisMutation.error instanceof Error ? (
                <InlineNotice
                  className="rounded-[12px] px-3 py-2 text-[12px] leading-5 shadow-none"
                  tone="danger"
                  role="alert"
                >
                  {(isApiRequestError(analysisMutation.error)
                    ? translateAppErrorCode(analysisMutation.error)
                    : null) ?? analysisMutation.error.message}
                </InlineNotice>
              ) : null}

              {report ? (
                <div className="space-y-3">
                  {report.headline ? (
                    <div className="rounded-[16px] border border-[rgba(124,91,217,0.18)] bg-[linear-gradient(180deg,rgba(244,241,251,0.96),rgba(255,255,255,0.96))] px-4 py-3.5 text-[14px] font-semibold leading-6 text-[color:var(--text-primary)]">
                      {report.headline}
                    </div>
                  ) : null}
                  {report.personalitySummary ? (
                    <ReportCard title={t(msg`性格速写`)}>
                      <p className="text-[13px] leading-6 text-[color:var(--text-primary)]">
                        {report.personalitySummary}
                      </p>
                    </ReportCard>
                  ) : null}
                  <ReportList title={t(msg`优势`)} items={report.strengths} />
                  <ReportList title={t(msg`盲点`)} items={report.blindSpots} />
                  <ReportList
                    title={t(msg`行为模式`)}
                    items={report.recurringPatterns}
                  />
                  {report.socialStyle ? (
                    <ReportCard title={t(msg`社交风格`)}>
                      <p className="text-[13px] leading-6 text-[color:var(--text-primary)]">
                        {report.socialStyle}
                      </p>
                    </ReportCard>
                  ) : null}
                  <ReportList title={t(msg`建议`)} items={report.suggestions} />
                  {report.caveat ? (
                    <p className="px-1 text-[11px] leading-5 text-[color:var(--text-muted)]">
                      {report.caveat}
                    </p>
                  ) : null}
                </div>
              ) : !analysisMutation.isPending ? (
                <p className="px-1 text-center text-[12px] leading-5 text-[color:var(--text-muted)]">
                  {t(msg`生成一份基于你全部互动的自我画像报告。`)}
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ReportCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[16px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-3.5">
      <div className="mb-1.5 text-[13px] font-semibold text-[color:var(--text-primary)]">
        {title}
      </div>
      {children}
    </div>
  );
}

function ReportList({ title, items }: { title: string; items: string[] }) {
  if (!items || items.length === 0) {
    return null;
  }
  return (
    <ReportCard title={title}>
      <ul className="space-y-1.5">
        {items.map((item, index) => (
          <li
            key={`${item}-${index}`}
            className="flex gap-2 text-[13px] leading-6 text-[color:var(--text-primary)]"
          >
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[color:var(--brand-primary)]" />
            <span className="min-w-0 flex-1">{item}</span>
          </li>
        ))}
      </ul>
    </ReportCard>
  );
}
