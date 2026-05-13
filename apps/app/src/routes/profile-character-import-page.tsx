import { useEffect, useRef, useState } from "react";
import { msg } from "@lingui/macro";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, FileUp } from "lucide-react";
import { importPersonalCharacter } from "@yinjie/contracts";
import { useRuntimeTranslator } from "@yinjie/i18n";
import { AppPage, Button, cn } from "@yinjie/ui";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";
import { navigateBackOrFallback } from "../lib/history-back";
import { describeRequestError } from "../lib/request-error";

type Notice = { tone: "success" | "danger"; message: string } | null;

export function ProfileCharacterImportPage() {
  const t = useRuntimeTranslator();
  const navigate = useNavigate();
  const isDesktopLayout = useDesktopLayout();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  useEffect(() => {
    if (isDesktopLayout) {
      void navigate({ to: "/desktop/settings", replace: true });
    }
  }, [isDesktopLayout, navigate]);

  const goBack = () =>
    navigateBackOrFallback(() => {
      void navigate({ to: "/tabs/profile" });
    });

  function pickFile() {
    setNotice(null);
    fileInputRef.current?.click();
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setFileName(file.name);
    setSubmitting(true);
    setNotice(null);
    try {
      const text = await file.text();
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch (err) {
        throw new Error(t(msg`JSON 解析失败：${(err as Error).message}`));
      }
      const result = await importPersonalCharacter(payload);
      setNotice({
        tone: "success",
        message: result.overwrote
          ? t(msg`已覆盖同名角色：${result.character.name}`)
          : t(msg`已导入新角色：${result.character.name}`),
      });
    } catch (err) {
      setNotice({
        tone: "danger",
        message: describeRequestError(err, t(msg`导入失败，请稍后再试`)),
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppPage className="space-y-0 bg-[color:var(--bg-canvas)] px-0 py-0">
      <TabPageTopBar
        title={t(msg`导入角色`)}
        titleAlign="center"
        leftActions={
          <button
            type="button"
            onClick={goBack}
            aria-label={t(msg`返回`)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[color:var(--text-primary)] transition-colors active:bg-black/[0.05]"
          >
            <ArrowLeft size={17} />
          </button>
        }
      />

      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={handleFile}
      />

      <div className="space-y-4 px-4 pt-4 pb-10">
        <div className="rounded-2xl border border-[color:var(--border-faint)] bg-[color:var(--bg-canvas-elevated)] p-4 text-[13px] leading-relaxed text-[color:var(--text-secondary)]">
          <p>
            {t(
              msg`选择一个从「世界角色管理平台」导出的 JSON 文件，把里面的角色导入到你自己的世界。`,
            )}
          </p>
          <p className="mt-2">
            {t(
              msg`同名角色会被覆盖（保留原 id 和好友关系），不同名则新建并自动加为你的好友。`,
            )}
          </p>
        </div>

        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[color:var(--border-default)] bg-[color:var(--bg-canvas-elevated)] px-4 py-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[rgba(56,189,248,0.12)] text-[#0891b2]">
            <FileUp size={22} />
          </div>
          <div className="text-center text-[14px] text-[color:var(--text-primary)]">
            {fileName ?? t(msg`选择一个 .character.json 文件`)}
          </div>
          <Button
            type="button"
            variant="primary"
            onClick={pickFile}
            disabled={submitting}
          >
            {submitting ? t(msg`导入中…`) : t(msg`选择文件`)}
          </Button>
        </div>

        {notice && (
          <div
            className={cn(
              "rounded-2xl px-4 py-3 text-[13px]",
              notice.tone === "success"
                ? "bg-[rgba(7,193,96,0.10)] text-[#15803d]"
                : "bg-[rgba(220,38,38,0.10)] text-[#b42318]",
            )}
          >
            {notice.message}
          </div>
        )}
      </div>
    </AppPage>
  );
}
