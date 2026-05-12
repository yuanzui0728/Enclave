// i18n-ignore-file
import { createHash } from 'node:crypto';

// 24 个主题，覆盖情绪/场景/季节/动作。新增主题往末尾追加，不要插入中间，
// 否则会改变现有 (characterId, date) → 主题 的稳定映射。
export const MUSIC_THEMES: readonly string[] = [
  '夜行：星空下的独白',
  '清晨醒来的微光',
  '雨后积水中的倒影',
  '久别重逢',
  '在路上：旅程的中段',
  '从抽屉里翻出旧物',
  '凌晨三点失眠',
  '灯下独自写字',
  '临别车站',
  '等一通迟来的电话',
  '海边远景',
  '寒夜里取暖',
  '自嘲与释然',
  '初见时的惊鸿一瞥',
  '决定要远行',
  '通勤路上',
  '厨房里的小事',
  '像老电影里的画面',
  '节日前夕',
  '收到朋友的来信',
  '内心的一个疑问',
  '跨年那一刻',
  '一个人散步',
  '门外的雨声',
];

export const MUSIC_STYLES: readonly string[] = [
  '民谣叙事，具体场景细节',
  '内心独白，碎语自言自语',
  '都市电子，短句重复',
  '复古抒情，90s 港台味',
  '极简诗意，短行留白',
  '轻摇滚，直接的情绪',
  '爵士慢板，夜色调',
  '俏皮童谣，轻松感',
];

function ymd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// 用 sha1(characterId + YYYY-MM-DD) 的两个字节稳定选主题/风格
// 同角色同天稳定，跨角色或跨天都不同
export function pickThemeAndStyle(
  characterId: string,
  date: Date = new Date(),
): { theme: string; style: string } {
  const hash = createHash('sha1')
    .update(`${characterId}|${ymd(date)}`)
    .digest();
  const theme = MUSIC_THEMES[hash[0] % MUSIC_THEMES.length];
  const style = MUSIC_STYLES[hash[1] % MUSIC_STYLES.length];
  return { theme, style };
}
