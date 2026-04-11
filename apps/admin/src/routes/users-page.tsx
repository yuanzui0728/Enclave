import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { getSystemStatus } from "@yinjie/contracts";
import { Button, ErrorBlock, InlineNotice, SectionHeading } from "@yinjie/ui";
import { AdminCallout } from "../components/admin-workbench";
import { resolveAdminCoreApiBaseUrl } from "../lib/core-api-base";
import { buildDigitalHumanAdminSummary } from "../lib/digital-human-admin-summary";

export function UsersPage() {
  const baseUrl = resolveAdminCoreApiBaseUrl();
  const systemStatusQuery = useQuery({
    queryKey: ["admin-users-system-status", baseUrl],
    queryFn: () => getSystemStatus(baseUrl),
  });
  const digitalHumanSummary = buildDigitalHumanAdminSummary(
    systemStatusQuery.data?.digitalHumanGateway,
  );

  return (
    <div className="space-y-6">
      <div>
        <SectionHeading>世界主人</SectionHeading>
        <p className="mt-2 text-sm text-[color:var(--text-secondary)]">
          单用户世界迁移已经移除了实例级用户管理能力。
        </p>
      </div>

      <AdminCallout
        tone={digitalHumanSummary.ready ? "success" : "warning"}
        title={
          digitalHumanSummary.ready
            ? "数字人链路已进入可联调状态"
            : `数字人当前阻塞：${digitalHumanSummary.statusLabel}`
        }
        description={`${digitalHumanSummary.description} ${digitalHumanSummary.nextStep}`}
        actions={
          digitalHumanSummary.ready ? null : (
            <Link to="/setup">
              <Button variant="secondary">前往设置页补齐配置</Button>
            </Link>
          )
        }
      />

      <div className="space-y-4 rounded-[28px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-console)] p-6 shadow-[var(--shadow-overlay)]">
        <InlineNotice tone="info">
          当前管理后台聚焦于实例运维、推理服务配置、诊断、备份和角色管理。
        </InlineNotice>
        <ErrorBlock message="在单世界架构下，用户页面已经下线。" />
      </div>
    </div>
  );
}
