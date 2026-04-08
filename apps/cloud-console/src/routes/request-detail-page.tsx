import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import type { CloudWorldStatus } from "@yinjie/contracts";
import { cloudAdminApi } from "../lib/cloud-admin-api";

type EditableStatus = Exclude<CloudWorldStatus, "none">;

export function RequestDetailPage() {
  const { requestId } = useParams({ from: "/requests/$requestId" });
  const queryClient = useQueryClient();
  const requestQuery = useQuery({
    queryKey: ["cloud-console", "request", requestId],
    queryFn: () => cloudAdminApi.getRequest(requestId),
  });
  const [draftStatus, setDraftStatus] = useState<EditableStatus>("pending");
  const [phone, setPhone] = useState("");
  const [worldName, setWorldName] = useState("");
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [adminUrl, setAdminUrl] = useState("");
  const [note, setNote] = useState("");

  const updateMutation = useMutation({
    mutationFn: () =>
      cloudAdminApi.updateRequest(requestId, {
        phone,
        worldName,
        status: draftStatus,
        apiBaseUrl,
        adminUrl,
        note,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["cloud-console", "request", requestId] }),
        queryClient.invalidateQueries({ queryKey: ["cloud-console", "requests"] }),
        queryClient.invalidateQueries({ queryKey: ["cloud-console", "worlds"] }),
      ]);
    },
  });

  const request = requestQuery.data;

  useEffect(() => {
    if (request) {
      setDraftStatus(request.status);
      setPhone(request.phone);
      setWorldName(request.worldName);
      setNote(request.note ?? "");
    }
  }, [request]);

  if (!request) {
    return <div className="rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5">加载中...</div>;
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
      <div className="rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5 shadow-[var(--shadow-section)]">
        <div className="text-xl font-semibold text-white">{request.worldName}</div>
        <div className="mt-2 text-sm text-[color:var(--text-secondary)]">手机号：{request.phone}</div>
        <div className="mt-1 text-xs uppercase tracking-[0.22em] text-[color:var(--text-muted)]">{request.status}</div>

        <div className="mt-5 grid gap-4">
          <label className="grid gap-2 text-sm">
            <span>手机号</span>
            <input value={phone} onChange={(event) => setPhone(event.target.value)} className="rounded-xl border border-[color:var(--border-faint)] bg-black/10 px-4 py-3 text-white" />
          </label>
          <label className="grid gap-2 text-sm">
            <span>世界名称</span>
            <input value={worldName} onChange={(event) => setWorldName(event.target.value)} className="rounded-xl border border-[color:var(--border-faint)] bg-black/10 px-4 py-3 text-white" />
          </label>
          <label className="grid gap-2 text-sm">
            <span>状态</span>
            <select value={draftStatus} onChange={(event) => setDraftStatus(event.target.value as EditableStatus)} className="rounded-xl border border-[color:var(--border-faint)] bg-black/10 px-4 py-3 text-white">
              {["pending", "provisioning", "active", "rejected", "disabled"].map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm">
            <span>云世界地址</span>
            <input value={apiBaseUrl} onChange={(event) => setApiBaseUrl(event.target.value)} placeholder="https://world-api.example.com" className="rounded-xl border border-[color:var(--border-faint)] bg-black/10 px-4 py-3 text-white" />
          </label>
          <label className="grid gap-2 text-sm">
            <span>世界后台地址</span>
            <input value={adminUrl} onChange={(event) => setAdminUrl(event.target.value)} placeholder="https://world-admin.example.com" className="rounded-xl border border-[color:var(--border-faint)] bg-black/10 px-4 py-3 text-white" />
          </label>
          <label className="grid gap-2 text-sm">
            <span>备注</span>
            <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={5} className="rounded-xl border border-[color:var(--border-faint)] bg-black/10 px-4 py-3 text-white" />
          </label>
          <button onClick={() => updateMutation.mutate()} className="rounded-xl bg-white/10 px-4 py-3 text-white hover:bg-white/20">
            {updateMutation.isPending ? "正在保存..." : "保存申请处理结果"}
          </button>
        </div>
      </div>

      <div className="rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5 shadow-[var(--shadow-section)]">
        <div className="text-sm font-semibold text-white">处理建议</div>
        <div className="mt-3 space-y-3 text-sm leading-7 text-[color:var(--text-secondary)]">
          <p>`pending` 表示刚收到申请，还未开始开通。</p>
          <p>`provisioning` 表示实例部署或资源准备中。</p>
          <p>`active` 需要同时填写 `apiBaseUrl`，客户端才能真正进入世界。</p>
          <p>`rejected` 和 `disabled` 都会阻止客户端进入，区别在于前者面向申请单，后者面向已交付世界。</p>
        </div>
      </div>
    </section>
  );
}
