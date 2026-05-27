import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { isSupportedLocale, type SupportedLocale } from "@/lib/locales";
import { getServerI18n } from "@/i18n/server";
import {
  alternateLocales,
  buildAlternates,
  OG_LOCALE,
  pageUrl,
  SITE_BASE_URL,
} from "@/lib/seo-metadata";
import { USE_CASES } from "@/lib/use-cases-data";
import { buildLocalePath } from "@/lib/locale-routing";
import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import { BreadcrumbsJsonLd } from "@/components/seo/breadcrumbs-json-ld";
import { JsonLd } from "@/components/seo/json-ld";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) return {};
  const i18n = await getServerI18n(locale);
  const title = i18n._("用例");
  const description = i18n._(
    "看看真实场景下隐界能做什么：私人 AI 专家助手、多角色群聊、自部署隐私优先。",
  );
  return {
    title,
    description,
    alternates: buildAlternates(locale, "use-cases"),
    openGraph: {
      type: "website",
      url: pageUrl(locale, "use-cases"),
      title,
      description,
      siteName: "Enclave",
      locale: OG_LOCALE[locale],
      alternateLocale: alternateLocales(locale),
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function UseCasesHubPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safeLocale = (isSupportedLocale(locale) ? locale : "zh-CN") as SupportedLocale;
  const i18n = await getServerI18n(safeLocale);

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: i18n._("用例"),
    itemListOrder: "https://schema.org/ItemListOrderAscending",
    numberOfItems: USE_CASES.length,
    itemListElement: USE_CASES.map((u, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      url: `${SITE_BASE_URL}/${safeLocale}/use-cases/${u.slug}`,
      name: i18n._(u.title),
    })),
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
      <BreadcrumbsJsonLd
        locale={safeLocale}
        trail={[{ titleZh: "用例", segment: "use-cases" }]}
      />
      <JsonLd data={itemList} />
      <BreadcrumbNav
        locale={safeLocale}
        trail={[{ titleZh: "用例", segment: "use-cases" }]}
      />
      <header className="max-w-2xl">
        <span className="text-sm font-semibold uppercase tracking-wider text-(--brand-primary)">
          {i18n._("真实场景")}
        </span>
        <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
          {i18n._("人们用隐界来做什么")}
        </h1>
        <p className="mt-3 text-(--text-secondary)">
          {i18n._(
            "下面这些用例不是虚构的 demo，而是社区里真实在跑的玩法。挑一个最像你的场景看看。",
          )}
        </p>
      </header>

      <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {USE_CASES.map((u) => {
          const Icon = u.icon;
          const href = buildLocalePath(safeLocale, `/use-cases/${u.slug}`);
          return (
            <li key={u.slug}>
              <Link
                href={href}
                className="group flex h-full flex-col rounded-2xl border border-(--border-subtle) bg-(--surface-card) p-6 transition hover:border-(--brand-primary) hover:shadow-(--shadow-card)"
              >
                <span className="grid size-11 place-items-center rounded-xl bg-(--brand-gradient) text-white shadow-(--shadow-soft)">
                  <Icon size={22} strokeWidth={2} />
                </span>
                <span className="mt-4 text-xs font-semibold uppercase tracking-wider text-(--brand-primary)">
                  {i18n._(u.eyebrow)}
                </span>
                <h2 className="mt-2 text-lg font-semibold text-(--text-primary)">
                  {i18n._(u.title)}
                </h2>
                <p className="mt-3 text-sm leading-6 text-(--text-secondary)">
                  {i18n._(u.shortDesc)}
                </p>
                <span className="mt-5 flex items-center gap-1.5 text-sm font-semibold text-(--brand-primary) transition group-hover:gap-2.5">
                  {i18n._("查看用例")}
                  <ArrowRight size={14} />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
