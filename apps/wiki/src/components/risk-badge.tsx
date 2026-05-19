import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/macro";
import { useQuery } from "@tanstack/react-query";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { wikiApi } from "../lib/wiki-api";

const HIGH_RISK_PREFIXES = [
  "prompting.",
  "memorySeed.",
  "reasoning.",
  "lifeStrategy.",
  "tone.",
  "expertise.",
  "publishMapping.",
  "realityLink",
  "identity.background",
  "identity.motivation",
  "identity.worldview",
];

function isHighRisk(path: string): boolean {
  return HIGH_RISK_PREFIXES.some(
    (prefix) => path === prefix.replace(/\.$/, "") || path.startsWith(prefix),
  );
}

const ROLE_LABEL: Record<string, MessageDescriptor> = {
  newcomer: msg`新人`,
  autoconfirmed: msg`自动确认`,
  patroller: msg`巡查员`,
  admin: msg`管理员`,
};

const ROLE_RANK: Record<string, number> = {
  newcomer: 0,
  autoconfirmed: 1,
  patroller: 2,
  admin: 3,
};

function findProtectedRule(
  path: string,
  policy: Array<{ fieldPath: string; minRoleToEdit: string }>,
): { fieldPath: string; minRoleToEdit: string } | null {
  let best: { fieldPath: string; minRoleToEdit: string; rank: number } | null =
    null;
  for (const row of policy) {
    if (
      path === row.fieldPath ||
      path.startsWith(`${row.fieldPath}.`) ||
      row.fieldPath.startsWith(`${path}.`)
    ) {
      const rank = ROLE_RANK[row.minRoleToEdit] ?? -1;
      if (!best || rank > best.rank) {
        best = { ...row, rank };
      }
    }
  }
  return best;
}

export function RiskBadge({
  characterId,
  path,
  currentRole,
}: {
  characterId: string;
  path: string;
  currentRole?: string;
}) {
  const t = translateRuntimeMessage;
  const policyQ = useQuery({
    queryKey: ["wiki", "field-protection", characterId],
    queryFn: () => wikiApi.effectiveFieldProtection(characterId),
    staleTime: 60_000,
  });
  const protectedRule = policyQ.data
    ? findProtectedRule(path, policyQ.data)
    : null;
  const highRisk = isHighRisk(path);

  // 自定义字段保护规则加载失败时，UI 看不到锁，但服务器仍会拦截 ——
  // 这里显式提示用户"无法读取保护规则"，避免误以为字段开放编辑。
  if (policyQ.isError) {
    return (
      <span
        className="ml-2 inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-[color:var(--state-warning-bg)] text-[color:var(--state-warning-text)]"
        title={(policyQ.error as Error | null)?.message ?? ""}
      >
        ⚠ {t(msg`保护规则加载失败`)}
      </span>
    );
  }
  if (!highRisk && !protectedRule) return null;

  const minRole = protectedRule?.minRoleToEdit ?? "patroller";
  const minRank = ROLE_RANK[minRole] ?? 2;
  const userRank = currentRole ? (ROLE_RANK[currentRole] ?? -1) : -1;
  const blocked = userRank < minRank;

  if (blocked) {
    const minRoleLabel = ROLE_LABEL[minRole]
      ? t(ROLE_LABEL[minRole])
      : minRole;
    return (
      <span className="ml-2 inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-red-50 text-red-700">
        🔒 {t(msg`${minRoleLabel}+ 才能改`)}
      </span>
    );
  }
  if (highRisk) {
    return (
      <span className="ml-2 inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-orange-50 text-orange-700">
        {/* 原写法用 "patroller" 这个后端 enum 英文当 hint，跟编辑页其他位置已
            经本地化的 "巡查员" 不一致；en/ja/ko 下读起来更怪。换 ROLE_LABEL
            走和其它 banner 一致的本地化映射。 */}
        ⚠ {t(msg`高风险（${t(ROLE_LABEL.patroller)} 审核）`)}
      </span>
    );
  }
  return null;
}
