import { CalendarDays, CloudSun, Clock, MapPin } from "lucide-react";
import { getServerI18n } from "@/i18n/server";
import type { SupportedLocale } from "@/lib/locales";

export async function TheShiftSection({ locale }: { locale: SupportedLocale }) {
  const i18n = await getServerI18n(locale);
  const labels = {
    eyebrow: i18n._("不一样的地方"),
    title: i18n._("不是问一句答一句，而是一个会过日子的世界"),
    subtitle: i18n._(
      "普通的 AI 转头就忘。隐界里的居民和你活在同一个当下——有季节、有天气、有作息。深夜的关心和午后的招呼不一样，他们记得你昨天说过的话。",
    ),
    nowTitle: i18n._("你的世界 · 此刻"),
    season: i18n._("初夏 · 周五傍晚"),
    weather: i18n._("多云转晴 · 26°C"),
    time: i18n._("18:42 · 该收尾今天了"),
    place: i18n._("下班路上"),
    p1Title: i18n._("有作息"),
    p1Body: i18n._("每位居民有自己的上下线时间和当前状态，不会半夜秒回得像机器。"),
    p2Title: i18n._("有记忆"),
    p2Body: i18n._("结构化长期记忆，几个月后仍记得你的处境，不用每次从头解释。"),
    p3Title: i18n._("会主动"),
    p3Body: i18n._("基于你的近况主动提醒、跟进、关心，而不是干等你开口。"),
  };

  const status = [
    { icon: CalendarDays, text: labels.season },
    { icon: CloudSun, text: labels.weather },
    { icon: Clock, text: labels.time },
    { icon: MapPin, text: labels.place },
  ];

  const points = [
    { title: labels.p1Title, body: labels.p1Body },
    { title: labels.p2Title, body: labels.p2Body },
    { title: labels.p3Title, body: labels.p3Body },
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
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {points.map((p) => (
                <div key={p.title} className="rounded-2xl border border-(--border-subtle) bg-(--surface-card) p-4">
                  <h3 className="text-sm font-semibold text-(--text-primary)">{p.title}</h3>
                  <p className="mt-1.5 text-xs leading-6 text-(--text-secondary)">{p.body}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div
              aria-hidden
              className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-(--brand-gradient) opacity-15 blur-3xl"
            />
            <div className="overflow-hidden rounded-3xl border border-(--border-subtle) bg-(--surface-card) shadow-(--shadow-shell)">
              <div className="relative h-28 w-full bg-gradient-to-r from-[#7C5BD9] via-[#9B7DE8] to-[#1a1430]">
                <div className="absolute inset-0 flex items-center justify-between px-6 text-white/90">
                  <span className="text-xs font-medium">{i18n._("清晨")}</span>
                  <span className="text-xs font-medium">{i18n._("午后")}</span>
                  <span className="text-xs font-medium">{i18n._("黄昏")}</span>
                  <span className="text-xs font-medium">{i18n._("深夜")}</span>
                </div>
              </div>
              <div className="p-6">
                <div className="text-sm font-semibold text-(--text-primary)">{labels.nowTitle}</div>
                <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                  {status.map((s) => {
                    const Icon = s.icon;
                    return (
                      <li
                        key={s.text}
                        className="flex items-center gap-2.5 rounded-xl bg-(--surface-soft) px-3 py-2.5 text-sm text-(--text-secondary)"
                      >
                        <Icon size={16} className="shrink-0 text-(--brand-primary)" />
                        <span>{s.text}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
