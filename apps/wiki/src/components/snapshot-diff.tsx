import {
  SnapshotDiff as BaseSnapshotDiff,
  type SnapshotDiffProps,
  type SnapshotDiffShape,
} from "@yinjie/ui";
import { useLingui } from "@lingui/react/macro";

export type { SnapshotDiffShape, SnapshotDiffProps };

export function SnapshotDiff(props: SnapshotDiffProps) {
  const { t } = useLingui();
  return (
    <BaseSnapshotDiff
      {...props}
      fieldLabels={{
        name: t`名称`,
        avatar: t`头像`,
        bio: t`简介`,
        personality: t`性格`,
        expertDomains: t`专长领域`,
        triggerScenes: t`触发场景`,
        relationship: t`关系描述`,
        relationshipType: t`关系类型`,
        region: t`地区`,
        ...props.fieldLabels,
      }}
      oldLabel={props.oldLabel ?? t`旧`}
      newLabel={props.newLabel ?? t`新`}
      emptyLabel={props.emptyLabel ?? t`未检测到字段变化。`}
    />
  );
}
