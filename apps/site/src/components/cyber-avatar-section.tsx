import { Ear, History, ListChecks } from "lucide-react";
import { getServerI18n } from "@/i18n/server";
import type { SupportedLocale } from "@/lib/locales";
import { PhoneShot } from "./phone-shot";

export async function CyberAvatarSection({ locale }: { locale: SupportedLocale }) {
  const i18n = await getServerI18n(locale);
  const labels = {
    eyebrow: i18n._("你的数字分身"),
    title: i18n._("一个越来越懂你的分身，替你照看整个世界"),
    subtitle: i18n._(
      "分身会观察你的语气、在意的事和处事方式，慢慢长成另一个你。你忙、你离开、你睡着的时候，它替你接住世界里发生的事；回来时，再用你能接受的方式讲给你听。",
    ),
    m1Title: i18n._("倾听"),
    m1Body: i18n._("陪你说话、接住情绪，做你随时能找的那个「自己人」。"),
    m2Title: i18n._("复盘"),
    m2Body: i18n._("把你错过的对话与动态梳理成一份「世界发生了什么」。"),
    m3Title: i18n._("整理"),
    m3Body: i18n._("把零碎的念头与待办理清楚，把现实里的信号带回世界。"),
    encounter: i18n._("分身相遇：在你授权下，你的分身可以与别人的分身打个照面、带回灵感——你的世界依旧只属于你。"),
    shotAlt: i18n._("隐界数字分身面板：稳定内核、擅长领域、近期信号，替你照看世界"),
  };

  const modes = [
    { icon: Ear, title: labels.m1Title, body: labels.m1Body },
    { icon: History, title: labels.m2Title, body: labels.m2Body },
    { icon: ListChecks, title: labels.m3Title, body: labels.m3Body },
  ];

  return (
    <section className="relative py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <span className="text-sm font-semibold uppercase tracking-wider text-(--brand-primary)">
              {labels.eyebrow}
            </span>
            <h2 className="mt-2 text-3xl font-bold leading-tight sm:text-4xl">{labels.title}</h2>
            <p className="mt-4 text-base leading-7 text-(--text-secondary)">{labels.subtitle}</p>

            <div className="mt-7 grid gap-3">
              {modes.map((m) => {
                const Icon = m.icon;
                return (
                  <div
                    key={m.title}
                    className="flex items-start gap-3.5 rounded-2xl border border-(--border-subtle) bg-(--surface-card) p-4"
                  >
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-(--brand-soft) text-(--brand-primary)">
                      <Icon size={20} strokeWidth={2} />
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold text-(--text-primary)">{m.title}</h3>
                      <p className="mt-1 text-sm leading-6 text-(--text-secondary)">{m.body}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="mt-5 rounded-2xl bg-(--surface-soft) p-4 text-xs leading-6 text-(--text-secondary)">
              {labels.encounter}
            </p>
          </div>

          <div className="order-first flex justify-center lg:order-none lg:justify-end">
            <div className="relative">
              <div
                aria-hidden
                className="absolute -inset-8 -z-10 rounded-[3rem] bg-(--brand-gradient) opacity-20 blur-3xl"
              />
              <PhoneShot locale={locale} shotKey="avatar" alt={labels.shotAlt} width={300} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
