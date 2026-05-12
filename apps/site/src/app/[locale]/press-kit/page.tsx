import type { Metadata } from "next";
import Image from "next/image";
import {
  Download,
  FileText,
  Image as ImageIcon,
  Mail,
  Package,
  UserRound,
} from "lucide-react";
import { isSupportedLocale, type SupportedLocale } from "@/lib/locales";
import { getServerI18n } from "@/i18n/server";
import {
  alternateLocales,
  buildAlternates,
  OG_LOCALE,
  pageUrl,
} from "@/lib/seo-metadata";
import { siteLinks } from "@/lib/site-links";
import {
  PRESS_KIT_ASSETS,
  PRESS_KIT_FACTS,
  PRESS_KIT_FOUNDER_AVATAR_PATH,
  PRESS_KIT_LOGO_PATH,
  PRESS_KIT_PDF_BY_LOCALE,
  PRESS_KIT_SCREENSHOTS,
  type PressKitAssetKind,
} from "@/lib/press-kit-data";
import { BreadcrumbNav } from "@/components/breadcrumb-nav";
import { BreadcrumbsJsonLd } from "@/components/seo/breadcrumbs-json-ld";

function assetHref(kind: PressKitAssetKind, locale: SupportedLocale) {
  if (kind === "pdf") return PRESS_KIT_PDF_BY_LOCALE[locale];
  if (kind === "logo") return PRESS_KIT_LOGO_PATH;
  if (kind === "avatar") return PRESS_KIT_FOUNDER_AVATAR_PATH;
  return "#press-kit-screenshots";
}

function AssetIcon({ kind }: { kind: PressKitAssetKind }) {
  if (kind === "pdf") return <FileText size={22} />;
  if (kind === "logo") return <Package size={22} />;
  if (kind === "avatar") return <UserRound size={22} />;
  return <ImageIcon size={22} />;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) return {};
  const i18n = await getServerI18n(locale);
  const title = i18n._("媒体资料");
  const description = i18n._(
    "下载隐界 Enclave 媒体资料包：产品介绍 PDF、截图、Logo 和创始人头像，给媒体与创作者直接使用。",
  );
  return {
    title,
    description,
    alternates: buildAlternates(locale, "press-kit"),
    openGraph: {
      type: "website",
      url: pageUrl(locale, "press-kit"),
      title,
      description,
      siteName: "Enclave",
      locale: OG_LOCALE[locale],
      alternateLocale: alternateLocales(locale),
    },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function PressKitPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const safeLocale = (isSupportedLocale(locale) ? locale : "zh-CN") as SupportedLocale;
  const i18n = await getServerI18n(safeLocale);
  const pdfHref = PRESS_KIT_PDF_BY_LOCALE[safeLocale];

  return (
    <main className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
      <BreadcrumbsJsonLd
        locale={safeLocale}
        trail={[{ titleZh: "媒体资料", segment: "press-kit" }]}
      />
      <BreadcrumbNav
        locale={safeLocale}
        trail={[{ titleZh: "媒体资料", segment: "press-kit" }]}
      />

      <header className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center">
        <div className="max-w-3xl">
          <span className="text-sm font-semibold uppercase tracking-wider text-(--brand-primary)">
            {i18n._("Press Kit")}
          </span>
          <h1 className="mt-2 text-3xl font-bold sm:text-5xl">
            {i18n._("隐界 Enclave 媒体资料包")}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-8 text-(--text-secondary) sm:text-lg">
            {i18n._(
              "给媒体、博主和创作者准备的公开素材页。这里可以直接下载产品介绍、截图、Logo 和创始人头像，用于报道、评测、视频和资料库条目。",
            )}
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a
              href={pdfHref}
              download
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-(--brand-primary) px-5 text-sm font-semibold text-white shadow-(--shadow-soft) transition hover:bg-(--brand-secondary)"
            >
              <Download size={18} />
              {i18n._("下载产品介绍 PDF")}
            </a>
            <a
              href={siteLinks.contact}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-(--border-subtle) bg-(--surface-card) px-5 text-sm font-semibold text-(--text-primary) transition hover:border-(--brand-primary) hover:text-(--brand-primary)"
            >
              <Mail size={18} />
              {i18n._("媒体联系")}
            </a>
          </div>
        </div>

        <div className="grid gap-4 rounded-2xl border border-(--border-subtle) bg-(--surface-card) p-5 shadow-(--shadow-soft)">
          <div className="flex items-center gap-4">
            <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-(--brand-gradient) shadow-(--shadow-soft)">
              <Image src={PRESS_KIT_LOGO_PATH} alt="" width={52} height={52} className="rounded-xl" />
            </span>
            <div>
              <p className="text-sm font-semibold text-(--text-primary)">{i18n._("隐界 Enclave")}</p>
              <p className="mt-1 text-sm text-(--text-secondary)">
                {i18n._("一个属于你的 AI 虚拟世界")}
              </p>
            </div>
          </div>
          <Image
            src={PRESS_KIT_FOUNDER_AVATAR_PATH}
            alt={i18n._("隐界创始人品牌化插画头像")}
            width={1024}
            height={1024}
            priority
            className="aspect-square w-full rounded-xl object-cover"
          />
        </div>
      </header>

      <section className="mt-16 sm:mt-20" aria-labelledby="press-kit-facts">
        <h2 id="press-kit-facts" className="text-2xl font-bold text-(--text-primary)">
          {i18n._("快速事实")}
        </h2>
        <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PRESS_KIT_FACTS.map((fact) => (
            <div
              key={fact.title.id}
              className="rounded-2xl border border-(--border-subtle) bg-(--surface-card) p-5"
            >
              <dt className="text-sm font-semibold text-(--brand-primary)">{i18n._(fact.title)}</dt>
              <dd className="mt-2 text-sm leading-6 text-(--text-secondary)">{i18n._(fact.body)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section id="press-kit-assets" className="mt-16 scroll-mt-24 sm:mt-20" aria-labelledby="press-kit-assets-title">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="press-kit-assets-title" className="text-2xl font-bold text-(--text-primary)">
              {i18n._("素材下载")}
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-(--text-secondary)">
              {i18n._("所有素材可直接用于报道、评测、视频封面和资料库条目；请保留产品名“隐界 Enclave”。")}
            </p>
          </div>
        </div>
        <ul className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {PRESS_KIT_ASSETS.map((asset) => {
            const href = assetHref(asset.kind, safeLocale);
            const isDownload = asset.kind !== "screenshots";
            return (
              <li key={asset.kind}>
                <a
                  href={href}
                  download={isDownload ? true : undefined}
                  className="group flex h-full flex-col rounded-2xl border border-(--border-subtle) bg-(--surface-card) p-5 transition hover:border-(--brand-primary) hover:shadow-(--shadow-card)"
                >
                  <span className="grid size-11 place-items-center rounded-xl bg-(--brand-gradient) text-white shadow-(--shadow-soft)">
                    <AssetIcon kind={asset.kind} />
                  </span>
                  <span className="mt-5 text-xs font-semibold uppercase tracking-wider text-(--brand-primary)">
                    {i18n._(asset.format)}
                  </span>
                  <h3 className="mt-2 text-lg font-semibold text-(--text-primary)">{i18n._(asset.title)}</h3>
                  <p className="mt-3 grow text-sm leading-6 text-(--text-secondary)">
                    {i18n._(asset.description)}
                  </p>
                  <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-(--brand-primary) transition group-hover:gap-2.5">
                    {i18n._(asset.action)}
                    <Download size={15} />
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      </section>

      <section id="press-kit-screenshots" className="mt-16 scroll-mt-24 sm:mt-20" aria-labelledby="press-kit-screenshots-title">
        <div className="max-w-2xl">
          <h2 id="press-kit-screenshots-title" className="text-2xl font-bold text-(--text-primary)">
            {i18n._("截图")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-(--text-secondary)">
            {i18n._("截图来自当前线上版本，按当前页面语言自动匹配。")}
          </p>
        </div>
        <ul className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {PRESS_KIT_SCREENSHOTS.map((shot) => {
            const src = `/screenshots/${safeLocale}/${shot.key}.png`;
            return (
              <li
                key={shot.key}
                className="overflow-hidden rounded-2xl border border-(--border-subtle) bg-(--surface-card) shadow-(--shadow-soft)"
              >
                <div className="relative aspect-[3/4] bg-(--surface-soft)">
                  <Image
                    src={src}
                    alt={i18n._(shot.alt)}
                    fill
                    sizes="(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw"
                    className="object-cover object-top"
                  />
                </div>
                <div className="p-5">
                  <h3 className="text-base font-semibold text-(--text-primary)">{i18n._(shot.title)}</h3>
                  <p className="mt-1 text-sm text-(--text-secondary)">{i18n._(shot.description)}</p>
                  <a
                    href={src}
                    download
                    className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-(--brand-primary)"
                  >
                    {i18n._("下载 PNG")}
                    <Download size={14} />
                  </a>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-16 rounded-2xl border border-(--border-subtle) bg-(--surface-card) p-6 sm:mt-20 sm:p-8">
        <h2 className="text-2xl font-bold text-(--text-primary)">{i18n._("使用说明")}</h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-(--text-secondary)">
          {i18n._(
            "报道或引用时建议使用“隐界 Enclave”作为产品名。需要采访、补充截图、视频素材或其它格式文件，可以直接邮件联系。",
          )}
        </p>
        <a
          href={siteLinks.contact}
          className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-(--brand-primary)"
        >
          <Mail size={16} />
          yuanzui0728@gmail.com
        </a>
      </section>
    </main>
  );
}
