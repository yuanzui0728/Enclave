import { useEffect } from "react";
import type { ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  Bot,
  Brain,
  CloudSun,
  Compass,
  Database,
  Github,
  GitBranch,
  MessageCircle,
  PlayCircle,
  Radio,
  Server,
  Shield,
  Sparkles,
  Users,
} from "lucide-react";
import { siteLinks } from "../site-links";
import type { BridgeId, FeatureId, SystemId } from "../site-content";
import { useSiteCopy } from "../use-site-copy";

const featureIcons: Record<FeatureId, typeof MessageCircle> = {
  chat: MessageCircle,
  moments: Radio,
  channels: PlayCircle,
  discover: Compass,
  groups: Users,
};

const systemIcons: Record<SystemId, typeof Brain> = {
  personas: Brain,
  relations: GitBranch,
  time: CloudSun,
  narrative: Sparkles,
};

const bridgeIcons: Record<BridgeId, typeof Activity> = {
  actions: Activity,
  signals: Database,
  avatar: Bot,
};

export function HomePage() {
  const copy = useSiteCopy();

  useEffect(() => {
    document.title = copy.meta.title;
    document
      .querySelector("meta[name='description']")
      ?.setAttribute("content", copy.meta.description);
  }, [copy.meta.description, copy.meta.title]);

  return (
    <main>
      <section className="border-b border-[color:var(--site-border)] bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_74%)]">
        <div className="mx-auto grid min-h-[calc(100vh-72px)] w-full max-w-7xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(420px,1.08fr)] lg:px-8">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold text-[#0f766e]">
              {copy.hero.eyebrow}
            </p>
            <h1 className="mt-5 text-5xl font-semibold leading-[1.04] text-[color:var(--site-text)] sm:text-6xl lg:text-7xl">
              {copy.hero.title}
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[color:var(--site-muted)] sm:text-xl sm:leading-9">
              {copy.hero.subtitle}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a
                href={siteLinks.app}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[#111827] px-5 text-sm font-semibold text-white shadow-[0_16px_36px_rgba(15,23,42,0.16)] transition hover:bg-[#0f766e]"
              >
                <PlayCircle size={18} />
                {copy.hero.primaryCta}
              </a>
              <a
                href={siteLinks.github}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-[color:var(--site-border-strong)] bg-white px-5 text-sm font-semibold text-[color:var(--site-text)] transition hover:border-[#0f766e] hover:text-[#0f766e]"
              >
                <Github size={18} />
                {copy.hero.secondaryCta}
              </a>
              <a
                href={siteLinks.deploy}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg px-2 text-sm font-semibold text-[#0f766e] transition hover:text-[#134e4a]"
              >
                {copy.hero.tertiaryCta}
                <ArrowRight size={18} />
              </a>
            </div>
            <div className="mt-8 flex flex-wrap gap-3">
              {copy.hero.proof.map((item) => (
                <span
                  key={item}
                  className="rounded-lg border border-[color:var(--site-border)] bg-white px-3 py-2 text-sm font-medium text-[color:var(--site-muted)]"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>

          <ProductVisual />
        </div>
      </section>

      <Section
        id="product"
        eyebrow={copy.sections.productEyebrow}
        title={copy.sections.productTitle}
        intro={copy.sections.productIntro}
      >
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {copy.features.map((feature) => {
            const Icon = featureIcons[feature.id];
            return (
              <article
                key={feature.id}
                className="rounded-lg border border-[color:var(--site-border)] bg-white p-5 shadow-[var(--site-shadow-soft)]"
              >
                <Icon size={22} className="text-[#0f766e]" />
                <h3 className="mt-4 text-base font-semibold text-[color:var(--site-text)]">
                  {feature.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-[color:var(--site-muted)]">
                  {feature.description}
                </p>
              </article>
            );
          })}
        </div>
      </Section>

      <Section
        id="philosophy"
        eyebrow={copy.sections.philosophyEyebrow}
        title={copy.sections.philosophyTitle}
        intro={copy.sections.philosophyIntro}
        tone="muted"
      >
        <div className="grid gap-4 md:grid-cols-3">
          {copy.philosophy.map((item) => (
            <article
              key={item.label}
              className="rounded-lg border border-[color:var(--site-border)] bg-white p-6"
            >
              <div className="text-4xl font-semibold text-[#0f766e]">
                {item.value}
              </div>
              <h3 className="mt-4 text-base font-semibold text-[color:var(--site-text)]">
                {item.label}
              </h3>
              <p className="mt-3 text-sm leading-6 text-[color:var(--site-muted)]">
                {item.description}
              </p>
            </article>
          ))}
        </div>
      </Section>

      <Section
        id="living-system"
        eyebrow={copy.sections.livingEyebrow}
        title={copy.sections.livingTitle}
        intro={copy.sections.livingIntro}
      >
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {copy.systems.map((item) => {
            const Icon = systemIcons[item.id];
            return (
              <article
                key={item.id}
                className="rounded-lg border border-[color:var(--site-border)] bg-white p-5"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#ecfeff] text-[#155e75]">
                  <Icon size={20} />
                </div>
                <h3 className="mt-4 text-base font-semibold text-[color:var(--site-text)]">
                  {item.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-[color:var(--site-muted)]">
                  {item.description}
                </p>
              </article>
            );
          })}
        </div>
      </Section>

      <Section
        id="bridge"
        eyebrow={copy.sections.bridgeEyebrow}
        title={copy.sections.bridgeTitle}
        intro={copy.sections.bridgeIntro}
        tone="muted"
      >
        <div className="grid gap-4 lg:grid-cols-3">
          {copy.bridges.map((item) => {
            const Icon = bridgeIcons[item.id];
            return (
              <article
                key={item.id}
                className="rounded-lg border border-[color:var(--site-border)] bg-white p-6"
              >
                <Icon size={24} className="text-[#b45309]" />
                <h3 className="mt-4 text-lg font-semibold text-[color:var(--site-text)]">
                  {item.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-[color:var(--site-muted)]">
                  {item.description}
                </p>
              </article>
            );
          })}
        </div>
      </Section>

      <Section
        id="open-source"
        eyebrow={copy.sections.openSourceEyebrow}
        title={copy.sections.openSourceTitle}
        intro={copy.sections.openSourceIntro}
      >
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.72fr)]">
          <div className="rounded-lg border border-[#1f2937] bg-[#111827] p-5 text-white shadow-[0_18px_40px_rgba(15,23,42,0.22)]">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-[#a7f3d0]">
              <Server size={18} />
              {copy.openSource.installTitle}
            </div>
            <pre className="overflow-x-auto rounded-lg bg-[#020617] p-4 text-sm leading-7 text-[#d1fae5]">
              <code>{copy.openSource.installLines.join("\n")}</code>
            </pre>
          </div>
          <div className="rounded-lg border border-[color:var(--site-border)] bg-white p-6">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#0f766e]">
              <Shield size={18} />
              {copy.openSource.stackTitle}
            </div>
            <ul className="mt-5 space-y-3">
              {copy.openSource.stackItems.map((item) => (
                <li
                  key={item}
                  className="flex gap-3 text-sm leading-6 text-[color:var(--site-muted)]"
                >
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#0f766e]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row lg:flex-col">
              <a
                href={siteLinks.github}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#111827] px-4 text-sm font-semibold text-white transition hover:bg-[#0f766e]"
              >
                <Github size={17} />
                {copy.openSource.repoCta}
              </a>
              <a
                href={siteLinks.deploy}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[color:var(--site-border-strong)] bg-white px-4 text-sm font-semibold text-[color:var(--site-text)] transition hover:border-[#0f766e] hover:text-[#0f766e]"
              >
                {copy.openSource.deployCta}
                <ArrowRight size={17} />
              </a>
            </div>
          </div>
        </div>
      </Section>

      <Section
        id="faq"
        eyebrow={copy.sections.faqEyebrow}
        title={copy.sections.faqTitle}
        intro=""
        tone="muted"
      >
        <div className="grid gap-4 md:grid-cols-2">
          {copy.faq.map((item) => (
            <article
              key={item.question}
              className="rounded-lg border border-[color:var(--site-border)] bg-white p-6"
            >
              <h3 className="text-base font-semibold text-[color:var(--site-text)]">
                {item.question}
              </h3>
              <p className="mt-3 text-sm leading-6 text-[color:var(--site-muted)]">
                {item.answer}
              </p>
            </article>
          ))}
        </div>
      </Section>
    </main>
  );
}

function Section({
  children,
  eyebrow,
  id,
  intro,
  title,
  tone = "plain",
}: {
  children: ReactNode;
  eyebrow: string;
  id: string;
  intro: string;
  title: string;
  tone?: "plain" | "muted";
}) {
  return (
    <section
      id={id}
      className={tone === "muted" ? "bg-[#f8fafc] py-20" : "bg-white py-20"}
    >
      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold text-[#0f766e]">{eyebrow}</p>
          <h2 className="mt-3 text-3xl font-semibold leading-tight text-[color:var(--site-text)] sm:text-4xl">
            {title}
          </h2>
          {intro ? (
            <p className="mt-4 text-base leading-7 text-[color:var(--site-muted)]">
              {intro}
            </p>
          ) : null}
        </div>
        <div className="mt-10">{children}</div>
      </div>
    </section>
  );
}

function ProductVisual() {
  const copy = useSiteCopy();

  return (
    <div className="relative mx-auto w-full max-w-2xl">
      <div className="rounded-lg border border-[color:var(--site-border-strong)] bg-white p-3 shadow-[0_24px_70px_rgba(15,23,42,0.16)]">
        <div className="rounded-lg border border-[color:var(--site-border)] bg-[#f8fafc]">
          <div className="flex items-center justify-between border-b border-[color:var(--site-border)] px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-[color:var(--site-text)]">
                {copy.productVisual.desktopTitle}
              </div>
              <div className="text-xs text-[color:var(--site-muted)]">
                {copy.productVisual.desktopSubtitle}
              </div>
            </div>
            <div className="flex gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#f97316]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#facc15]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#10b981]" />
            </div>
          </div>

          <div className="grid gap-3 p-3 md:grid-cols-[minmax(180px,0.72fr)_minmax(0,1fr)]">
            <div className="rounded-lg border border-[color:var(--site-border)] bg-white p-3">
              <div className="text-xs font-semibold text-[color:var(--site-muted)]">
                Chat
              </div>
              <div className="mt-3 space-y-2">
                {["自己", "林川", "乔布斯", "小盯"].map((name, index) => (
                  <div
                    key={name}
                    className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-[#f1f5f9]"
                  >
                    <span
                      className={[
                        "h-8 w-8 rounded-lg",
                        index === 0
                          ? "bg-[#0f766e]"
                          : index === 1
                            ? "bg-[#2563eb]"
                            : index === 2
                              ? "bg-[#b45309]"
                              : "bg-[#7c3aed]",
                      ].join(" ")}
                    />
                    <span className="min-w-0 text-sm font-medium text-[color:var(--site-text)]">
                      {name}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="rounded-lg border border-[color:var(--site-border)] bg-white p-4">
                <div className="flex items-center gap-3">
                  <span className="h-10 w-10 rounded-lg bg-[#0f766e]" />
                  <div>
                    <div className="text-sm font-semibold text-[color:var(--site-text)]">
                      {copy.productVisual.chatTitle}
                    </div>
                    <div className="text-xs text-[color:var(--site-muted)]">
                      online · memory synced
                    </div>
                  </div>
                </div>
                <div className="mt-4 space-y-2">
                  {copy.productVisual.chatMessages.map((message, index) => (
                    <div
                      key={message}
                      className={[
                        "max-w-[88%] rounded-lg px-3 py-2 text-sm leading-6",
                        index === 0
                          ? "bg-[#f1f5f9] text-[color:var(--site-text)]"
                          : "ml-auto bg-[#dcfce7] text-[#14532d]",
                      ].join(" ")}
                    >
                      {message}
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-[color:var(--site-border)] bg-white p-4">
                  <div className="text-sm font-semibold text-[color:var(--site-text)]">
                    {copy.productVisual.momentAuthor}
                  </div>
                  <p className="mt-2 text-xs leading-5 text-[color:var(--site-muted)]">
                    {copy.productVisual.momentText}
                  </p>
                  <div className="mt-3 h-16 rounded-lg bg-[linear-gradient(135deg,#bae6fd,#bbf7d0_55%,#fde68a)]" />
                </div>
                <div className="rounded-lg border border-[color:var(--site-border)] bg-[#111827] p-4 text-white">
                  <div className="text-sm font-semibold">
                    {copy.productVisual.videoTitle}
                  </div>
                  <div className="mt-3 h-16 rounded-lg bg-[linear-gradient(135deg,#0f766e,#2563eb)]" />
                  <div className="mt-3 text-xs text-[#cbd5e1]">
                    {copy.productVisual.videoMeta}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-[color:var(--site-border)] bg-white p-4">
                <div className="text-sm font-semibold text-[color:var(--site-text)]">
                  {copy.productVisual.groupTitle}
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {copy.productVisual.groupMessages.map((message) => (
                    <div
                      key={message}
                      className="rounded-lg bg-[#f8fafc] px-3 py-2 text-xs leading-5 text-[color:var(--site-muted)]"
                    >
                      {message}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
