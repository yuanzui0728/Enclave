import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useSiteCopy } from "../use-site-copy";

export function PrivacyPage() {
  const copy = useSiteCopy();

  useEffect(() => {
    document.title = `${copy.legal.privacyTitle} · Yinjie`;
    document
      .querySelector("meta[name='description']")
      ?.setAttribute("content", copy.legal.privacyIntro);
  }, [copy.legal.privacyIntro, copy.legal.privacyTitle]);

  return (
    <LegalDocument
      title={copy.legal.privacyTitle}
      intro={copy.legal.privacyIntro}
      sections={copy.legal.sections}
      backHome={copy.legal.backHome}
    />
  );
}

export function TermsPage() {
  const copy = useSiteCopy();

  useEffect(() => {
    document.title = `${copy.legal.termsTitle} · Yinjie`;
    document
      .querySelector("meta[name='description']")
      ?.setAttribute("content", copy.legal.termsIntro);
  }, [copy.legal.termsIntro, copy.legal.termsTitle]);

  return (
    <LegalDocument
      title={copy.legal.termsTitle}
      intro={copy.legal.termsIntro}
      sections={copy.legal.termsSections}
      backHome={copy.legal.backHome}
    />
  );
}

function LegalDocument({
  backHome,
  intro,
  sections,
  title,
}: {
  backHome: string;
  intro: string;
  sections: Array<{
    title: string;
    body: string;
  }>;
  title: string;
}) {
  return (
    <main className="bg-[#f8fafc]">
      <div className="mx-auto min-h-[calc(100vh-72px)] w-full max-w-4xl px-4 py-14 sm:px-6 lg:px-8">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#0f766e] hover:text-[#134e4a]"
        >
          <ArrowLeft size={17} />
          {backHome}
        </Link>
        <article className="mt-8 rounded-lg border border-[color:var(--site-border)] bg-white p-6 shadow-[var(--site-shadow-soft)] sm:p-8">
          <h1 className="text-3xl font-semibold text-[color:var(--site-text)]">
            {title}
          </h1>
          <p className="mt-4 text-base leading-7 text-[color:var(--site-muted)]">
            {intro}
          </p>
          <div className="mt-8 space-y-6">
            {sections.map((section) => (
              <section key={section.title}>
                <h2 className="text-lg font-semibold text-[color:var(--site-text)]">
                  {section.title}
                </h2>
                <p className="mt-3 text-sm leading-7 text-[color:var(--site-muted)]">
                  {section.body}
                </p>
              </section>
            ))}
          </div>
        </article>
      </div>
    </main>
  );
}
