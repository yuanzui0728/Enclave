// i18n-ignore-start: 角色技能层的系统话术。与 action-runtime 一致用中文常量；世界语言由
// LLM 输出侧（generateJsonObject 的 prependTaskLanguageInstruction）负责，这里是确定性的
// 流程话术（报价/确认/退费），不走 LLM。

function yuan(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`;
}

// 报价确认语。信息齐、已出大纲后发，等用户回「确认」。
export function buildQuoteMessage(input: {
  artifactName: string; // PPT / Word 文档 / Excel 表格
  quantity: number;
  unit: string; // 页 / 张表
  priceCents: number;
  skipped: boolean; // 免费（系统/全局/未托管）
}): string {
  const scale = `约 ${input.quantity} ${input.unit}`;
  if (input.skipped) {
    return `好的，我按这个方向做一份${input.artifactName}（${scale}）。回「确认」我就开始制作～`;
  }
  return `好的，这份${input.artifactName}${scale}，预计消耗 ${yuan(
    input.priceCents,
  )}。回「确认」我就开始制作，做好直接发你。`;
}

// 缺槽追问语。
export function buildSlotQuestionMessage(input: {
  artifactName: string;
  questions: string[];
}): string {
  const list = input.questions.map((q, i) => `${i + 1}. ${q}`).join('\n');
  return `好，我来帮你做这份${input.artifactName}。先跟你确认几点，好让成品更贴合：\n${list}`;
}

// 已确认、开始制作（配合 typing 'document_generation'）。
export function buildStartedMessage(artifactName: string): string {
  return `收到，正在制作这份${artifactName}，稍等一下，做好马上发你～`;
}

// 用户取消 / 陈旧自动取消。
export function buildCancelledMessage(artifactName: string): string {
  return `那这份${artifactName}先不做啦，需要的时候随时叫我。`;
}

// 余额不足（承接 wallet WALLET_INSUFFICIENT）。
export function buildInsufficientMessage(input: {
  artifactName: string;
  priceCents: number;
}): string {
  return `这份${input.artifactName}需要 ${yuan(
    input.priceCents,
  )}，你的余额还差一点。充值后回「确认」我就开始做。`;
}

// 计费服务不可用（承接 WALLET_CHARGE_UNAVAILABLE）。
export function buildBillingUnavailableMessage(artifactName: string): string {
  return `计费服务这会儿有点忙，这份${artifactName}稍后再让我做一下吧。`;
}

// 渲染失败道歉（job 内，已退费）。
export function buildRenderFailedMessage(artifactName: string): string {
  return `抱歉，这份${artifactName}没能顺利做出来，费用已经退回。你可以让我再试一次。`;
}
// i18n-ignore-end
