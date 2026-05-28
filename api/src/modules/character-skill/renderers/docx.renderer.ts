import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

import type {
  DocBlockSpec,
  DocSpec,
  DocumentRenderer,
} from './renderer.types';

// 把 LLM 产出的 DocSpec 原生渲染成 .docx。容错：缺字段给默认、坏块跳过。

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function asText(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return fallback;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => asText(v).trim()).filter((v) => v.length > 0);
}

const HEADING_BY_LEVEL = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
} as const;

function renderBlock(block: DocBlockSpec): Array<Paragraph | Table> {
  switch (block?.type) {
    case 'heading': {
      const level = HEADING_BY_LEVEL[(block.level ?? 2) as 1 | 2 | 3] ??
        HeadingLevel.HEADING_2;
      return [new Paragraph({ text: asText(block.text), heading: level })];
    }
    case 'bullets':
      return asStringList(block.items).map(
        (text) => new Paragraph({ text, bullet: { level: 0 } }),
      );
    case 'table': {
      const headers = asStringList(block.table?.headers);
      const rows = Array.isArray(block.table?.rows) ? block.table!.rows : [];
      const tableRows: TableRow[] = [];
      if (headers.length) {
        tableRows.push(
          new TableRow({
            tableHeader: true,
            children: headers.map(
              (h) =>
                new TableCell({
                  children: [
                    new Paragraph({ children: [new TextRun({ text: h, bold: true })] }),
                  ],
                }),
            ),
          }),
        );
      }
      for (const row of rows) {
        const cells = Array.isArray(row) ? row : [];
        const width = Math.max(headers.length, cells.length, 1);
        tableRows.push(
          new TableRow({
            children: Array.from({ length: width }, (_, i) => i).map(
              (i) =>
                new TableCell({
                  children: [new Paragraph(asText(cells[i]))],
                }),
            ),
          }),
        );
      }
      if (!tableRows.length) return [];
      return [
        new Table({
          rows: tableRows,
          width: { size: 100, type: WidthType.PERCENTAGE },
        }),
      ];
    }
    case 'paragraph':
    default:
      return [new Paragraph({ text: asText(block.text) })];
  }
}

export const docxRenderer: DocumentRenderer<DocSpec> = {
  mimeType: DOCX_MIME,
  ext: 'docx',
  async render(spec: DocSpec): Promise<Buffer> {
    const children: Array<Paragraph | Table> = [];

    children.push(
      new Paragraph({
        text: asText(spec.title) || '未命名文档',
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.LEFT,
      }),
    );

    const blocks = Array.isArray(spec.blocks) ? spec.blocks : [];
    for (const block of blocks) {
      try {
        children.push(...renderBlock(block));
      } catch {
        // 坏块跳过，保住整份产出
      }
    }

    const doc = new Document({ sections: [{ children }] });
    return Packer.toBuffer(doc);
  },
};
