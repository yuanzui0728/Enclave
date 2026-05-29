import { Bell, Heart } from "lucide-react";
import { getServerI18n } from "@/i18n/server";
import type { SupportedLocale } from "@/lib/locales";
import { PhoneShot } from "./phone-shot";

export async function MemoryProactiveSection({ locale }: { locale: SupportedLocale }) {
  const i18n = await getServerI18n(locale);
  const labels = {
    eyebrow: i18n._("会记得 · 会主动"),
    title: i18n._("几个月后，他还记得你上次说的难题"),
    subtitle: i18n._(
      "每段关系都有自己的记忆和进度。聊得越久，越懂你；到了该跟进的时候，他会主动开口——而不是等你想起来再问。",
    ),
    relTitle: i18n._("和林医生的关系"),
    relStage: i18n._("信任的老朋友"),
    relProgress: i18n._("亲密度 76 / 100"),
    relNote: i18n._("记得：你在备考、最近睡眠差、母亲高血压"),
    proTitle: i18n._("主动跟进"),
    proBody: i18n._("「上周说的面试今天吧？我把那几个高频问题又给你理了一版。」"),
    shotAlt: i18n._("隐界一对一聊天：专家记得你的处境，主动关心、跟进你提过的事"),
  };

  return (
    <section className="relative py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div className="flex justify-center lg:justify-start">
            <PhoneShot locale={locale} shotKey="chat" alt={labels.shotAlt} width={300} />
          </div>
          <div>
            <span className="text-sm font-semibold uppercase tracking-wider text-(--brand-primary)">
              {labels.eyebrow}
            </span>
            <h2 className="mt-2 text-3xl font-bold leading-tight sm:text-4xl">{labels.title}</h2>
            <p className="mt-4 text-base leading-7 text-(--text-secondary)">{labels.subtitle}</p>

            <div className="mt-7 grid gap-4">
              <div className="rounded-2xl border border-(--border-subtle) bg-(--surface-card) p-5">
                <div className="flex items-center gap-2">
                  <Heart size={16} className="text-(--brand-primary)" />
                  <span className="text-sm font-semibold text-(--text-primary)">{labels.relTitle}</span>
                  <span className="ml-auto text-xs font-medium text-(--brand-primary)">{labels.relStage}</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-(--surface-soft)">
                  <div className="h-full w-[76%] rounded-full bg-(--brand-gradient)" />
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-(--text-muted)">
                  <span>{labels.relProgress}</span>
                </div>
                <p className="mt-3 text-xs leading-6 text-(--text-secondary)">{labels.relNote}</p>
              </div>

              <div className="rounded-2xl border border-(--border-subtle) bg-(--surface-soft) p-5">
                <div className="flex items-center gap-2">
                  <Bell size={16} className="text-(--brand-primary)" />
                  <span className="text-sm font-semibold text-(--text-primary)">{labels.proTitle}</span>
                </div>
                <p className="mt-2 text-sm leading-6 text-(--text-secondary)">{labels.proBody}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
