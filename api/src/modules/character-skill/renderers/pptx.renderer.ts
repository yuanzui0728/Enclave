import PptxGenJS from 'pptxgenjs';

import type { DeckSlideSpec, DeckSpec, DocumentRenderer } from './renderer.types';

// 把 LLM 产出的 DeckSpec 原生渲染成 .pptx（16:9 宽屏）。容错：缺字段给默认、坏 slide 跳过。

const PPTX_MIME =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';

interface Theme {
  bg: string;
  title: string;
  body: string;
  accent: string;
}

const THEMES: Record<'light' | 'dark', Theme> = {
  light: { bg: 'FFFFFF', title: '1F2937', body: '374151', accent: '7C5BD9' },
  dark: { bg: '12101C', title: 'F5F3FF', body: 'D6CFF2', accent: '8B7BF0' },
};

function asText(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return fallback;
}

function asBullets(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asText(item).trim())
    .filter((item) => item.length > 0)
    .slice(0, 12);
}

function addTitleSlide(
  pptx: PptxGenJS,
  theme: Theme,
  title: string,
  subtitle: string,
) {
  const slide = pptx.addSlide();
  slide.background = { color: theme.bg };
  slide.addText(title || '未命名演示', {
    x: 0.6,
    y: 2.6,
    w: 12.1,
    h: 1.6,
    fontSize: 40,
    bold: true,
    color: theme.title,
    align: 'left',
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.6,
      y: 4.2,
      w: 12.1,
      h: 0.9,
      fontSize: 20,
      color: theme.body,
      align: 'left',
    });
  }
  slide.addShape('rect', {
    x: 0.6,
    y: 2.4,
    w: 2.2,
    h: 0.12,
    fill: { color: theme.accent },
    line: { color: theme.accent },
  });
}

function addHeading(slide: PptxGenJS.Slide, theme: Theme, title: string) {
  if (!title) return;
  slide.addText(title, {
    x: 0.6,
    y: 0.4,
    w: 12.1,
    h: 0.9,
    fontSize: 28,
    bold: true,
    color: theme.title,
  });
  slide.addShape('rect', {
    x: 0.6,
    y: 1.32,
    w: 1.6,
    h: 0.08,
    fill: { color: theme.accent },
    line: { color: theme.accent },
  });
}

function addBulletsSlide(
  pptx: PptxGenJS,
  theme: Theme,
  spec: DeckSlideSpec,
) {
  const slide = pptx.addSlide();
  slide.background = { color: theme.bg };
  addHeading(slide, theme, asText(spec.title));
  const bullets = asBullets(spec.bullets);
  if (bullets.length) {
    slide.addText(
      bullets.map((text) => ({ text, options: { bullet: true } })),
      {
        x: 0.7,
        y: 1.6,
        w: 11.9,
        h: 5.3,
        fontSize: 18,
        color: theme.body,
        lineSpacingMultiple: 1.3,
        valign: 'top',
      },
    );
  }
}

function addTwoColumnSlide(
  pptx: PptxGenJS,
  theme: Theme,
  spec: DeckSlideSpec,
) {
  const slide = pptx.addSlide();
  slide.background = { color: theme.bg };
  addHeading(slide, theme, asText(spec.title));
  const left = asBullets(spec.columns?.left);
  const right = asBullets(spec.columns?.right);
  const common = {
    y: 1.6,
    w: 5.85,
    h: 5.3,
    fontSize: 17,
    color: theme.body,
    lineSpacingMultiple: 1.3,
    valign: 'top' as const,
  };
  if (left.length) {
    slide.addText(
      left.map((text) => ({ text, options: { bullet: true } })),
      { ...common, x: 0.7 },
    );
  }
  if (right.length) {
    slide.addText(
      right.map((text) => ({ text, options: { bullet: true } })),
      { ...common, x: 6.85 },
    );
  }
}

function addSectionSlide(
  pptx: PptxGenJS,
  theme: Theme,
  spec: DeckSlideSpec,
) {
  const slide = pptx.addSlide();
  slide.background = { color: theme.accent };
  slide.addText(asText(spec.title) || asText(spec.subtitle), {
    x: 0.6,
    y: 3.1,
    w: 12.1,
    h: 1.3,
    fontSize: 34,
    bold: true,
    color: 'FFFFFF',
  });
}

export const pptxRenderer: DocumentRenderer<DeckSpec> = {
  mimeType: PPTX_MIME,
  ext: 'pptx',
  async render(spec: DeckSpec): Promise<Buffer> {
    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_WIDE'; // 13.33 x 7.5 in
    const theme = THEMES[spec.theme === 'dark' ? 'dark' : 'light'];

    addTitleSlide(pptx, theme, asText(spec.title), asText(spec.subtitle));

    const slides = Array.isArray(spec.slides) ? spec.slides : [];
    for (const slideSpec of slides) {
      try {
        switch (slideSpec?.layout) {
          case 'two_column':
            addTwoColumnSlide(pptx, theme, slideSpec);
            break;
          case 'section':
            addSectionSlide(pptx, theme, slideSpec);
            break;
          case 'title':
            addTitleSlide(
              pptx,
              theme,
              asText(slideSpec.title),
              asText(slideSpec.subtitle),
            );
            break;
          case 'bullets':
          default:
            addBulletsSlide(pptx, theme, slideSpec);
            break;
        }
      } catch {
        // 单页畸形跳过，保住整份产出
      }
    }

    const out = await pptx.write({ outputType: 'nodebuffer' });
    return out as Buffer;
  },
};
