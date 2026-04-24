import { Outlet, Link } from "@tanstack/react-router";
import { LanguageSwitcher } from "@yinjie/i18n";
import { ArrowUpRight } from "lucide-react";
import { siteLinks } from "./site-links";
import { useSiteCopy } from "./use-site-copy";

export function SiteShell() {
  const copy = useSiteCopy();

  return (
    <div className="min-h-screen bg-[color:var(--site-bg)] text-[color:var(--site-text)]">
      <header className="sticky top-0 z-40 border-b border-[color:var(--site-border)] bg-[rgba(248,250,252,0.92)] backdrop-blur-xl">
        <div className="mx-auto flex min-h-[72px] w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex min-w-0 items-center gap-3" aria-label="Yinjie home">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#111827] text-sm font-semibold text-white">
              隐
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-[color:var(--site-text)]">
                隐界
              </span>
              <span className="block text-xs text-[color:var(--site-muted)]">
                Yinjie
              </span>
            </span>
          </Link>

          <nav className="hidden items-center gap-6 text-sm font-medium text-[color:var(--site-muted)] md:flex">
            <a href="/#product" className="transition hover:text-[color:var(--site-text)]">
              {copy.nav.product}
            </a>
            <a href="/#philosophy" className="transition hover:text-[color:var(--site-text)]">
              {copy.nav.philosophy}
            </a>
            <a href="/#open-source" className="transition hover:text-[color:var(--site-text)]">
              {copy.nav.openSource}
            </a>
            <a href="/#faq" className="transition hover:text-[color:var(--site-text)]">
              {copy.nav.faq}
            </a>
          </nav>

          <div className="flex min-w-0 items-center gap-2">
            <LanguageSwitcher
              variant="compact"
              description={null}
              className="site-language-switcher border-[color:var(--site-border)] bg-white shadow-none"
            />
            <a
              href={siteLinks.app}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#111827] px-3 text-sm font-semibold text-white transition hover:bg-[#0f766e] sm:px-4"
            >
              <span className="hidden sm:inline">{copy.nav.experience}</span>
              <ArrowUpRight size={16} />
            </a>
          </div>
        </div>
      </header>

      <Outlet />

      <footer className="border-t border-[color:var(--site-border)] bg-white">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <div className="text-sm font-semibold text-[color:var(--site-text)]">
              隐界 · Yinjie
            </div>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[color:var(--site-muted)]">
              {copy.footer.tagline}
            </p>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-3 text-sm font-medium text-[color:var(--site-muted)]">
            <a href={siteLinks.github} target="_blank" rel="noreferrer" className="hover:text-[color:var(--site-text)]">
              {copy.footer.github}
            </a>
            <a href={siteLinks.deploy} target="_blank" rel="noreferrer" className="hover:text-[color:var(--site-text)]">
              {copy.footer.deploy}
            </a>
            <Link to="/privacy" className="hover:text-[color:var(--site-text)]">
              {copy.footer.privacy}
            </Link>
            <Link to="/terms" className="hover:text-[color:var(--site-text)]">
              {copy.footer.terms}
            </Link>
            <a href={siteLinks.contact} className="hover:text-[color:var(--site-text)]">
              {copy.footer.contact}
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
