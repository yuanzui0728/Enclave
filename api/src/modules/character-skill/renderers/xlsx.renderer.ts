import ExcelJS from 'exceljs';

import type { DocumentRenderer, SheetSpec } from './renderer.types';

// 把 LLM 产出的 SheetSpec 原生渲染成 .xlsx。容错：缺列从行键推导、坏 sheet 跳过。

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function asText(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return fallback;
}

// Excel sheet 名上限 31 字符且禁用 []:*?/\ 字符。
function sanitizeSheetName(name: string, index: number): string {
  const cleaned = name.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31);
  return cleaned || `Sheet${index + 1}`;
}

export const xlsxRenderer: DocumentRenderer<SheetSpec> = {
  mimeType: XLSX_MIME,
  ext: 'xlsx',
  async render(spec: SheetSpec): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = '隐界';
    workbook.created = new Date();

    const sheets =
      Array.isArray(spec.sheets) && spec.sheets.length
        ? spec.sheets
        : [{ name: 'Sheet1', columns: [], rows: [] }];

    sheets.forEach((sheetSpec, index) => {
      try {
        const ws = workbook.addWorksheet(
          sanitizeSheetName(asText(sheetSpec?.name, ''), index),
        );

        const rows = Array.isArray(sheetSpec?.rows) ? sheetSpec!.rows : [];

        // 列：优先用声明的 columns；否则从首行键推导。
        let columns = Array.isArray(sheetSpec?.columns)
          ? sheetSpec!.columns.filter((c) => c && (c.key || c.header))
          : [];
        if (!columns.length && rows.length) {
          columns = Object.keys(rows[0] ?? {}).map((key) => ({
            key,
            header: key,
          }));
        }
        if (!columns.length) {
          return;
        }

        ws.columns = columns.map((c) => ({
          header: asText(c.header, asText(c.key, '')),
          key: asText(c.key, asText(c.header, '')),
          width:
            typeof c.width === 'number' && c.width > 0
              ? c.width
              : Math.min(
                  40,
                  Math.max(12, asText(c.header, asText(c.key)).length + 6),
                ),
        }));

        for (const row of rows) {
          if (row && typeof row === 'object') {
            ws.addRow(row);
          }
        }

        const headerRow = ws.getRow(1);
        headerRow.font = { bold: true };
        headerRow.alignment = { vertical: 'middle' };

        if (sheetSpec?.freezeHeader !== false) {
          ws.views = [{ state: 'frozen', ySplit: 1 }];
        }
      } catch {
        // 坏 sheet 跳过，保住整份产出
      }
    });

    // 兜底：一个 sheet 都没成功建出时补一个空表，避免 exceljs 写空 workbook 报错。
    if (!workbook.worksheets.length) {
      workbook.addWorksheet('Sheet1');
    }

    const out = await workbook.xlsx.writeBuffer();
    return Buffer.from(out as ArrayBuffer);
  },
};
