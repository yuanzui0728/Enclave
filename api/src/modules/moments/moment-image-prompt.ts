// i18n-ignore-start: prompt content fed directly to MiniMax image-01.
import type { PersonalityProfile } from '../ai/ai.types';

// 组装"角色朋友圈自动配图"的 image-01 prompt（1:1 方图）。
//
// 设计目标：画面要符合角色身份和正在发的这条朋友圈内容，**不要**全部生成成
// 千篇一律的"奶茶 + 街头空镜"。所以塞进角色擅长领域 / 关系角色定位 / 情绪
// 基调，再把帖子文本前 200 字作为情境线索。
export function composeMomentImagePrompt(
  characterName: string,
  postText: string,
  profile?: PersonalityProfile | null,
): string {
  const cleanedText = postText.replace(/\s+/g, ' ').trim().slice(0, 200);

  const personaBits: string[] = [];
  if (profile?.relationship) {
    personaBits.push(`身份/关系：${profile.relationship.slice(0, 80)}`);
  }
  if (profile?.expertDomains?.length) {
    personaBits.push(
      `擅长领域：${profile.expertDomains.slice(0, 3).join('、')}`,
    );
  }
  const tone = profile?.traits?.emotionalTone;
  if (tone) personaBits.push(`情绪基调：${tone.slice(0, 40)}`);
  const interests = profile?.traits?.topicsOfInterest;
  if (interests?.length) {
    personaBits.push(`日常关心：${interests.slice(0, 3).join('、')}`);
  }

  return [
    `朋友圈配图：${characterName} 视角的生活实拍照片，1:1 方图。`,
    personaBits.length > 0 ? personaBits.join('；') : '',
    `配文情境：${cleanedText}`,
    '硬性要求：',
    '· 画面里的物件、场景、视角必须与角色身份和擅长领域一致——程序员→代码 / 工位 / 键盘 / 屏幕；厨师→灶台 / 食材 / 餐桌；设计师→草图 / 工具 / 工作台；不要默认就拍奶茶或空镜街景。',
    '· 镜头视角像角色本人随手举起手机拍下的，第一视角或近景生活感优先。',
    '· 风格：真实光线，轻度后期，色调与情绪贴合；不要插画风，不要明星脸特写。',
  ]
    .filter(Boolean)
    .join('\n');
}
// i18n-ignore-end
