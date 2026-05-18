import type { PrivateCharacterDto } from "./wiki-api";

/**
 * 判断"页面 session snapshot 是不是真有用户输入"——用来决定从草稿恢复时
 * 是否需要弹「覆盖未保存内容？」确认框。
 *
 * 仅当 sacred 字段（name / bio / relationship）任一非空，或 recipe 里 prompting
 * 任一字段非空时，才认为有"值得保护"的内容。
 */
export function hasMeaningfulDraftSnapshot(
  snap: PrivateCharacterDto | null,
): boolean {
  if (!snap || typeof snap !== "object") return false;
  if (snap.name?.trim()) return true;
  if (snap.bio?.trim()) return true;
  if (snap.relationship?.trim()) return true;
  if ((snap.expertDomains?.length ?? 0) > 0) return true;
  const recipe = (snap.recipe ?? {}) as Record<string, unknown>;
  const prompting = (recipe.prompting ?? {}) as Record<string, unknown>;
  if (typeof prompting.coreLogic === "string" && prompting.coreLogic.trim()) {
    return true;
  }
  const sp = (prompting.scenePrompts ?? {}) as Record<string, unknown>;
  for (const v of Object.values(sp)) {
    if (typeof v === "string" && v.trim()) return true;
  }
  const memorySeed = (recipe.memorySeed ?? {}) as Record<string, unknown>;
  for (const v of Object.values(memorySeed)) {
    if (typeof v === "string" && v.trim()) return true;
  }
  return false;
}
