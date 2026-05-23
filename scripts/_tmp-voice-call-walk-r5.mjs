// R5 真实操作走查：更多边角 case
// - turn 端点边角：缺 conversationId / characterId mismatch / 非 direct conversation
// - 群 turn 缺 groupId
// - 跨会话 startedAt 一致是否误命中幂等（不同 conversationId 必须独立）
// - 大量 call_log 写库后历史拉取性能（不算 bug 但走查 perf）

import { readFile } from "node:fs/promises";
import { Blob } from "node:buffer";

const CLOUD_API = process.env.CLOUD_API_BASE || "http://127.0.0.1:3001";
const EMAIL = "yuanzui0728@gmail.com";
const PASSWORD = "Test1234!";
const VOICE = "/home/ps/claude/yinjie-app/data/accounts/17757541197/chat-attachments/1776996541187-357e0b34-voice-call-smoke.wav";

const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 23)}]`, ...a);
const fail = (m) => { log("FAIL", m); process.exit(1); };

async function login() {
  const r = await fetch(`${CLOUD_API}/cloud/auth/login-with-password`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: EMAIL, identifierKind: "email", password: PASSWORD }),
  });
  if (!r.ok) fail(`login ${r.status}`);
  return (await r.json()).accessToken;
}

async function api(token, method, path, body, isForm) {
  const init = { method, headers: { Authorization: `Bearer ${token}` } };
  if (body && !isForm) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  } else if (isForm) {
    init.body = body;
  }
  const r = await fetch(`${CLOUD_API}/cloud/world-api${path}`, init);
  const t = await r.text();
  let parsed = null;
  try { parsed = JSON.parse(t); } catch {}
  return { ok: r.ok, status: r.status, body: parsed ?? t };
}

async function main() {
  const token = await login();
  const conv = (await api(token, "GET", "/api/conversations")).body;
  const direct = conv.find((c) => c.type === "direct");
  const direct2 = conv.filter((c) => c.type === "direct" && c.id !== direct.id)[0];
  const blob = new Blob([await readFile(VOICE)], { type: "audio/wav" });

  log(`direct=${direct.id}  direct2=${direct2?.id}`);

  log("--- R5.1 voice-call turn 缺 conversationId ---");
  const fd1 = new FormData();
  fd1.set("file", blob, "x.wav");
  fd1.set("durationMs", "1000");
  // 不设 conversationId
  const r1 = await api(token, "POST", "/api/chat/voice-calls/turns", fd1, true);
  log(`  缺 conversationId: status=${r1.status} body=${JSON.stringify(r1.body).slice(0, 120)}`);
  if (r1.status === 200 || r1.status === 201) fail("❌ 缺 conversationId 仍然 2xx");
  log(`  ✅ 缺 conversationId 返回 ${r1.status}`);

  log("--- R5.2 voice-call turn characterId mismatch ---");
  const fd2 = new FormData();
  fd2.set("file", blob, "x.wav");
  fd2.set("durationMs", "1000");
  fd2.set("conversationId", direct.id);
  fd2.set("characterId", "char_wrong_id_xyz");
  const r2 = await api(token, "POST", "/api/chat/voice-calls/turns", fd2, true);
  log(`  characterId mismatch: status=${r2.status} body=${JSON.stringify(r2.body).slice(0, 120)}`);
  if (r2.status === 200 || r2.status === 201) {
    log(`  ⚠️ characterId mismatch 仍然 2xx（应该 404 验证不匹配）`);
  } else {
    log(`  ✅ characterId mismatch 返回 ${r2.status}`);
  }

  log("--- R5.3 跨会话 startedAt 一致幂等不串轮次 ---");
  const sharedStartedAt = new Date(Date.now() - 30_000).toISOString();
  const a1 = await api(token, "POST", "/api/chat/voice-calls/finalize", {
    conversationId: direct.id,
    mode: "voice",
    startedAtIso: sharedStartedAt,
    endedReason: "user_hangup",
  });
  if (!a1.ok) fail(`a1 ${a1.status}`);
  log(`  conv1 finalize messageId=${a1.body.messageId}`);

  if (direct2) {
    const a2 = await api(token, "POST", "/api/chat/voice-calls/finalize", {
      conversationId: direct2.id,
      mode: "voice",
      startedAtIso: sharedStartedAt,
      endedReason: "user_hangup",
    });
    if (!a2.ok) fail(`a2 ${a2.status}`);
    log(`  conv2 finalize messageId=${a2.body.messageId}`);
    if (a1.body.messageId === a2.body.messageId) {
      fail(`❌ 跨会话 startedAt 一致竟然误命中幂等！应当 conversationId 也参与 key`);
    }
    log(`  ✅ 不同 conversationId 写出独立 call_log（conversationId 参与去重 key）`);
  } else {
    log(`  WARN 没有第二个 direct conversation，跳过`);
  }

  log("--- R5.4 群 voice-call turn 缺 groupId ---");
  const fd3 = new FormData();
  fd3.set("file", blob, "x.wav");
  fd3.set("durationMs", "1000");
  const r3 = await api(token, "POST", "/api/chat/group-voice-calls/turns", fd3, true);
  log(`  缺 groupId: status=${r3.status} body=${JSON.stringify(r3.body).slice(0, 120)}`);
  if (r3.status === 200 || r3.status === 201) fail("❌ 缺 groupId 仍然 2xx");
  log(`  ✅ 缺 groupId 返回 ${r3.status}`);

  log("--- R5.5 历史 call_log 多条之后拉取性能 ---");
  // 通过 R3/R4 累积了一些 call_log，看下拉 20 条耗时
  const t0 = Date.now();
  const msgs = await api(token, "GET", `/api/conversations/${encodeURIComponent(direct.id)}/messages?limit=20`);
  const took = Date.now() - t0;
  const callLogs = (msgs.body ?? []).filter((m) => m.attachment?.kind === "call_log");
  log(`  GET messages?limit=20 took ${took}ms, callLogs in last 20=${callLogs.length}`);
  if (took > 1000) {
    log(`  ⚠️ 拉取耗时 ${took}ms 过长（>1s），公网 RTT 600ms 兜底，超过可能有 N+1`);
  } else {
    log(`  ✅ 拉取耗时 ${took}ms，合理`);
  }

  log("--- R5 完成 ---");
}

main().catch((err) => { log("UNCAUGHT", err); process.exit(1); });
