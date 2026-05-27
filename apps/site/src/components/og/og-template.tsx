import type { I18n } from "@lingui/core";
import { SUPPORTED_LOCALES, type SupportedLocale } from "@/lib/locales";

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png";

export function renderOgTemplate(locale: SupportedLocale, i18n: I18n) {
  const title = i18n._("一个属于你的私人助手世界");
  const subtitle = i18n._("私人 AI 世界 · 浏览器即开即用 · 多端同步");
  const tagline = i18n._("免费开始");
  const brandLine = i18n._("隐界 Enclave");
  const langCount = i18n._("语言版本");

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "72px",
        background: "linear-gradient(135deg, #fffcf5 0%, #fff4e0 60%, #ffe4bf 100%)",
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          marginBottom: 32,
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: "linear-gradient(135deg, #fbbf24, #f97316)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontSize: 28,
            fontWeight: 700,
          }}
        >
          隐
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ color: "#1a0f05", fontSize: 22, fontWeight: 600 }}>
            {brandLine}
          </span>
          <span style={{ color: "#7a6454", fontSize: 14 }}>{locale}</span>
        </div>
      </div>
      <div
        style={{
          fontSize: 64,
          fontWeight: 700,
          lineHeight: 1.15,
          background: "linear-gradient(120deg, #f97316, #fb923c)",
          backgroundClip: "text",
          WebkitBackgroundClip: "text",
          color: "transparent",
          maxWidth: "84%",
        }}
      >
        {title}
      </div>
      <div
        style={{
          marginTop: 32,
          color: "#4a3728",
          fontSize: 28,
          maxWidth: "82%",
          lineHeight: 1.4,
        }}
      >
        {subtitle}
      </div>
      <div style={{ flex: 1 }} />
      <div
        style={{
          display: "flex",
          gap: 24,
          color: "#7a6454",
          fontSize: 22,
        }}
      >
        <span>· {tagline}</span>
        <span>
          · {SUPPORTED_LOCALES.length} {langCount}
        </span>
      </div>
    </div>
  );
}
