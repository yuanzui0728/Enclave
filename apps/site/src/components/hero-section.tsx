import Image from "next/image";
import { ArrowRight, Sparkles } from "lucide-react";
import { getServerI18n } from "@/i18n/server";
import type { SupportedLocale } from "@/lib/locales";
import { siteLinks } from "@/lib/site-links";

export async function HeroSection({ locale }: { locale: SupportedLocale }) {
  const i18n = await getServerI18n(locale);
  const labels = {
    eyebrow: i18n._("你的 AI 助手世界 · 一键开始"),
    title: i18n._("一个属于你的私人助手世界"),
    subtitle: i18n._(
      "这里住着各行各业的专家和你自己的分身。他们记得你、主动帮你，把过去只有少数人请得起的专业支持，变成你随时能用的日常。",
    ),
    cta1: i18n._("免费开始"),
    cta2: i18n._("了解能做什么"),
    coreLoop: i18n._("核心闭环演示（动图）"),
    gifAlt: i18n._("隐界核心闭环演示动图：聊天、朋友圈、群聊、电话、笔记一气呵成"),
    statWorld: i18n._("私人世界"),
    statWorldDesc: i18n._("一人一实例"),
    statSync: i18n._("多端同步"),
    statSyncDesc: i18n._("浏览器 / 桌面 / 手机"),
    statFree: i18n._("免费开始"),
    statFreeDesc: i18n._("注册即用，无需安装"),
  };

  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 pt-12 pb-16 sm:px-6 sm:pt-20 sm:pb-24 lg:grid-cols-12 lg:px-8 lg:gap-12">
        <div className="lg:col-span-6 lg:pt-6">
          <span className="inline-flex items-center gap-2 rounded-full border border-(--border-subtle) bg-(--surface-card) px-3 py-1 text-xs font-medium text-(--brand-primary)">
            <Sparkles size={12} />
            {labels.eyebrow}
          </span>
          <h1 className="mt-5 text-4xl font-bold leading-tight sm:text-5xl lg:text-[3.5rem] lg:leading-[1.1]">
            <span className="brand-gradient-text">{labels.title}</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-(--text-secondary) sm:text-lg sm:leading-8">
            {labels.subtitle}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href={siteLinks.app}
              target="_blank"
              rel="noreferrer"
              data-cta="signup"
              data-cta-location="hero"
              className="inline-flex items-center gap-2 rounded-xl bg-(--brand-primary) px-5 py-3 text-sm font-semibold text-white shadow-(--shadow-soft) transition hover:bg-(--brand-secondary)"
            >
              {labels.cta1}
              <ArrowRight size={16} />
            </a>
            <a
              href="#capabilities"
              data-cta="explore"
              data-cta-location="hero"
              className="inline-flex items-center gap-2 rounded-xl border border-(--border-subtle) bg-(--surface-card) px-5 py-3 text-sm font-semibold text-(--text-primary) transition hover:border-(--brand-primary)"
            >
              {labels.cta2}
            </a>
          </div>
          <div className="mt-10 grid grid-cols-3 gap-4 max-w-md text-xs text-(--text-muted)">
            <div>
              <div className="text-2xl font-bold text-(--text-primary)">{labels.statWorld}</div>
              <div className="mt-1">{labels.statWorldDesc}</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-(--text-primary)">{labels.statSync}</div>
              <div className="mt-1">{labels.statSyncDesc}</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-(--text-primary)">{labels.statFree}</div>
              <div className="mt-1">{labels.statFreeDesc}</div>
            </div>
          </div>
        </div>

        <div className="relative lg:col-span-6">
          <div className="relative overflow-hidden rounded-3xl border border-(--border-subtle) bg-(--surface-card) shadow-(--shadow-shell)">
            <div className="flex items-center gap-1.5 border-b border-(--border-faint) px-4 py-2.5" aria-hidden="true">
              <span className="size-2.5 rounded-full bg-rose-300/80" />
              <span className="size-2.5 rounded-full bg-amber-300/80" />
              <span className="size-2.5 rounded-full bg-emerald-300/80" />
              <span className="ml-3 text-[11px] font-medium text-(--text-dim)">{labels.coreLoop}</span>
            </div>
            {/*
              Animated WebP cuts the GIF payload by ~80%, dramatically
              improving LCP on the hero. unoptimized: skip Next's image
              optimizer (which would lose animation frames).
            */}
            <Image
              src={`/animations/${locale}.webp`}
              alt={labels.gifAlt}
              width={1200}
              height={750}
              unoptimized
              priority
              fetchPriority="high"
              className="block w-full h-auto"
            />
          </div>
          <div aria-hidden className="absolute -inset-4 -z-10 rounded-3xl bg-(--brand-gradient) opacity-20 blur-3xl" />
        </div>
      </div>
    </section>
  );
}
