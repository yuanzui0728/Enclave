import { useCallback, useEffect, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  FileText,
  Link2,
  Sparkles,
  Trash2,
  Type,
  UploadCloud,
} from "lucide-react";
import {
  deleteKnowledgeDocument,
  importKnowledgeWorldMemory,
  ingestKnowledgeText,
  ingestKnowledgeUrl,
  listKnowledgeDocuments,
  uploadKnowledgeDocument,
  type KnowledgeDocumentSummary,
  type KnowledgeSourceType,
} from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import {
  AppPage,
  AppSection,
  Button,
  ErrorBlock,
  InlineNotice,
  LoadingBlock,
  cn,
} from "@yinjie/ui";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { navigateBackOrFallback } from "../lib/history-back";
import { describeRequestError } from "../lib/request-error";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

const MAX_UPLOAD_BYTES = 16 * 1024 * 1024;

type AddMode = "upload" | "text" | "url";

function formatDateTime(value?: string | null) {
  if (!value) return null;
  const ts = Date.parse(value);
  if (!Number.isFinite(ts)) return value;
  return new Date(ts).toLocaleString();
}

function useSourceTypeLabel() {
  const t = useRuntimeTranslator();
  return (type: KnowledgeSourceType) => {
    switch (type) {
      case "upload":
        return t(msg`文件`);
      case "url":
        return t(msg`网址`);
      case "world_content":
        return t(msg`世界记忆`);
      case "wiki_recipe":
        return t(msg`角色资料`);
      case "text":
      default:
        return t(msg`文本`);
    }
  };
}

export function KnowledgeBasePage() {
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const isDesktopLayout = useDesktopLayout();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const describeSourceType = useSourceTypeLabel();

  const [mode, setMode] = useState<AddMode>("upload");
  const [textTitle, setTextTitle] = useState("");
  const [textBody, setTextBody] = useState("");
  const [urlValue, setUrlValue] = useState("");
  const [urlTitle, setUrlTitle] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeTone, setNoticeTone] = useState<"success" | "danger">("success");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 提示 3.5s 自动消失。
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const showSuccess = useCallback((message: string) => {
    setNoticeTone("success");
    setNotice(message);
  }, []);
  const showError = useCallback((message: string) => {
    setNoticeTone("danger");
    setNotice(message);
  }, []);

  const queryKey = ["knowledge-documents", baseUrl, "owner"] as const;
  const docsQuery = useQuery({
    queryKey,
    queryFn: () => listKnowledgeDocuments({ scope: "owner" }, baseUrl),
    staleTime: 15_000,
  });

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: ["knowledge-documents", baseUrl],
    });
  }, [queryClient, baseUrl]);

  // 录入均非幂等（每次 POST 落一篇新文档），同帧两次提交会写两份。各用 sync ref 防双触发。
  const uploadInFlightRef = useRef(false);
  const uploadMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return uploadKnowledgeDocument(formData, baseUrl);
    },
    onSuccess: (doc) => {
      showSuccess(t(msg`已添加《${doc.title}》`));
      invalidate();
    },
    onError: (error) => {
      showError(describeRequestError(error, t(msg`上传失败，请稍后重试。`)));
    },
    onSettled: () => {
      uploadInFlightRef.current = false;
    },
  });

  const textInFlightRef = useRef(false);
  const textMutation = useMutation({
    mutationFn: (payload: { title?: string; text: string }) =>
      ingestKnowledgeText(payload, baseUrl),
    onSuccess: (doc) => {
      setTextTitle("");
      setTextBody("");
      showSuccess(t(msg`已添加《${doc.title}》`));
      invalidate();
    },
    onError: (error) => {
      showError(describeRequestError(error, t(msg`保存失败，请稍后重试。`)));
    },
    onSettled: () => {
      textInFlightRef.current = false;
    },
  });

  const urlInFlightRef = useRef(false);
  const urlMutation = useMutation({
    mutationFn: (payload: { url: string; title?: string }) =>
      ingestKnowledgeUrl(payload, baseUrl),
    onSuccess: (doc) => {
      setUrlValue("");
      setUrlTitle("");
      showSuccess(t(msg`已添加《${doc.title}》`));
      invalidate();
    },
    onError: (error) => {
      showError(describeRequestError(error, t(msg`添加网址失败，请稍后重试。`)));
    },
    onSettled: () => {
      urlInFlightRef.current = false;
    },
  });

  const importInFlightRef = useRef(false);
  const importMutation = useMutation({
    mutationFn: () => importKnowledgeWorldMemory(baseUrl),
    onSuccess: (result) => {
      showSuccess(
        t(msg`已导入 ${result.ingested} 条，跳过 ${result.skipped} 条。`),
      );
      invalidate();
    },
    onError: (error) => {
      showError(describeRequestError(error, t(msg`导入世界记忆失败，请稍后重试。`)));
    },
    onSettled: () => {
      importInFlightRef.current = false;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteKnowledgeDocument(id, baseUrl),
    onSuccess: () => {
      showSuccess(t(msg`已删除`));
      invalidate();
    },
    onError: (error) => {
      showError(describeRequestError(error, t(msg`删除失败，请稍后重试。`)));
    },
  });

  const handlePickFile = () => {
    if (uploadInFlightRef.current) return;
    fileInputRef.current?.click();
  };

  const handleFileSelected = (files: FileList | null) => {
    const file = files?.[0];
    // 复位 input 以便连续选同名文件能再次触发 change。
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      showError(t(msg`文件超过 16MB 上限，请换一份更小的文件。`));
      return;
    }
    if (uploadInFlightRef.current) return;
    uploadInFlightRef.current = true;
    uploadMutation.mutate(file);
  };

  const handleSubmitText = () => {
    const text = textBody.trim();
    if (!text || textInFlightRef.current) return;
    textInFlightRef.current = true;
    textMutation.mutate({
      title: textTitle.trim() || undefined,
      text,
    });
  };

  const handleSubmitUrl = () => {
    const url = urlValue.trim();
    if (!url || urlInFlightRef.current) return;
    urlInFlightRef.current = true;
    urlMutation.mutate({
      url,
      title: urlTitle.trim() || undefined,
    });
  };

  const handleImportWorldMemory = () => {
    if (importInFlightRef.current) return;
    importInFlightRef.current = true;
    importMutation.mutate();
  };

  // 知识库可从「世界」tab 探索入口和「我」tab 两处进入，不能硬编码
  // expectedPreviousPath=/tabs/profile：从世界进来时真实 prev=/tabs/world，
  // 比对失败会 fallback push /tabs/profile，把用户甩到「我」tab。去掉 hint →
  // history.back() 回到真正来处（世界或我），仅冷启动/深链兜底回 /tabs/profile。
  const goBack = () =>
    navigateBackOrFallback(() => {
      void navigate({ to: "/tabs/profile", replace: true });
    });

  const mobileTopBar = !isDesktopLayout ? (
    <TabPageTopBar
      title={t(msg`知识库`)}
      titleAlign="center"
      leftActions={
        <Button
          onClick={goBack}
          variant="ghost"
          size="icon"
          className="h-9 w-9 rounded-full bg-transparent text-[color:var(--text-primary)] shadow-none active:bg-black/[0.05]"
          aria-label={t(msg`返回`)}
        >
          <ArrowLeft size={17} />
        </Button>
      }
    />
  ) : null;

  const modeChips: Array<{ key: AddMode; label: string; icon: typeof Type }> = [
    { key: "upload", label: t(msg`上传文件`), icon: UploadCloud },
    { key: "text", label: t(msg`粘贴文本`), icon: Type },
    { key: "url", label: t(msg`添加网址`), icon: Link2 },
  ];

  const documents = docsQuery.data ?? [];

  return (
    <AppPage
      className="bg-[color:var(--bg-canvas)] px-4 pt-6"
      style={{
        paddingBottom:
          "max(1.5rem, calc(env(safe-area-inset-bottom, 0px) + 1.5rem))",
      }}
    >
      {mobileTopBar}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={(event) => handleFileSelected(event.target.files)}
      />

      <div className="mx-auto flex max-w-2xl flex-col gap-3">
        {notice ? (
          <InlineNotice tone={noticeTone} role="status">
            {notice}
          </InlineNotice>
        ) : null}

        {/* 添加个人知识卡 */}
        <AppSection className="rounded-[18px] border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-4 shadow-none">
          <div className="text-[length:var(--text-base)] font-semibold text-[color:var(--text-primary)]">
            {t(msg`添加个人知识`)}
          </div>
          <div className="mt-1 text-[length:var(--text-caption)] leading-relaxed text-[color:var(--text-muted)]">
            {t(msg`上传文件、粘贴文本或添加网址，作为你的专属上下文，帮助世界里的角色更懂你。`)}
          </div>

          <div className="mt-3 flex gap-2">
            {modeChips.map((chip) => {
              const Icon = chip.icon;
              const active = mode === chip.key;
              return (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => setMode(chip.key)}
                  className={cn(
                    "flex flex-1 items-center justify-center gap-1.5 rounded-full px-2 py-2 text-[length:var(--text-caption)] transition-colors",
                    active
                      ? "bg-[color:var(--brand-primary)] text-[color:var(--text-on-brand)]"
                      : "bg-[color:var(--brand-soft)] text-[color:var(--text-muted)]",
                  )}
                >
                  <Icon size={14} />
                  <span className="truncate">{chip.label}</span>
                </button>
              );
            })}
          </div>

          {mode === "upload" ? (
            <div className="mt-3">
              <button
                type="button"
                onClick={handlePickFile}
                disabled={uploadMutation.isPending}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed border-[color:var(--border-strong)] bg-[color:var(--bg-canvas)] px-4 py-7 text-center transition-colors active:bg-[color:var(--surface-card-hover)] disabled:opacity-60"
              >
                <UploadCloud size={22} className="text-[color:var(--brand-primary)]" />
                <span className="text-[length:var(--text-body)] text-[color:var(--text-primary)]">
                  {uploadMutation.isPending
                    ? t(msg`正在上传…`)
                    : t(msg`点击选择文件`)}
                </span>
              </button>
              <div className="mt-2 text-[length:var(--text-eyebrow)] text-[color:var(--text-muted)]">
                {t(msg`支持 txt / md / pdf / docx / doc，单个文件最大 16MB。`)}
              </div>
            </div>
          ) : null}

          {mode === "text" ? (
            <div className="mt-3 space-y-2">
              <input
                type="text"
                value={textTitle}
                onChange={(event) => setTextTitle(event.target.value)}
                placeholder={t(msg`标题（可选）`)}
                className="w-full rounded-[var(--radius-sm)] border border-[color:var(--border-faint)] bg-[color:var(--bg-canvas)] px-3 py-2.5 text-[length:var(--text-body)] text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)]"
              />
              <textarea
                value={textBody}
                onChange={(event) => setTextBody(event.target.value)}
                placeholder={t(msg`粘贴或输入你想让角色记住的内容…`)}
                rows={5}
                className="w-full resize-none rounded-[var(--radius-sm)] border border-[color:var(--border-faint)] bg-[color:var(--bg-canvas)] px-3 py-2.5 text-[length:var(--text-body)] leading-relaxed text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)]"
              />
              <Button
                onClick={handleSubmitText}
                disabled={!textBody.trim() || textMutation.isPending}
                className="w-full"
              >
                {textMutation.isPending ? t(msg`保存中…`) : t(msg`保存文本`)}
              </Button>
            </div>
          ) : null}

          {mode === "url" ? (
            <div className="mt-3 space-y-2">
              <input
                type="url"
                value={urlValue}
                onChange={(event) => setUrlValue(event.target.value)}
                placeholder={t(msg`https://…`)}
                className="w-full rounded-[var(--radius-sm)] border border-[color:var(--border-faint)] bg-[color:var(--bg-canvas)] px-3 py-2.5 text-[length:var(--text-body)] text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)]"
              />
              <input
                type="text"
                value={urlTitle}
                onChange={(event) => setUrlTitle(event.target.value)}
                placeholder={t(msg`标题（可选）`)}
                className="w-full rounded-[var(--radius-sm)] border border-[color:var(--border-faint)] bg-[color:var(--bg-canvas)] px-3 py-2.5 text-[length:var(--text-body)] text-[color:var(--text-primary)] outline-none placeholder:text-[color:var(--text-dim)]"
              />
              <Button
                onClick={handleSubmitUrl}
                disabled={!urlValue.trim() || urlMutation.isPending}
                className="w-full"
              >
                {urlMutation.isPending ? t(msg`添加中…`) : t(msg`添加网址`)}
              </Button>
            </div>
          ) : null}
        </AppSection>

        {/* 导入世界记忆 */}
        <button
          type="button"
          onClick={handleImportWorldMemory}
          disabled={importMutation.isPending}
          className="flex items-center gap-2.5 rounded-[14px] border border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-3 text-left transition-colors active:bg-[color:var(--surface-card-hover)] disabled:opacity-60"
        >
          <div className="flex h-7.5 w-7.5 shrink-0 items-center justify-center rounded-[8px] bg-[color:var(--brand-soft)] text-[color:var(--brand-primary)]">
            <Sparkles size={15} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[length:var(--text-body)] text-[color:var(--text-primary)]">
              {importMutation.isPending
                ? t(msg`正在导入世界记忆…`)
                : t(msg`导入世界记忆`)}
            </div>
            <div className="mt-0.5 text-[length:var(--text-eyebrow)] text-[color:var(--text-muted)]">
              {t(msg`把世界里已发生的重要经历整理进你的知识库。`)}
            </div>
          </div>
        </button>

        {/* 我的知识库列表 */}
        <AppSection className="rounded-[18px] border-[color:var(--border-faint)] bg-[color:var(--surface-card)] px-4 py-4 shadow-none">
          <div className="text-[length:var(--text-base)] font-semibold text-[color:var(--text-primary)]">
            {t(msg`我的知识库`)}
          </div>
          <div className="mt-3">
            {docsQuery.isLoading ? (
              <LoadingBlock label={t(msg`正在加载知识库…`)} />
            ) : docsQuery.error ? (
              <ErrorBlock
                role="alert"
                message={describeRequestError(docsQuery.error)}
              />
            ) : documents.length === 0 ? (
              <InlineNotice tone="info">
                {t(msg`还没有任何内容，先上传一个文件或粘贴一段文字吧。`)}
              </InlineNotice>
            ) : (
              <div className="space-y-2.5">
                {documents.map((doc) => (
                  <KnowledgeRow
                    key={doc.id}
                    doc={doc}
                    sourceLabel={describeSourceType(doc.sourceType)}
                    embeddedLabel={
                      doc.embedded ? t(msg`已向量化`) : t(msg`词法检索`)
                    }
                    metaText={[
                      t(msg`${doc.charCount} 字`),
                      formatDateTime(doc.createdAt),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    deleteLabel={t(msg`删除`)}
                    deleting={
                      deleteMutation.isPending &&
                      deleteMutation.variables === doc.id
                    }
                    onDelete={() => deleteMutation.mutate(doc.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </AppSection>
      </div>
    </AppPage>
  );
}

function KnowledgeRow({
  doc,
  sourceLabel,
  embeddedLabel,
  metaText,
  deleteLabel,
  deleting,
  onDelete,
}: {
  doc: KnowledgeDocumentSummary;
  sourceLabel: string;
  embeddedLabel: string;
  metaText: string;
  deleteLabel: string;
  deleting: boolean;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-sm)] border border-[color:var(--border-faint)] bg-[color:var(--bg-canvas)] px-3 py-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-[color:var(--brand-soft)] text-[color:var(--brand-primary)]">
        <FileText size={15} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[length:var(--text-body)] text-[color:var(--text-primary)]">
            {doc.title}
          </span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[length:var(--text-eyebrow)] text-[color:var(--text-muted)]">
          <span className="rounded-full bg-[color:var(--brand-soft)] px-1.5 py-0.5 text-[color:var(--brand-primary)]">
            {sourceLabel}
          </span>
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5",
              doc.embedded
                ? "bg-[color:var(--state-success-bg)] text-[color:var(--state-success-text)]"
                : "bg-[color:var(--surface-card-hover)] text-[color:var(--text-muted)]",
            )}
          >
            {embeddedLabel}
          </span>
          <span className="truncate">{metaText}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting}
        aria-label={deleteLabel}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[color:var(--text-dim)] transition-colors active:bg-black/[0.05] disabled:opacity-50"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}
