import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import type { CloudWorldStatus } from "@yinjie/contracts";
import { cloudAdminApi } from "../lib/cloud-admin-api";

type EditableStatus = Exclude<CloudWorldStatus, "none">;

export function WorldDetailPage() {
  const { worldId } = useParams({ from: "/worlds/$worldId" });
  const queryClient = useQueryClient();
  const worldQuery = useQuery({
    queryKey: ["cloud-console", "world", worldId],
    queryFn: () => cloudAdminApi.getWorld(worldId),
  });
  const [draftStatus, setDraftStatus] = useState<EditableStatus>("pending");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [adminUrl, setAdminUrl] = useState("");
  const [note, setNote] = useState("");

  const updateMutation = useMutation({
    mutationFn: () =>
      cloudAdminApi.updateWorld(worldId, {
        phone,
        name,
        status: draftStatus,
        apiBaseUrl,
        adminUrl,
        note,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["cloud-console", "world", worldId] }),
        queryClient.invalidateQueries({ queryKey: ["cloud-console", "worlds"] }),
      ]);
    },
  });

  const world = worldQuery.data;

  useEffect(() => {
    if (world) {
      setDraftStatus(world.status);
      setPhone(world.phone);
      setName(world.name);
      setApiBaseUrl(world.apiBaseUrl ?? "");
      setAdminUrl(world.adminUrl ?? "");
      setNote(world.note ?? "");
    }
  }, [world]);

  if (!world) {
    return <div className="rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5">加载中...</div>;
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
      <div className="rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5 shadow-[var(--shadow-section)]">
        <div className="text-xl font-semibold text-[color:var(--text-primary)]">{world.name}</div>
        <div className="mt-2 text-sm text-[color:var(--text-secondary)]">手机号：{world.phone}</div>
        <div className="mt-1 text-xs uppercase tracking-[0.22em] text-[color:var(--text-muted)]">{world.status}</div>

        <div className="mt-5 grid gap-4">
          <label className="grid gap-2 text-sm">
            <span>手机号</span>
            <input value={phone} onChange={(event) => setPhone(event.target.value)} className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-3 text-[color:var(--text-primary)]" />
          </label>
          <label className="grid gap-2 text-sm">
            <span>世界名称</span>
            <input value={name} onChange={(event) => setName(event.target.value)} className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-3 text-[color:var(--text-primary)]" />
          </label>
          <label className="grid gap-2 text-sm">
            <span>状态</span>
            <select value={draftStatus} onChange={(event) => setDraftStatus(event.target.value as EditableStatus)} className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-3 text-[color:var(--text-primary)]">
              {["pending", "provisioning", "active", "rejected", "disabled"].map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-2 text-sm">
            <span>云世界地址</span>
            <input value={apiBaseUrl} onChange={(event) => setApiBaseUrl(event.target.value)} placeholder="https://world-api.example.com" className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-3 text-[color:var(--text-primary)]" />
          </label>
          <label className="grid gap-2 text-sm">
            <span>后台地址</span>
            <input value={adminUrl} onChange={(event) => setAdminUrl(event.target.value)} placeholder="https://world-admin.example.com" className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-3 text-[color:var(--text-primary)]" />
          </label>
          <label className="grid gap-2 text-sm">
            <span>备注</span>
            <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={5} className="rounded-xl border border-[color:var(--border-faint)] bg-[color:var(--surface-input)] px-4 py-3 text-[color:var(--text-primary)]" />
          </label>
          <button onClick={() => updateMutation.mutate()} className="rounded-xl bg-[color:var(--surface-secondary)] px-4 py-3 text-[color:var(--text-primary)] hover:bg-[color:var(--surface-tertiary)]">
            {updateMutation.isPending ? "正在保存..." : "保存云世界"}
          </button>
        </div>
      </div>

      <div className="rounded-[28px] border border-[color:var(--border-faint)] bg-[color:var(--surface-console)] p-5 shadow-[var(--shadow-section)]">
        <div className="text-sm font-semibold text-[color:var(--text-primary)]">录入规范</div>
        <div className="mt-3 space-y-3 text-sm leading-7 text-[color:var(--text-secondary)]">
          <p>`active` 世界必须录入 `apiBaseUrl`，否则客户端无法跳转到真正的世界服务。</p>
          <p>`disabled` 用于停用已交付世界；客户端会阻止继续进入。</p>
          <p>手机号是客户端查询云世界的唯一索引，修改时要确保不会和其他世界冲突。</p>
        </div>
      </div>
    </section>
  );
}
