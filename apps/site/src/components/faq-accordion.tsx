import { ChevronDown } from "lucide-react";
import { msg } from "@lingui/macro";
import type { MessageDescriptor } from "@lingui/core";
import { getServerI18n } from "@/i18n/server";
import type { SupportedLocale } from "@/lib/locales";
import { JsonLd } from "./seo/json-ld";

const FAQS: Array<{ q: MessageDescriptor; a: MessageDescriptor }> = [
  {
    q: msg`隐界是做什么的？`,
    a: msg`隐界是一个属于你的私人助手世界。每个用户都有一个只属于自己的世界，里面住着各行各业的 AI 专家和你自己的分身——可以聊天、发朋友圈、打电话、记笔记。他们记得你、主动帮你，让专业支持成为日常的一部分。`,
  },
  {
    q: msg`和普通的 AI 聊天工具有什么不同？`,
    a: msg`普通的 chatbot 是问一句答一句、转头就忘；隐界里的专家有作息、有记忆、了解你的处境，会主动提醒你、给你打电话、记得你上次说的难题——像一支一直在你身边的专家团队，帮你把现实里的事办好。`,
  },
  {
    q: msg`需要付费吗？`,
    a: msg`免费注册即可开始使用，基础对话和功能完全免费。如果你需要更高级的模型、更多角色或更长记忆，可以选择按使用量付费的订阅。`,
  },
  {
    q: msg`我的隐私和数据安全吗？`,
    a: msg`隐界采用一人一世界的私人实例：你的对话只属于你，别人看不到，平台也不会拿去训练任何对外的模型。你可以随时导出全部数据。`,
  },
  {
    q: msg`我能信你不会偷偷用我的数据吗？`,
    a: msg`整套代码完全开源（MIT 许可），任何人都可以审计——包括你自己。如果你不放心托管版，也可以选择自己部署一份，数据全部留在你自己的机器上。`,
  },
  {
    q: msg`支持哪些设备？`,
    a: msg`浏览器打开就能用，无需安装。同时提供 Windows / macOS 桌面端，iOS / Android 与微信小程序在路上，所有平台同账号同步。`,
  },
];

export async function FaqAccordion({ locale }: { locale: SupportedLocale }) {
  const i18n = await getServerI18n(locale);
  const labels = {
    eyebrow: i18n._("常见问题"),
    title: i18n._("FAQ"),
    subtitle: i18n._("没找到你的问题？欢迎邮件联系我们。"),
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: i18n._(f.q),
      acceptedAnswer: {
        "@type": "Answer",
        text: i18n._(f.a),
      },
    })),
  };

  return (
    <section id="faq" className="relative scroll-mt-24 bg-(--surface-shell) py-16 sm:py-24">
      <JsonLd data={faqJsonLd} />
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <header className="text-center">
          <span className="text-sm font-semibold uppercase tracking-wider text-(--brand-primary)">
            {labels.eyebrow}
          </span>
          <h2 className="mt-2 text-3xl font-bold sm:text-4xl">{labels.title}</h2>
          <p className="mt-3 text-(--text-secondary)">{labels.subtitle}</p>
        </header>
        <ul className="mt-10 space-y-3">
          {FAQS.map((f) => (
            <li
              key={f.q.id ?? String(f.q.message)}
              className="overflow-hidden rounded-2xl border border-(--border-subtle) bg-(--surface-card)"
            >
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-left text-base font-semibold text-(--text-primary) transition hover:bg-(--surface-soft)">
                  <span>{i18n._(f.q)}</span>
                  <ChevronDown
                    size={18}
                    className="shrink-0 text-(--text-muted) transition group-open:rotate-180 group-open:text-(--brand-primary)"
                  />
                </summary>
                <div className="border-t border-(--border-faint) px-5 py-4 text-sm leading-7 text-(--text-secondary)">
                  {i18n._(f.a)}
                </div>
              </details>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
