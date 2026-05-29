import { useCallback, useEffect, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import { useLingui } from "@lingui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Play, Trash2, Upload, X } from "lucide-react";
import {
  createSpeechSynthesis,
  createVoiceClone,
  deleteVoiceClone,
  listVoiceClones,
  listVoices,
  setCharacterVoicePreset,
  type VoiceCatalog,
} from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { Button, InlineNotice, cn } from "@yinjie/ui";

import { resolveAppMediaUrl } from "../../lib/media-url";
import { registerAndroidBackInterceptor } from "../../runtime/android-back-button";

const VOICE_PREVIEW_TEXT = "你好呀，很高兴认识你，这是我现在的声音。";

export function useVoiceCatalog(baseUrl?: string) {
  return useQuery({
    queryKey: ["app-voices", baseUrl],
    queryFn: () => listVoices(baseUrl),
    staleTime: 5 * 60 * 1000,
  });
}

function pickLabel(
  option: { labelZh: string; labelEn: string },
  locale: string,
) {
  return locale.startsWith("zh") ? option.labelZh : option.labelEn;
}

/** 把角色当前的 voicePreset (一个 voice_id 或 null) 翻成给用户看的人话名字。 */
export function resolveVoiceLabel(
  catalog: VoiceCatalog | undefined,
  voicePreset: string | null | undefined,
  locale: string,
  defaultLabel: string,
): string {
  if (!voicePreset) return defaultLabel;
  const preset = catalog?.presets.find((p) => p.id === voicePreset);
  if (preset) return pickLabel(preset, locale);
  const clone = catalog?.clones.find((c) => c.id === voicePreset);
  if (clone) return clone.displayName;
  // 未知 id（例如管理员后台手填的非预设音色）—— 原样显示，别丢信息。
  return voicePreset;
}

type VoicePickerModalProps = {
  characterId: string;
  currentVoicePreset: string | null;
  baseUrl?: string;
  onClose: () => void;
};

export function VoicePickerModal({
  characterId,
  currentVoicePreset,
  baseUrl,
  onClose,
}: VoicePickerModalProps) {
  const t = useRuntimeTranslator();
  const { i18n } = useLingui();
  const locale = i18n.locale;
  const queryClient = useQueryClient();
  const catalogQuery = useVoiceCatalog(baseUrl);
  const [notice, setNotice] = useState<{
    tone: "success" | "danger";
    message: string;
  } | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const previewSeqRef = useRef(0);

  // —— 「克隆我的声音」 ——
  const clonesQuery = useQuery({
    queryKey: ["app-voice-clones", baseUrl],
    queryFn: () => listVoiceClones(baseUrl),
    staleTime: 60 * 1000,
  });
  const [cloneName, setCloneName] = useState("");
  const cloneFileRef = useRef<HTMLInputElement | null>(null);
  const [cloneFileName, setCloneFileName] = useState<string | null>(null);

  const createCloneMutation = useMutation({
    mutationFn: (form: FormData) => createVoiceClone(form, baseUrl),
    onSuccess: async (item) => {
      setCloneName("");
      setCloneFileName(null);
      if (cloneFileRef.current) cloneFileRef.current.value = "";
      setNotice(
        item.status === "ready"
          ? { tone: "success", message: t(msg`声音克隆完成，可以选用啦。`) }
          : {
              tone: "danger",
              message: t(msg`克隆未成功，请换段更清晰的样本再试。`),
            },
      );
      await queryClient.invalidateQueries({
        queryKey: ["app-voice-clones", baseUrl],
      });
      await queryClient.invalidateQueries({ queryKey: ["app-voices", baseUrl] });
    },
    onError: (error: unknown) => {
      setNotice({
        tone: "danger",
        message:
          error instanceof Error && error.message
            ? error.message
            : t(msg`声音克隆失败，请稍后再试。`),
      });
    },
  });

  const deleteCloneMutation = useMutation({
    mutationFn: (id: string) => deleteVoiceClone(id, baseUrl),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["app-voice-clones", baseUrl],
      });
      await queryClient.invalidateQueries({ queryKey: ["app-voices", baseUrl] });
    },
  });

  const handleCloneSubmit = useCallback(() => {
    const file = cloneFileRef.current?.files?.[0];
    if (!file) {
      setNotice({ tone: "danger", message: t(msg`请先选择一段声音样本。`) });
      return;
    }
    const name = cloneName.trim();
    if (!name) {
      setNotice({ tone: "danger", message: t(msg`请给音色起个名字。`) });
      return;
    }
    setNotice(null);
    const form = new FormData();
    form.append("displayName", name);
    form.append("file", file, file.name);
    createCloneMutation.mutate(form);
  }, [cloneName, createCloneMutation, t]);

  const stopPreview = useCallback(() => {
    previewSeqRef.current += 1;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPreviewingId(null);
  }, []);

  useEffect(() => () => stopPreview(), [stopPreview]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const unregister = registerAndroidBackInterceptor((event) => {
      event.preventDefault();
      onClose();
      return true;
    });
    return unregister;
  }, [onClose]);

  const setVoiceMutation = useMutation({
    mutationFn: (voicePreset: string | null) =>
      setCharacterVoicePreset(characterId, voicePreset, baseUrl),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["app-character", baseUrl, characterId],
      });
      onClose();
    },
    onError: () => {
      setNotice({
        tone: "danger",
        message: t(msg`音色设置失败，请稍后再试。`),
      });
    },
  });

  const handlePreview = useCallback(
    async (voiceId: string) => {
      stopPreview();
      const seq = ++previewSeqRef.current;
      setPreviewingId(voiceId);
      try {
        const result = await createSpeechSynthesis(
          { text: VOICE_PREVIEW_TEXT, voice: voiceId, characterId },
          baseUrl,
        );
        if (previewSeqRef.current !== seq) {
          return;
        }
        const audio = new Audio(resolveAppMediaUrl(result.audioUrl));
        audioRef.current = audio;
        audio.onended = () => {
          if (audioRef.current === audio) {
            audioRef.current = null;
            setPreviewingId((current) => (current === voiceId ? null : current));
          }
        };
        audio.onerror = () => {
          if (audioRef.current === audio) {
            audioRef.current = null;
            setPreviewingId((current) => (current === voiceId ? null : current));
            setNotice({
              tone: "danger",
              message: t(msg`试听播放失败，请稍后再试。`),
            });
          }
        };
        await audio.play();
      } catch {
        if (previewSeqRef.current !== seq) {
          return;
        }
        audioRef.current = null;
        setPreviewingId(null);
        setNotice({
          tone: "danger",
          message: t(msg`试听生成失败，请稍后再试。`),
        });
      }
    },
    [baseUrl, characterId, stopPreview, t],
  );

  const handleSelect = useCallback(
    (voicePreset: string | null) => {
      setNotice(null);
      stopPreview();
      setVoiceMutation.mutate(voicePreset);
    },
    [setVoiceMutation, stopPreview],
  );

  const catalog = catalogQuery.data;
  const defaultLabel = t(msg`默认（跟随系统）`);

  const rows: Array<{ id: string | null; label: string }> = [
    { id: null, label: defaultLabel },
    ...(catalog?.presets ?? []).map((p) => ({
      id: p.id,
      label: pickLabel(p, locale),
    })),
    ...(catalog?.clones ?? []).map((c) => ({
      id: c.id,
      label: c.displayName,
    })),
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-[rgba(17,24,39,0.45)] p-4 backdrop-blur-[3px] sm:items-center">
      <button
        type="button"
        aria-label={t(msg`关闭弹窗`)}
        onClick={onClose}
        className="absolute inset-0"
      />

      <div className="relative flex max-h-[80vh] w-full max-w-[400px] flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] shadow-[0_24px_80px_rgba(0,0,0,0.18)]">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-[length:var(--text-title)] font-semibold text-[color:var(--text-primary)]">
            {t(msg`选择音色`)}
          </h2>
          <button
            type="button"
            aria-label={t(msg`关闭`)}
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--text-muted)] transition-colors hover:bg-black/[0.04]"
          >
            <X size={16} />
          </button>
        </div>

        {notice ? (
          <div className="px-5 pb-2">
            <InlineNotice tone={notice.tone}>{notice.message}</InlineNotice>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          {catalogQuery.isLoading ? (
            <div className="flex items-center justify-center py-10 text-[color:var(--text-muted)]">
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : (
            <ul className="flex flex-col gap-1">
              {rows.map((row) => {
                const selected = (currentVoicePreset ?? null) === row.id;
                const previewing = previewingId === row.id;
                return (
                  <li key={row.id ?? "__default__"}>
                    <div
                      className={cn(
                        "flex items-center gap-2 rounded-[14px] px-3 py-2.5",
                        selected
                          ? "bg-[color:var(--brand-primary-soft,color-mix(in_srgb,var(--brand-primary)_12%,transparent))]"
                          : "hover:bg-[color:var(--surface-card-hover)]",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => handleSelect(row.id)}
                        disabled={setVoiceMutation.isPending}
                        className="flex min-w-0 flex-1 items-center gap-2 text-left disabled:opacity-60"
                      >
                        <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center">
                          {selected ? (
                            <Check
                              size={16}
                              className="text-[color:var(--brand-primary,#f59e0b)]"
                            />
                          ) : null}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm text-[color:var(--text-primary)]">
                          {row.label}
                        </span>
                      </button>
                      {row.id ? (
                        <button
                          type="button"
                          aria-label={t(msg`试听`)}
                          onClick={() => void handlePreview(row.id as string)}
                          disabled={previewing}
                          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-[color:var(--border-faint)] px-2.5 text-[length:var(--text-caption)] text-[color:var(--text-secondary)] transition-colors hover:bg-black/[0.04] disabled:opacity-60"
                        >
                          {previewing ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <Play size={13} />
                          )}
                          {t(msg`试听`)}
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-4 border-t border-[color:var(--border-faint)] pt-3">
            <div className="px-1 text-[length:var(--text-caption)] font-medium text-[color:var(--text-primary)]">
              {t(msg`克隆我的声音`)}
            </div>
            <p className="mt-1 px-1 text-[length:var(--text-caption)] leading-5 text-[color:var(--text-muted)]">
              {t(
                msg`上传一段清晰的人声样本（10 秒以上，mp3 / m4a / wav）。请仅上传你本人或已授权的声音。`,
              )}
            </p>

            {(clonesQuery.data ?? []).length > 0 ? (
              <ul className="mt-2 flex flex-col gap-1">
                {(clonesQuery.data ?? []).map((clone) => (
                  <li
                    key={clone.id}
                    className="flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-sm"
                  >
                    <span className="min-w-0 flex-1 truncate text-[color:var(--text-primary)]">
                      {clone.displayName}
                    </span>
                    <span className="shrink-0 text-[length:var(--text-eyebrow)] text-[color:var(--text-muted)]">
                      {clone.status === "ready"
                        ? t(msg`可用`)
                        : clone.status === "pending"
                          ? t(msg`处理中`)
                          : t(msg`失败`)}
                    </span>
                    <button
                      type="button"
                      aria-label={t(msg`删除`)}
                      onClick={() => deleteCloneMutation.mutate(clone.id)}
                      disabled={deleteCloneMutation.isPending}
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[color:var(--text-muted)] transition-colors hover:bg-black/[0.04] disabled:opacity-60"
                    >
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="mt-2 flex flex-col gap-2 px-1">
              <input
                value={cloneName}
                onChange={(e) => setCloneName(e.target.value)}
                maxLength={40}
                placeholder={t(msg`音色名字，如「我的声音」`)}
                className="w-full rounded-[10px] border border-[color:var(--border-faint)] bg-transparent px-3 py-2 text-sm text-[color:var(--text-primary)] outline-none focus:border-[color:var(--brand-primary,#f59e0b)]"
              />
              <input
                ref={cloneFileRef}
                type="file"
                accept="audio/*,.mp3,.m4a,.wav"
                className="hidden"
                onChange={(e) =>
                  setCloneFileName(e.target.files?.[0]?.name ?? null)
                }
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => cloneFileRef.current?.click()}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] border border-[color:var(--border-faint)] px-3 text-[length:var(--text-caption)] text-[color:var(--text-secondary)] transition-colors hover:bg-black/[0.04]"
                >
                  <Upload size={14} />
                  {t(msg`选择样本`)}
                </button>
                <span className="min-w-0 flex-1 truncate text-[length:var(--text-caption)] text-[color:var(--text-muted)]">
                  {cloneFileName ?? t(msg`未选择文件`)}
                </span>
                <Button
                  type="button"
                  variant="primary"
                  onClick={handleCloneSubmit}
                  disabled={createCloneMutation.isPending}
                  className="shrink-0 rounded-[10px] px-3 py-2 text-[length:var(--text-caption)]"
                >
                  {createCloneMutation.isPending ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    t(msg`开始克隆`)
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-[color:var(--border-faint)] px-4 py-3">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            className="w-full rounded-[var(--radius-sm)] py-2"
          >
            {t(msg`完成`)}
          </Button>
        </div>
      </div>
    </div>
  );
}
