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
    heroShotAlt: i18n._("隐界手机界面：像微信一样的消息列表，住着你的专家居民和数字分身"),
    floatName: i18n._("林医生"),
    floatTag: i18n._("主动关心"),
    floatBody: i18n._("最近睡得还好吗？有什么不舒服随时找我。"),
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

        <div className="relative flex justify-center lg:col-span-6 lg:justify-end">
          <div className="relative">
            {/*
              Real screenshot of the live app (captured via
              scripts/capture-app-screenshots.mjs), framed as a phone so the
              hero shows the actual product rather than a mockup or animation.
            */}
            <div className="relative w-[270px] overflow-hidden rounded-[2.5rem] border-[10px] border-(--text-primary)/80 bg-(--text-primary)/80 shadow-(--shadow-shell) sm:w-[300px]">
              <Image
                src={`/screenshots/${locale}/chatlist.png`}
                alt={labels.heroShotAlt}
                width={390}
                height={844}
                priority
                fetchPriority="high"
                className="block h-auto w-full rounded-[1.75rem]"
              />
            </div>
            <div className="absolute -left-4 bottom-20 hidden w-48 rotate-[-5deg] rounded-2xl border border-(--border-subtle) bg-(--surface-card) p-3 shadow-(--shadow-lift) sm:block">
              <div className="flex items-center gap-2">
                <span className="grid size-7 place-items-center rounded-full bg-(--brand-gradient) text-[11px] font-semibold text-white">
                  医
                </span>
                <span className="text-sm font-semibold text-(--text-primary)">{labels.floatName}</span>
                <span className="ml-auto rounded-full bg-(--brand-primary)/12 px-2 py-0.5 text-[10px] font-medium text-(--brand-primary)">
                  {labels.floatTag}
                </span>
              </div>
              <p className="mt-2 text-xs leading-5 text-(--text-secondary)">{labels.floatBody}</p>
            </div>
            <div aria-hidden className="absolute -inset-6 -z-10 rounded-[3rem] bg-(--brand-gradient) opacity-20 blur-3xl" />
          </div>
        </div>
      </div>
    </section>
  );
}
