import { useState } from "react";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/macro";
import { Trans } from "@lingui/react/macro";
import { useMutation } from "@tanstack/react-query";
import type { CharacterBlueprintRecipe } from "@yinjie/contracts";
import { translateRuntimeMessage } from "@yinjie/i18n";
import { Button } from "@yinjie/ui";
import { wikiApi } from "../lib/wiki-api";

const SCENES: Array<{ key: string; label: MessageDescriptor }> = [
  { key: "chat", label: msg`聊天` },
  { key: "greeting", label: msg`问候` },
  { key: "proactive", label: msg`主动触达` },
  { key: "moments_post", label: msg`朋友圈` },
  { key: "moments_comment", label: msg`朋友圈评论` },
  { key: "feed_post", label: msg`广场发帖` },
  { key: "feed_comment", label: msg`广场评论` },
  { key: "channel_post", label: msg`视频号` },
];

/**
 * "改前 vs 改后" prompt 预览：调用 /wiki/pages/:id/preview-prompt 用当前
 * 表单中的 recipe 渲染 system_prompt，让编辑者直观看到改动效果。
 *
 * 不写库；只读预览。
 */
export function ScenePromptPreview({
  characterId,
  recipe,
  baselineRecipe,
}: {
  characterId: string;
  recipe: CharacterBlueprintRecipe;
  baselineRecipe?: CharacterBlueprintRecipe | null;
}) {
  const t = translateRuntimeMessage;
  const [scene, setScene] = useState<string>("chat");
  const previewMut = useMutation({
    mutationFn: (input: { recipe: CharacterBlueprintRecipe; scene: string }) =>
      wikiApi.previewPrompt(characterId, input.recipe, input.scene),
  });
  const baselineMut = useMutation({
    mutationFn: (input: { recipe: CharacterBlueprintRecipe; scene: string }) =>
      wikiApi.previewPrompt(characterId, input.recipe, input.scene),
  });

  const runBoth = async () => {
    const tasks: Promise<unknown>[] = [
      previewMut.mutateAsync({ recipe, scene }),
    ];
    if (baselineRecipe) {
      tasks.push(baselineMut.mutateAsync({ recipe: baselineRecipe, scene }));
    }
    await Promise.allSettled(tasks);
  };

  return (
    <div className="rounded border border-[var(--border-subtle)] p-3 space-y-2">
      <div className="flex items-center gap-2">
        <strong className="text-sm">
          <Trans>Prompt 预览</Trans>
        </strong>
        {/* 这个 select 紧挨 "Prompt 预览" 标签但没有 label 关联也没有
            aria-label：盲用用户 tab 进来只听到 "combobox, chat" 不知道
            选的是什么维度。补 aria-label 让 SR 念出"场景选择"。 */}
        <select
          aria-label={t(msg`Prompt 预览场景`)}
          className="border rounded px-2 py-1 text-xs bg-white"
          value={scene}
          onChange={(e) => setScene(e.target.value)}
        >
          {SCENES.map((s) => (
            <option key={s.key} value={s.key}>
              {t(s.label)}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="ghost"
          onClick={runBoth}
          disabled={previewMut.isPending || baselineMut.isPending}
        >
          {previewMut.isPending ? t(msg`渲染中...`) : t(msg`渲染`)}
        </Button>
      </div>
      <p className="text-xs text-[var(--text-muted)]">
        <Trans>
          实时把当前编辑器中的 recipe 渲染成 AI 看到的 system prompt，避免误改。
        </Trans>
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {baselineRecipe && (
          <div>
            <div className="text-xs text-[var(--text-muted)] mb-1">
              <Trans>改前（baseline）</Trans>
            </div>
            <pre className="bg-[rgba(0,0,0,0.04)] p-2 rounded text-xs whitespace-pre-wrap break-words max-h-72 overflow-auto">
              {baselineMut.data?.prompt ?? t(msg`（点击渲染）`)}
            </pre>
          </div>
        )}
        <div>
          <div className="text-xs text-[var(--text-muted)] mb-1">
            <Trans>改后（当前编辑）</Trans>
          </div>
          <pre className="bg-[rgba(0,0,0,0.04)] p-2 rounded text-xs whitespace-pre-wrap break-words max-h-72 overflow-auto">
            {previewMut.data?.prompt ?? t(msg`（点击渲染）`)}
          </pre>
        </div>
      </div>
      {(previewMut.isError || baselineMut.isError) && (
        <ul className="text-xs text-[var(--state-danger-text)] space-y-0.5">
          {previewMut.isError && (
            <li>
              <Trans>改后</Trans>
              {": "}
              {(previewMut.error as Error).message}
            </li>
          )}
          {baselineMut.isError && (
            <li>
              <Trans>改前</Trans>
              {": "}
              {(baselineMut.error as Error).message}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
