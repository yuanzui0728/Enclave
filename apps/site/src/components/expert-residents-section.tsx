import { msg } from "@lingui/macro";
import type { MessageDescriptor } from "@lingui/core";
import { getServerI18n } from "@/i18n/server";
import type { SupportedLocale } from "@/lib/locales";
import { PhoneShot } from "./phone-shot";

// Real personas that ship by default (service-expert / fixed-world presets).
// Honesty guard: workplace-ops experts are being removed — not listed here.
const RESIDENTS: Array<{ initial: string; name: MessageDescriptor }> = [
  { initial: "医", name: msg`全科医生` },
  { initial: "律", name: msg`法律顾问` },
  { initial: "心", name: msg`情绪教练` },
  { initial: "财", name: msg`理财顾问` },
  { initial: "食", name: msg`饮食教练` },
  { initial: "职", name: msg`求职面试教练` },
  { initial: "眠", name: msg`睡眠陪伴医生` },
  { initial: "健", name: msg`健身教练` },
  { initial: "英", name: msg`英语老师` },
  { initial: "划", name: msg`职业规划顾问` },
];

const MINDS: MessageDescriptor[] = [
  msg`乔布斯`,
  msg`查理·芒格`,
  msg`纳瓦尔`,
  msg`Paul Graham`,
];

export async function ExpertResidentsSection({ locale }: { locale: SupportedLocale }) {
  const i18n = await getServerI18n(locale);
  const labels = {
    eyebrow: i18n._("谁住在这里"),
    title: i18n._("各行各业的专家居民，随叫随到"),
    subtitle: i18n._(
      "100+ 位预置专家居民，每一位都有数千字的专业底层逻辑。遇到不同的事就找对应的人——过去只有少数人请得起的专业支持，现在是你的日常。",
    ),
    mindsLabel: i18n._("还有一批「思想分身」陪你想问题"),
    mindsNote: i18n._("（基于公开思想与作品的灵感人格，并非真人本人）"),
    shotAlt: i18n._("隐界专家居民目录：医生、律师、理财、心理等各行各业的居民列表"),
  };

  return (
    <section id="capabilities" className="relative scroll-mt-24 bg-(--surface-shell) py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div className="order-2 flex justify-center lg:order-1 lg:justify-start">
            <PhoneShot
              locale={locale}
              shotKey="experts"
              alt={labels.shotAlt}
              width={300}
            />
          </div>
          <div className="order-1 lg:order-2">
            <span className="text-sm font-semibold uppercase tracking-wider text-(--brand-primary)">
              {labels.eyebrow}
            </span>
            <h2 className="mt-2 text-3xl font-bold leading-tight sm:text-4xl">{labels.title}</h2>
            <p className="mt-4 text-base leading-7 text-(--text-secondary)">{labels.subtitle}</p>

            <ul className="mt-7 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {RESIDENTS.map((r) => (
                <li
                  key={r.initial}
                  className="flex items-center gap-2.5 rounded-xl border border-(--border-subtle) bg-(--surface-card) px-3 py-2.5"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-(--brand-gradient) text-xs font-semibold text-white">
                    {r.initial}
                  </span>
                  <span className="truncate text-sm font-medium text-(--text-primary)">{i18n._(r.name)}</span>
                </li>
              ))}
            </ul>

            <div className="mt-6 rounded-2xl border border-(--border-faint) bg-(--surface-card) p-4">
              <div className="text-sm font-semibold text-(--text-primary)">{labels.mindsLabel}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {MINDS.map((m) => (
                  <span
                    key={m.id ?? String(m.message)}
                    className="rounded-full bg-(--surface-soft) px-3 py-1 text-xs font-medium text-(--brand-primary)"
                  >
                    {i18n._(m)}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-xs text-(--text-dim)">{labels.mindsNote}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
