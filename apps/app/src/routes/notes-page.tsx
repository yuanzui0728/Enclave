import { useNavigate, useRouterState } from "@tanstack/react-router";
import { AppPage, Button } from "@yinjie/ui";
import { DesktopNotesWorkspace } from "../features/desktop/chat/desktop-notes-workspace";
import { useDesktopLayout } from "../features/shell/use-desktop-layout";

export function NotesPage() {
  const navigate = useNavigate();
  const isDesktopLayout = useDesktopLayout();
  const hash = useRouterState({ select: (state) => state.location.hash });
  const selectedNoteId = parseNoteId(hash);

  if (!isDesktopLayout) {
    return (
      <AppPage className="flex h-full items-center justify-center bg-[color:var(--bg-app)] px-5">
        <div className="w-full max-w-md rounded-[22px] border border-[color:var(--border-faint)] bg-white p-8 shadow-[var(--shadow-card)]">
          <div className="text-xl font-semibold text-[color:var(--text-primary)]">
            笔记当前仅提供桌面布局
          </div>
          <div className="mt-3 text-sm leading-7 text-[color:var(--text-secondary)]">
            微信式笔记编辑器目前只在 Web 端桌面布局和桌面壳内启用，移动端先回到消息页继续使用。
          </div>
          <Button
            variant="primary"
            size="lg"
            onClick={() => navigate({ to: "/tabs/chat" })}
            className="mt-6 w-full rounded-xl bg-[#07c160] text-white hover:bg-[#06ad56]"
          >
            返回消息
          </Button>
        </div>
      </AppPage>
    );
  }

  return (
    <DesktopNotesWorkspace
      selectedNoteId={selectedNoteId}
      onSelectNote={(noteId) => {
        void navigate({
          to: "/notes",
          hash: noteId || undefined,
          replace: true,
        });
      }}
    />
  );
}

function parseNoteId(hash: string) {
  const normalized = hash.startsWith("#") ? hash.slice(1) : hash;
  return normalized || undefined;
}
