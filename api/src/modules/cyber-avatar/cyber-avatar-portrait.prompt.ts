// i18n-ignore-start: 后端文生图 prompt，非前端可本地化 UI。
// 分身专属「数字孪生立绘」的文生图 prompt：把 world owner 的结构化资料 + 分身性格内核
// 拼成一段画面描述。固定艺术风格前缀锁住「半写实数字孪生半身肖像 / 紫调霓虹光感 / 干净
// 虚化背景 / 竖版 / 无文字无 logo / 不要明星脸」，保证每个用户的立绘风格统一但形象各异。

export interface CyberAvatarPortraitPromptInput {
  gender?: string | null; // male | female | other | ''
  age?: number | null;
  occupation?: string | null;
  region?: string | null;
  interests?: string | null;
  identitySummary?: string | null; // 来自 stableCore，分身性格内核一句话
}

function mapGender(gender?: string | null): string {
  if (gender === 'male') return '男性';
  if (gender === 'female') return '女性';
  return '中性气质';
}

function ageBand(age?: number | null): string {
  if (!age || age <= 0) return '';
  if (age < 18) return '少年感';
  if (age < 26) return '青年（20 岁上下）';
  if (age < 36) return '青年（30 岁上下）';
  if (age < 50) return '成熟（40 岁上下）';
  return '沉稳年长气质';
}

export function buildCyberAvatarPortraitPrompt(
  input: CyberAvatarPortraitPromptInput,
): string {
  // 固定风格前缀：决定「这是什么」与统一调性。
  const style =
    '一张未来感的「数字孪生」半身肖像，半写实精致 3D 渲染风，' +
    '紫色霓虹光感与柔和体积光，干净虚化的深色科技背景，竖版居中构图，' +
    '人物气质温暖而有灵性，像一个由数据凝聚成形的赛博分身。' +
    '只画一个人，正面或微侧，半身（头与肩胸）。' +
    '不要任何文字、水印、logo、UI 元素，不要明星脸，不要多人。';

  // 动态特征：缺省的字段直接跳过，不硬塞空值。
  const traits: string[] = [];
  traits.push(mapGender(input.gender));
  const band = ageBand(input.age);
  if (band) traits.push(band);
  const occupation = (input.occupation ?? '').trim().slice(0, 40);
  if (occupation) traits.push(`职业气质贴近「${occupation}」`);
  const region = (input.region ?? '').trim().slice(0, 40);
  if (region) traits.push(`隐约带「${region}」的地域气息`);
  const interests = (input.interests ?? '').trim().slice(0, 80);
  if (interests) traits.push(`兴趣偏好：${interests}`);
  const identity = (input.identitySummary ?? '').trim().slice(0, 120);
  if (identity) traits.push(`性格内核：${identity}`);

  const persona = traits.filter(Boolean).join('；');
  return persona ? `${style}\n人物特征：${persona}。` : style;
}
// i18n-ignore-end
