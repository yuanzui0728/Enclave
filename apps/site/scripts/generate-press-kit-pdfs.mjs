#!/usr/bin/env node
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const siteRoot = path.dirname(path.dirname(__filename));
const publicRoot = path.join(siteRoot, "public");
const outDir = path.join(publicRoot, "press-kit");
const tmpDir = path.join(siteRoot, ".tmp", "press-kit-pdfs");
const logoPath = path.join(outDir, "enclave-logo-mark-512.png");

const COPY = {
  "zh-CN": {
    title: "隐界 Enclave 产品介绍",
    subtitle: "一个属于你的 AI 虚拟世界",
    intro: "隐界 Enclave 是面向长期陪伴和深度对话的 AI 社交世界。每个用户拥有一个私人世界，里面有 AI 居民、朋友圈、群聊、电话和笔记。",
    factsTitle: "快速事实",
    sectionsTitle: "报道要点",
    contactTitle: "媒体联系",
    facts: [
      ["产品定位", "AI 社交世界，不是问答式 chatbot"],
      ["核心体验", "私人 AI 居民、朋友圈、群聊、电话"],
      ["隐私架构", "一人一世界，每个实例只服务一个真实用户"],
      ["开源许可", "MIT License，可自部署、审计和二次开发"],
      ["平台状态", "Web 已可用，桌面端支持 Windows / macOS，移动端与小程序在路上"],
    ],
    sections: [
      "隐界把 AI 从单次问答变成长期关系：角色会记住过去的互动，也会在合适的时候主动联系用户。",
      "产品采用一人一世界的实例架构，适合重视隐私、数据可迁移和自部署能力的用户。",
      "官网 Press Kit 提供产品介绍 PDF、截图、Logo 和创始人插画头像，媒体与创作者可直接使用。",
    ],
    contact: "采访、补充素材或合作需求请联系 yuanzui0728@gmail.com。",
  },
  "en-US": {
    title: "Enclave Product Introduction",
    subtitle: "A private AI world of your own",
    intro: "Enclave is an AI social world built for long-running companionship and deeper conversations. Every user gets a private world with AI residents, moments, group chats, calls, and notes.",
    factsTitle: "Quick facts",
    sectionsTitle: "Story angles",
    contactTitle: "Media contact",
    facts: [
      ["Positioning", "An AI social world, not a Q&A chatbot"],
      ["Core experience", "Private AI residents, moments, groups, calls, and notes"],
      ["Privacy architecture", "One world per person; each instance serves one real user"],
      ["License", "MIT License; self-hostable, auditable, and forkable"],
      ["Platform status", "Web is live; Windows / macOS desktop builds are available; mobile and mini-program are on the way"],
    ],
    sections: [
      "Enclave turns AI from one-off answers into long-term relationships: characters remember past interactions and can reach out proactively.",
      "The product uses a one-person-one-world architecture, built for users who care about privacy, data portability, and self-hosting.",
      "The website Press Kit includes the product PDF, screenshots, logo, and founder illustration avatar for media and creators.",
    ],
    contact: "For interviews, additional assets, or collaboration, contact yuanzui0728@gmail.com.",
  },
  "ja-JP": {
    title: "隐界 Enclave 製品紹介",
    subtitle: "あなただけの AI バーチャルワールド",
    intro: "隐界 Enclave は、長期的な伴走と深い会話のための AI ソーシャルワールドです。各ユーザーは、AI 住人、モーメンツ、グループチャット、通話、ノートを備えたプライベートな世界を持てます。",
    factsTitle: "概要",
    sectionsTitle: "紹介ポイント",
    contactTitle: "メディア連絡先",
    facts: [
      ["位置づけ", "Q&A チャットボットではなく、AI ソーシャルワールド"],
      ["主な体験", "プライベート AI 住人、モーメンツ、グループ、通話、ノート"],
      ["プライバシー構造", "一人に一つの世界。各インスタンスは一人の実ユーザーだけに対応"],
      ["ライセンス", "MIT License。セルフホスト、監査、二次開発が可能"],
      ["対応状況", "Web は利用可能。Windows / macOS デスクトップ版を提供し、モバイルとミニプログラムは準備中"],
    ],
    sections: [
      "Enclave は AI を単発の回答から長期的な関係へ変えます。キャラクターは過去のやり取りを覚え、必要に応じて自分から話しかけます。",
      "一人一世界のアーキテクチャにより、プライバシー、データ移行性、セルフホストを重視するユーザーに向いています。",
      "公式サイトの Press Kit には、製品 PDF、スクリーンショット、ロゴ、創始者イラスト头像が含まれ、メディアやクリエイターが利用できます。",
    ],
    contact: "取材、追加素材、協業については yuanzui0728@gmail.com までご連絡ください。",
  },
  "ko-KR": {
    title: "엔클레이브 Enclave 제품 소개",
    subtitle: "당신만의 프라이빗 AI 세계",
    intro: "엔클레이브는 장기적인 동행과 깊은 대화를 위해 설계된 AI 소셜 월드입니다. 각 사용자는 AI 주민, 모먼트, 그룹 채팅, 통화, 노트를 갖춘 자신만의 프라이빗 세계를 가집니다.",
    factsTitle: "빠른 정보",
    sectionsTitle: "보도 포인트",
    contactTitle: "미디어 연락처",
    facts: [
      ["포지셔닝", "Q&A 챗봇이 아닌 AI 소셜 월드"],
      ["핵심 경험", "프라이빗 AI 주민, 모먼트, 그룹, 통화, 노트"],
      ["개인정보 구조", "한 사람당 하나의 세계. 각 인스턴스는 한 명의 실제 사용자만을 위해 동작"],
      ["라이선스", "MIT License. 자체 호스팅, 감사, 2차 개발 가능"],
      ["플랫폼 상태", "Web 사용 가능. Windows / macOS 데스크톱을 지원하며 모바일과 미니 프로그램은 준비 중"],
    ],
    sections: [
      "Enclave는 AI를 일회성 답변에서 장기적인 관계로 확장합니다. 캐릭터는 이전 상호작용을 기억하고 적절한 순간 먼저 다가올 수 있습니다.",
      "한 사람당 하나의 세계 구조는 개인정보, 데이터 이동성, 자체 호스팅을 중요하게 여기는 사용자에게 적합합니다.",
      "공식 사이트 Press Kit에는 제품 PDF, 스크린샷, 로고, 창업자 일러스트 아바타가 포함되어 미디어와 크리에이터가 바로 사용할 수 있습니다.",
    ],
    contact: "인터뷰, 추가 자료, 협업 문의는 yuanzui0728@gmail.com 으로 연락해 주세요.",
  },
};

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function officeBinary() {
  for (const candidate of ["libreoffice", "soffice"]) {
    const check = spawnSync("which", [candidate], { encoding: "utf8" });
    if (check.status === 0) return candidate;
  }
  throw new Error("LibreOffice is required to generate Press Kit PDFs.");
}

function renderHtml(locale, copy) {
  const logoUrl = pathToFileURL(logoPath).href;
  const facts = copy.facts
    .map(([label, body]) => `<div class="fact"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(body)}</span></div>`)
    .join("");
  const sections = copy.sections.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  return `<!doctype html>
<html lang="${locale}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(copy.title)}</title>
  <style>
    @page { size: A4; margin: 18mm; }
    body {
      margin: 0;
      color: #1a0f05;
      background: #fffdf7;
      font-family: "Noto Sans CJK SC", "Noto Sans CJK JP", "Noto Sans CJK KR", "PingFang SC", "Microsoft YaHei", Arial, sans-serif;
      line-height: 1.62;
    }
    .hero {
      padding: 30px 32px;
      border-radius: 20px;
      background: linear-gradient(135deg, #fff7e8, #ffffff 62%, #e8f7f0);
      border: 1px solid #f1dfc6;
    }
    .brand { display: flex; align-items: center; gap: 14px; color: #7a6454; font-weight: 700; }
    .brand img { width: 52px; height: 52px; border-radius: 14px; }
    h1 { margin: 30px 0 0; font-size: 34px; line-height: 1.18; }
    .subtitle { margin-top: 8px; font-size: 18px; color: #f97316; font-weight: 800; }
    .intro { margin-top: 22px; font-size: 14px; color: #4a3728; }
    h2 { margin: 30px 0 14px; font-size: 20px; }
    .facts { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .fact { min-height: 82px; padding: 14px; border-radius: 14px; background: #ffffff; border: 1px solid #f1dfc6; }
    .fact strong { display: block; color: #f97316; font-size: 12px; margin-bottom: 5px; }
    .fact span { display: block; color: #4a3728; font-size: 12px; }
    ul { margin: 0; padding-left: 22px; color: #4a3728; font-size: 13px; }
    li { margin-bottom: 10px; }
    .contact { margin-top: 20px; padding: 16px; border-radius: 14px; background: #fff7e8; color: #4a3728; font-size: 13px; }
    .footer { margin-top: 26px; color: #7a6454; font-size: 11px; }
  </style>
</head>
<body>
  <section class="hero">
    <div class="brand"><img src="${logoUrl}" alt="" /> <span>Enclave / 隐界</span></div>
    <h1>${escapeHtml(copy.title)}</h1>
    <div class="subtitle">${escapeHtml(copy.subtitle)}</div>
    <p class="intro">${escapeHtml(copy.intro)}</p>
  </section>
  <h2>${escapeHtml(copy.factsTitle)}</h2>
  <section class="facts">${facts}</section>
  <h2>${escapeHtml(copy.sectionsTitle)}</h2>
  <ul>${sections}</ul>
  <h2>${escapeHtml(copy.contactTitle)}</h2>
  <div class="contact">${escapeHtml(copy.contact)}</div>
  <div class="footer">GitHub: https://github.com/yuanzui0728/yinjie-app · Website: http://1gw06751dd053.vicp.fun</div>
</body>
</html>`;
}

ensureDir(outDir);
ensureDir(tmpDir);

if (!existsSync(logoPath)) {
  throw new Error(`Missing Press Kit logo: ${logoPath}. Run scripts/sync-assets.mjs first.`);
}

const office = officeBinary();

for (const [locale, copy] of Object.entries(COPY)) {
  const htmlFile = path.join(tmpDir, `enclave-product-intro-${locale}.html`);
  const pdfFile = path.join(outDir, `enclave-product-intro-${locale}.pdf`);
  writeFileSync(htmlFile, renderHtml(locale, copy));
  const result = spawnSync(office, ["--headless", "--convert-to", "pdf", "--outdir", outDir, htmlFile], {
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`Failed to generate ${pdfFile}`);
  }
  if (!existsSync(pdfFile)) {
    throw new Error(`LibreOffice did not write ${pdfFile}`);
  }
}

rmSync(tmpDir, { recursive: true, force: true });
console.log("[site:press-kit-pdf] generated=4");
