import { Github, Server, Cloud } from "lucide-react";
import { getServerI18n } from "@/i18n/server";
import type { SupportedLocale } from "@/lib/locales";
import { siteLinks } from "@/lib/site-links";
import { CloudWaitlist } from "@/components/cloud-waitlist";

export async function BYOKAndCloudSection({
  locale,
}: {
  locale: SupportedLocale;
}) {
  const i18n = await getServerI18n(locale);
  const labels = {
    sectionTitle: i18n._("两条路，任你选"),
    sectionSubtitle: i18n._(
      "立即自部署，或等待 Cloud 托管版上线 —— 同一个 Enclave，不同的入口。",
    ),
    selfHostBadge: i18n._("现在可用"),
    selfHostTitle: i18n._("自部署（BYOK）"),
    selfHostLead: i18n._(
      "用 Docker 在自己的机器上 5 分钟跑起来，自带 LLM key。",
    ),
    selfHostBullet1: i18n._("MIT 开源，数据全部在你机器上"),
    selfHostBullet2: i18n._("OpenRouter / Groq / DeepSeek / Ollama 任选"),
    selfHostBullet3: i18n._("最低 $0/月（用免费 LLM 网关）"),
    selfHostCta1: i18n._("GitHub 仓库"),
    selfHostCta2: i18n._("BYOK 5 分钟指南"),
    cloudBadge: i18n._("即将开放"),
    cloudTitle: i18n._("Cloud 托管版"),
    cloudLead: i18n._(
      "不想自己装 Docker？我们帮你托管 —— 加入 waitlist，前 50 名优先开放。",
    ),
  };

  const githubHref = siteLinks.github;
  const byokHref = `${siteLinks.github.replace(/\/?$/, "")}/blob/main/BYOK.md`;

  return (
    <section className="relative border-y border-(--border-faint) bg-(--surface-soft)/30">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold sm:text-4xl">{labels.sectionTitle}</h2>
          <p className="mt-3 text-base text-(--text-secondary) sm:text-lg">
            {labels.sectionSubtitle}
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-2 lg:gap-8">
          <article className="relative flex flex-col rounded-2xl border border-(--border-subtle) bg-(--surface-card) p-6 sm:p-8 shadow-(--shadow-soft)">
            <div className="flex items-center gap-3">
              <span className="inline-flex size-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-500">
                <Server size={20} />
              </span>
              <div>
                <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  {labels.selfHostBadge}
                </span>
                <h3 className="mt-1 text-xl font-semibold">{labels.selfHostTitle}</h3>
              </div>
            </div>
            <p className="mt-4 text-(--text-secondary)">{labels.selfHostLead}</p>
            <ul className="mt-4 space-y-2 text-sm text-(--text-secondary)">
              <li className="flex items-start gap-2">
                <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-emerald-500" />
                <span>{labels.selfHostBullet1}</span>
              </li>
              <li className="flex items-start gap-2">
                <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-emerald-500" />
                <span>{labels.selfHostBullet2}</span>
              </li>
              <li className="flex items-start gap-2">
                <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-emerald-500" />
                <span>{labels.selfHostBullet3}</span>
              </li>
            </ul>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <a
                href={githubHref}
                target="_blank"
                rel="noreferrer"
                data-cta="byok-github"
                data-cta-location="byok-section"
                className="inline-flex items-center gap-2 rounded-xl border border-(--border-subtle) bg-(--surface-base) px-4 py-2.5 text-sm font-semibold transition hover:border-(--brand-primary)"
              >
                <Github size={16} />
                {labels.selfHostCta1}
              </a>
              <a
                href={byokHref}
                target="_blank"
                rel="noreferrer"
                data-cta="byok-guide"
                data-cta-location="byok-section"
                className="inline-flex items-center gap-2 rounded-xl bg-(--brand-primary) px-4 py-2.5 text-sm font-semibold text-white shadow-(--shadow-soft) transition hover:bg-(--brand-secondary)"
              >
                {labels.selfHostCta2}
              </a>
            </div>
          </article>

          <article className="relative flex flex-col rounded-2xl border border-(--border-subtle) bg-(--surface-card) p-6 sm:p-8 shadow-(--shadow-soft)">
            <div className="flex items-center gap-3">
              <span className="inline-flex size-10 items-center justify-center rounded-xl bg-sky-500/15 text-sky-500">
                <Cloud size={20} />
              </span>
              <div>
                <span className="inline-flex items-center rounded-full bg-sky-500/15 px-2 py-0.5 text-xs font-medium text-sky-600 dark:text-sky-400">
                  {labels.cloudBadge}
                </span>
                <h3 className="mt-1 text-xl font-semibold">{labels.cloudTitle}</h3>
              </div>
            </div>
            <p className="mt-4 text-(--text-secondary)">{labels.cloudLead}</p>
            <div className="mt-5">
              <CloudWaitlist locale={locale} source="landing-byok-section" variant="inline" />
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
