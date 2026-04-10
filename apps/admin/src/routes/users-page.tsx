import { ErrorBlock, InlineNotice, SectionHeading } from "@yinjie/ui";

export function UsersPage() {
  return (
    <div className="space-y-6">
      <div>
        <SectionHeading>世界主人</SectionHeading>
        <p className="mt-2 text-sm text-[color:var(--text-secondary)]">
          单用户世界迁移已经移除了实例级用户管理能力。
        </p>
      </div>

      <div className="space-y-4 rounded-[28px] border border-[color:var(--border-subtle)] bg-[color:var(--surface-console)] p-6 shadow-[var(--shadow-overlay)]">
        <InlineNotice tone="info">
          当前管理后台聚焦于实例运维、推理服务配置、诊断、备份和角色管理。
        </InlineNotice>
        <ErrorBlock message="在单世界架构下，用户页面已经下线。" />
      </div>
    </div>
  );
}
