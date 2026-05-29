import { BookOpenText, FileText, Presentation, Send, Table2 } from "lucide-react";
import { getServerI18n } from "@/i18n/server";
import type { SupportedLocale } from "@/lib/locales";

export async function RealOutputSection({ locale }: { locale: SupportedLocale }) {
  const i18n = await getServerI18n(locale);
  const labels = {
    eyebrow: i18n._("不只是建议，是交付物"),
    title: i18n._("一句话，专家直接把活干出来"),
    subtitle: i18n._(
      "在聊天里说清楚你要什么，专家居民直接产出能用的 PPT、Word、Excel；复杂的事还能整包派给他们当你的子助手，配上你的私人知识库，答得有据可依。",
    ),
    pptTitle: i18n._("PPT 演示"),
    pptDesc: i18n._("成稿即用的幻灯片"),
    docTitle: i18n._("Word 文档"),
    docDesc: i18n._("纪要 / 报告 / 方案"),
    xlsTitle: i18n._("Excel 表格"),
    xlsDesc: i18n._("清单 / 排期 / 测算"),
    delegateTitle: i18n._("任务派发"),
    delegateBody: i18n._("把一件复杂的事整包交给专家居民当你的子助手，他替你拆解、推进、回报。"),
    knowledgeTitle: i18n._("私人知识库"),
    knowledgeBody: i18n._("粘贴、上传任意格式或丢个网址，专家基于你的真实资料回答，而不是泛泛而谈。"),
  };

  const deliverables = [
    { icon: Presentation, title: labels.pptTitle, desc: labels.pptDesc },
    { icon: FileText, title: labels.docTitle, desc: labels.docDesc },
    { icon: Table2, title: labels.xlsTitle, desc: labels.xlsDesc },
  ];

  const extras = [
    { icon: Send, title: labels.delegateTitle, body: labels.delegateBody },
    { icon: BookOpenText, title: labels.knowledgeTitle, body: labels.knowledgeBody },
  ];

  return (
    <section className="relative bg-(--surface-shell) py-16 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <header className="mx-auto max-w-2xl text-center">
          <span className="text-sm font-semibold uppercase tracking-wider text-(--brand-primary)">
            {labels.eyebrow}
          </span>
          <h2 className="mt-2 text-3xl font-bold sm:text-4xl">{labels.title}</h2>
          <p className="mt-3 text-(--text-secondary)">{labels.subtitle}</p>
        </header>

        <ul className="mx-auto mt-10 grid max-w-4xl gap-4 sm:grid-cols-3">
          {deliverables.map((d) => {
            const Icon = d.icon;
            return (
              <li
                key={d.title}
                className="group rounded-2xl border border-(--border-subtle) bg-(--surface-card) p-5 shadow-(--shadow-soft) transition hover:shadow-(--shadow-lift)"
              >
                <div className="grid h-28 place-items-center rounded-xl bg-(--brand-soft)">
                  <Icon size={40} strokeWidth={1.5} className="text-(--brand-primary)" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-(--text-primary)">{d.title}</h3>
                <p className="mt-1 text-sm text-(--text-secondary)">{d.desc}</p>
              </li>
            );
          })}
        </ul>

        <ul className="mx-auto mt-4 grid max-w-4xl gap-4 sm:grid-cols-2">
          {extras.map((e) => {
            const Icon = e.icon;
            return (
              <li
                key={e.title}
                className="flex items-start gap-3.5 rounded-2xl border border-(--border-subtle) bg-(--surface-card) p-5"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-(--brand-soft) text-(--brand-primary)">
                  <Icon size={20} strokeWidth={2} />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-(--text-primary)">{e.title}</h3>
                  <p className="mt-1 text-sm leading-6 text-(--text-secondary)">{e.body}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
