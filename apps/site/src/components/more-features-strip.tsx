import {
  Dices,
  Gift,
  Mic,
  Package,
  PiggyBank,
  Sparkles,
  Video,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import { msg } from "@lingui/macro";
import type { MessageDescriptor } from "@lingui/core";
import { getServerI18n } from "@/i18n/server";
import type { SupportedLocale } from "@/lib/locales";

const MORE: Array<{ icon: LucideIcon; label: MessageDescriptor }> = [
  { icon: Package, label: msg`商城与礼物柜` },
  { icon: Gift, label: msg`聊天红包` },
  { icon: PiggyBank, label: msg`每日签到` },
  { icon: Dices, label: msg`游戏中心` },
  { icon: Mic, label: msg`语音克隆 · 通话` },
  { icon: Video, label: msg`自然语言造视频` },
  { icon: Wand2, label: msg`自然语言造游戏` },
  { icon: Sparkles, label: msg`自己造专家 · 角色广场` },
];

export async function MoreFeaturesStrip({ locale }: { locale: SupportedLocale }) {
  const i18n = await getServerI18n(locale);
  const title = i18n._("还有一整个世界的小东西");
  const subtitle = i18n._("生活层里还藏着很多——慢慢逛，慢慢发现。");

  return (
    <section className="relative py-12 sm:py-16">
      <div className="mx-auto max-w-5xl px-4 text-center sm:px-6 lg:px-8">
        <h2 className="text-xl font-semibold text-(--text-primary) sm:text-2xl">{title}</h2>
        <p className="mt-2 text-sm text-(--text-muted)">{subtitle}</p>
        <ul className="mt-6 flex flex-wrap justify-center gap-2.5">
          {MORE.map((m) => {
            const Icon = m.icon;
            return (
              <li
                key={m.label.id ?? String(m.label.message)}
                className="inline-flex items-center gap-2 rounded-full border border-(--border-subtle) bg-(--surface-card) px-3.5 py-2 text-sm text-(--text-secondary)"
              >
                <Icon size={15} className="text-(--brand-primary)" />
                <span>{i18n._(m.label)}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
