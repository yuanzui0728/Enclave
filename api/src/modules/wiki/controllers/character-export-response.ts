import type { Response } from 'express';

/**
 * 把私有角色导出 bundle 作为 .character.json 附件下载发出。
 * 文件名同时给 ASCII fallback（老浏览器）+ RFC 5987 filename*（现代浏览器正确显示中文）。
 *
 * 私有角色导出（owner 自导）与角色广场公开下载共用同一套响应逻辑。
 */
export function sendCharacterExportBundle(
  res: Response,
  bundle: unknown,
  rawName: string,
): void {
  const safeName = (rawName || '')
    .replace(/[\\/:*?"<>|\r\n\t]+/g, '_')
    .slice(0, 80);
  const baseName = safeName || 'character';
  const asciiName = baseName.replace(/[^\x20-\x7E]/g, '_');
  const utf8Encoded = encodeURIComponent(baseName);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${asciiName}.character.json"; filename*=UTF-8''${utf8Encoded}.character.json`,
  );
  res.send(JSON.stringify(bundle, null, 2));
}
