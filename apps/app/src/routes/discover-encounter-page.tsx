import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { sendFriendRequest, shake } from "@yinjie/contracts";
import { AppPage, AppSection, Button, ErrorBlock, InlineNotice } from "@yinjie/ui";
import { TabPageTopBar } from "../components/tab-page-top-bar";
import { useAppRuntimeConfig } from "../runtime/runtime-config-store";

export function DiscoverEncounterPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const runtimeConfig = useAppRuntimeConfig();
  const baseUrl = runtimeConfig.apiBaseUrl;
  const [message, setMessage] = useState("");

  const shakeMutation = useMutation({
    mutationFn: async () => {
      const result = await shake(baseUrl);
      if (!result) {
        return null;
      }

      await sendFriendRequest(
        {
          characterId: result.character.id,
          greeting: result.greeting,
        },
        baseUrl,
      );

      return result;
    },
    onSuccess: (result) => {
      if (!result) {
        setMessage("附近暂时没有新的相遇。");
        return;
      }

      setMessage(`${result.character.name} 向你发来了好友申请：${result.greeting}`);
      void queryClient.invalidateQueries({ queryKey: ["app-friend-requests", baseUrl] });
    },
  });

  useEffect(() => {
    setMessage("");
  }, [baseUrl]);

  return (
    <AppPage>
      <TabPageTopBar
        title="摇一摇"
        titleAlign="center"
        leftActions={
          <Button
            onClick={() => navigate({ to: "/tabs/discover" })}
            variant="ghost"
            size="icon"
            className="border border-white/70 bg-white/82 text-[color:var(--text-primary)] shadow-[var(--shadow-soft)] hover:bg-white"
          >
            <ArrowLeft size={18} />
          </Button>
        }
      />

      <AppSection className="space-y-4 bg-[color:var(--brand-soft)]">
        <div>
          <div className="text-sm font-medium text-[color:var(--text-primary)]">随机相遇</div>
          <div className="mt-1 text-xs leading-6 text-[color:var(--text-muted)]">每次摇一摇都会尝试为你安排一次随机相遇，并自动发出好友申请。</div>
        </div>
        <Button onClick={() => shakeMutation.mutate()} disabled={shakeMutation.isPending} variant="primary">
          {shakeMutation.isPending ? "正在寻找..." : "摇一摇"}
        </Button>
        {message ? <InlineNotice tone={message.includes("好友申请") ? "success" : "info"}>{message}</InlineNotice> : null}
        {shakeMutation.isError && shakeMutation.error instanceof Error ? <ErrorBlock message={shakeMutation.error.message} /> : null}
      </AppSection>
    </AppPage>
  );
}
