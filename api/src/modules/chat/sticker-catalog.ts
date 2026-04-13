import type { StickerAttachment } from './chat.types';

export interface StickerCatalogItem {
  id: string;
  src: string;
  width: number;
  height: number;
  label: string;
  keywords: string[];
  mimeType?: string;
}

export interface StickerPack {
  id: string;
  title: string;
  coverStickerId: string;
  stickers: StickerCatalogItem[];
}

const STICKER_PACKS: StickerPack[] = [
  {
    id: 'yinjie-mochi',
    title: '麻薯日常',
    coverStickerId: 'ok',
    stickers: [
      { id: 'ok', src: '/stickers/yinjie-mochi/ok.svg', width: 160, height: 160, label: '赞同', keywords: ['赞同', '收到', 'ok', '好'] },
      { id: 'wave', src: '/stickers/yinjie-mochi/wave.svg', width: 160, height: 160, label: '打招呼', keywords: ['招呼', '你好', '嗨', 'hi'] },
      { id: 'wow', src: '/stickers/yinjie-mochi/wow.svg', width: 160, height: 160, label: '震惊', keywords: ['震惊', '吃惊', '啊', '什么'] },
      { id: 'hug', src: '/stickers/yinjie-mochi/hug.svg', width: 160, height: 160, label: '抱抱', keywords: ['抱抱', '安慰', '贴贴'] },
      { id: 'sleep', src: '/stickers/yinjie-mochi/sleep.svg', width: 160, height: 160, label: '困了', keywords: ['困了', '睡觉', '晚安', '休息'] },
      { id: 'angry', src: '/stickers/yinjie-mochi/angry.svg', width: 160, height: 160, label: '生气', keywords: ['生气', '无语', '怒', '气'] },
    ],
  },
  {
    id: 'yinjie-bubble',
    title: '气泡对白',
    coverStickerId: 'cheer',
    stickers: [
      { id: 'cheer', src: '/stickers/yinjie-bubble/cheer.svg', width: 180, height: 180, label: '冲呀', keywords: ['冲呀', '加油', '开干'] },
      { id: 'goodnight', src: '/stickers/yinjie-bubble/goodnight.svg', width: 180, height: 180, label: '晚安', keywords: ['晚安', '休息', '睡了'] },
      { id: 'thanks', src: '/stickers/yinjie-bubble/thanks.svg', width: 180, height: 180, label: '谢谢', keywords: ['谢谢', '感谢', '辛苦了'] },
      { id: 'thinking', src: '/stickers/yinjie-bubble/thinking.svg', width: 180, height: 180, label: '思考中', keywords: ['思考', '等等', '让我想想'] },
      { id: 'approve', src: '/stickers/yinjie-bubble/approve.svg', width: 180, height: 180, label: '收到', keywords: ['收到', '明白', '行', 'ok'] },
      { id: 'laugh', src: '/stickers/yinjie-bubble/laugh.svg', width: 180, height: 180, label: '笑出声', keywords: ['笑', '哈哈', '乐', '开心'] },
    ],
  },
];

const STICKERS: StickerAttachment[] = STICKER_PACKS.flatMap((pack) =>
  pack.stickers.map((sticker) => ({
    kind: 'sticker' as const,
    sourceType: 'builtin' as const,
    packId: pack.id,
    stickerId: sticker.id,
    url: sticker.src,
    mimeType: sticker.mimeType ?? inferStickerMimeType(sticker.src),
    width: sticker.width,
    height: sticker.height,
    label: sticker.label,
  })),
);

export function getStickerPackCatalog(): StickerPack[] {
  return STICKER_PACKS.map((pack) => ({
    ...pack,
    stickers: pack.stickers.map((sticker) => ({
      ...sticker,
      keywords: [...sticker.keywords],
    })),
  }));
}

export function findStickerAttachment(
  packId: string,
  stickerId: string,
): StickerAttachment | null {
  return (
    STICKERS.find(
      (item) => item.packId === packId && item.stickerId === stickerId,
    ) ?? null
  );
}

function inferStickerMimeType(url: string) {
  if (url.endsWith('.gif')) {
    return 'image/gif';
  }

  if (url.endsWith('.webp')) {
    return 'image/webp';
  }

  if (url.endsWith('.svg')) {
    return 'image/svg+xml';
  }

  return 'image/png';
}
