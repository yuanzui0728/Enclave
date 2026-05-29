import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getServerI18n } from "@/i18n/server";
import type { SupportedLocale } from "@/lib/locales";
import { buildLocalePath } from "@/lib/locale-routing";
import { siteLinks } from "@/lib/site-links";
import { LanguageSwitcherLink } from "./language-switcher-link";
import { SiteMobileMenu } from "./site-mobile-menu";
import { ThemeToggle } from "./theme-toggle";

export async function SiteHeader({ locale }: { locale: SupportedLocale }) {
  const i18n = await getServerI18n(locale);
  const home = buildLocalePath(locale, "/");

  const labels = {
    capabilities: i18n._("核心能力"),
    crossPlatform: i18n._("跨端"),
    faq: i18n._("FAQ"),
    download: i18n._("下载"),
    startNow: i18n._("免费开始"),
    menuOpen: i18n._("打开菜单"),
    menuClose: i18n._("关闭菜单"),
    brand: i18n._("隐界"),
    homeAria: i18n._("Enclave 首页"),
    languageAria: i18n._("语言"),
    themeLight: i18n._("浅色"),
    themeDark: i18n._("深色"),
    themeSystem: i18n._("跟随系统"),
    themeToggle: i18n._("主题"),
  };

  return (
    <header className="sticky top-0 z-40 border-b border-(--border-subtle) bg-(--surface-shell) backdrop-blur-xl">
      <div className="mx-auto flex min-h-[64px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href={home} className="flex min-w-0 items-center gap-2.5" aria-label={labels.homeAria}>
          <span
            aria-hidden="true"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-(--brand-gradient) text-base font-semibold text-white shadow-(--shadow-soft)"
          >
            隐
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-(--text-primary)">{labels.brand}</span>
            <span className="hidden text-[11px] tracking-wide text-(--text-muted) sm:block">Enclave</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-medium text-(--text-secondary) md:flex">
          <a href={`${home}#capabilities`} className="transition hover:text-(--brand-primary)">
            {labels.capabilities}
          </a>
          <a href={`${home}#cross-platform`} className="transition hover:text-(--brand-primary)">
            {labels.crossPlatform}
          </a>
          <a href={`${home}#faq`} className="transition hover:text-(--brand-primary)">
            {labels.faq}
          </a>
          <Link
            href={buildLocalePath(locale, "/download")}
            className="transition hover:text-(--brand-primary)"
          >
            {labels.download}
          </Link>
        </nav>

        <div className="flex min-w-0 items-center gap-2">
          <ThemeToggle
            labels={{
              light: labels.themeLight,
              dark: labels.themeDark,
              system: labels.themeSystem,
              toggle: labels.themeToggle,
            }}
          />
          <LanguageSwitcherLink current={locale} ariaLabel={labels.languageAria} />
          <a
            href={siteLinks.app}
            target="_blank"
            rel="noreferrer"
            data-cta="signup"
            data-cta-location="header"
            className="hidden min-h-9 items-center justify-center gap-1.5 rounded-lg bg-(--brand-primary) px-4 text-sm font-semibold text-white transition hover:bg-(--brand-secondary) shadow-(--shadow-soft) sm:inline-flex"
          >
            <span>{labels.startNow}</span>
            <ArrowRight size={16} />
          </a>
          <SiteMobileMenu locale={locale} labels={labels} />
        </div>
      </div>
    </header>
  );
}
