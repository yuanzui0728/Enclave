import { useCallback, useEffect, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import { useLingui } from "@lingui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Play, X } from "lucide-react";
import {
  createSpeechSynthesis,
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

      <div className="relative flex max-h-[80vh] w-full max-w-[400px] flex-col overflow-hidden rounded-[24px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] shadow-[0_24px_80px_rgba(0,0,0,0.18)]">
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-[16px] font-semibold text-[color:var(--text-primary)]">
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
                          ? "bg-[color:var(--brand-primary-soft,rgba(245,158,11,0.12))]"
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
                          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-[color:var(--border-faint)] px-2.5 text-[12px] text-[color:var(--text-secondary)] transition-colors hover:bg-black/[0.04] disabled:opacity-60"
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
        </div>

        <div className="border-t border-[color:var(--border-faint)] px-4 py-3">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            className="w-full rounded-[12px] py-2"
          >
            {t(msg`完成`)}
          </Button>
        </div>
      </div>
    </div>
  );
}
