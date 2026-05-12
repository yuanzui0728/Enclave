import Image from "next/image";
import Link from "next/link";
import { getServerI18n } from "@/i18n/server";
import type { SupportedLocale } from "@/lib/locales";
import { buildLocalePath } from "@/lib/locale-routing";
import { siteLinks } from "@/lib/site-links";

export async function SiteFooter({ locale }: { locale: SupportedLocale }) {
  const i18n = await getServerI18n(locale);
  const tagline = i18n._("一个属于你的 AI 虚拟世界。私人居民、动态、群聊、电话——浏览器即开即用。");
  const labels = {
    startNow: i18n._("免费开始"),
    download: i18n._("下载"),
    changelog: i18n._("更新日志"),
    pressKit: i18n._("媒体资料"),
    github: "GitHub",
    privacy: i18n._("隐私政策"),
    terms: i18n._("服务条款"),
    contact: i18n._("联系我们"),
    brand: i18n._("隐界 · Enclave"),
  };
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-(--border-subtle) bg-(--surface-shell)">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-10 sm:px-6 lg:flex-row lg:items-start lg:justify-between lg:px-8">
        <div className="max-w-xl">
          <div className="flex items-center gap-2 text-sm font-semibold text-(--text-primary)">
            <span
              aria-hidden="true"
              className="grid h-6 w-6 place-items-center rounded-md bg-(--brand-gradient) shadow-(--shadow-soft)"
            >
              <Image src="/favicon.png" alt="" aria-hidden="true" width={18} height={18} className="rounded-[5px]" />
            </span>
            <span>{labels.brand}</span>
          </div>
          <p className="mt-3 text-sm leading-6 text-(--text-secondary)">{tagline}</p>
          <p className="mt-4 text-xs text-(--text-dim)">© {year} Enclave · {i18n._("MIT License")}</p>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium text-(--text-secondary)">
          <a href={siteLinks.app} target="_blank" rel="noreferrer" className="hover:text-(--brand-primary)">
            {labels.startNow}
          </a>
          <Link href={buildLocalePath(locale, "/download")} className="hover:text-(--brand-primary)">
            {labels.download}
          </Link>
          <Link href={buildLocalePath(locale, "/changelog")} className="hover:text-(--brand-primary)">
            {labels.changelog}
          </Link>
          <Link href={buildLocalePath(locale, "/press-kit")} className="hover:text-(--brand-primary)">
            {labels.pressKit}
          </Link>
          <Link href={buildLocalePath(locale, "/privacy")} className="hover:text-(--brand-primary)">
            {labels.privacy}
          </Link>
          <Link href={buildLocalePath(locale, "/terms")} className="hover:text-(--brand-primary)">
            {labels.terms}
          </Link>
          <a href={siteLinks.contact} className="hover:text-(--brand-primary)">
            {labels.contact}
          </a>
          <a href={siteLinks.github} target="_blank" rel="noreferrer" className="text-(--text-dim) hover:text-(--brand-primary)">
            {labels.github}
          </a>
        </nav>
      </div>
    </footer>
  );
}
