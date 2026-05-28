// 角色技能产出物的「渲染规格」类型 + 渲染器统一接口。
//
// LLM 经 AiOrchestratorService.generateJsonObject 产出这些 spec，再由对应 renderer
// 原生渲染成 .pptx / .docx / .xlsx 的 Buffer。所有 renderer 必须「容错」：spec 字段
// 缺失就给默认值 / 跳过坏块，绝不因一页畸形整体抛——否则用户白扣了费却拿不到文件。

export type SkillArtifactType = 'pptx' | 'docx' | 'xlsx';

// ---- PPT（pptxgenjs）----
export interface DeckSlideSpec {
  layout?: 'title' | 'bullets' | 'two_column' | 'section';
  title?: string;
  subtitle?: string;
  bullets?: string[];
  columns?: { left?: string[]; right?: string[] };
  notes?: string;
}

export interface DeckSpec {
  title?: string;
  subtitle?: string;
  theme?: 'light' | 'dark';
  slides?: DeckSlideSpec[];
}

// ---- Word（docx）----
export interface DocBlockSpec {
  type?: 'heading' | 'paragraph' | 'bullets' | 'table';
  level?: 1 | 2 | 3;
  text?: string;
  items?: string[];
  table?: { headers?: string[]; rows?: string[][] };
}

export interface DocSpec {
  title?: string;
  blocks?: DocBlockSpec[];
}

// ---- Excel（exceljs）----
export interface SheetColumnSpec {
  header?: string;
  key?: string;
  width?: number;
}

export interface SheetSpec {
  sheets?: Array<{
    name?: string;
    columns?: SheetColumnSpec[];
    rows?: Array<Record<string, string | number | null>>;
    freezeHeader?: boolean;
  }>;
}

export type AnyArtifactSpec = DeckSpec | DocSpec | SheetSpec;

export interface DocumentRenderer<S extends AnyArtifactSpec = AnyArtifactSpec> {
  render(spec: S): Promise<Buffer>;
  mimeType: string;
  ext: string;
}
