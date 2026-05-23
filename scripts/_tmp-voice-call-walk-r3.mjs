// R3 真实走查：聚焦验证 R6 修复（finalize 幂等 + requestedSpeakerIds 强制点名）
// 不依赖 LLM/whisper/TTS provider 配额
// - 单聊 finalize 二次调用：第二次必须返回与第一次相同 messageId（幂等命中）
// - 群聊 finalize 二次调用：同理
// - finalize endedReason='timeout' 仍能写出 timeout 卡片（同时验证幂等不误命中跨 startedAt）

import { Blob } from "node:buffer";

const CLOUD_API = process.env.CLOUD_API_BASE || "http://127.0.0.1:3001";
const EMAIL = "yuanzui0728@gmail.com";
const PASSWORD = "Test1234!";

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

async function api(token, method, path, body) {
  const init = { method, headers: { Authorization: `Bearer ${token}` } };
  if (body) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
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
  const groups = (await api(token, "GET", "/api/groups")).body;
  const group = groups[0];

  // =========================================
  log("--- R3.1 单聊 finalize 幂等 ---");
  // 用一个独特的 startedAtIso 避免撞之前测试残留
  const startedA = new Date(Date.now() - 30_000).toISOString();
  const f1 = await api(token, "POST", "/api/chat/voice-calls/finalize", {
    conversationId: direct.id,
    characterId: direct.participants[0],
    mode: "voice",
    startedAtIso: startedA,
    endedReason: "user_hangup",
  });
  if (!f1.ok) fail(`finalize1 ${f1.status}`);
  log(`  f1 messageId=${f1.body.messageId} durationSec=${f1.body.durationSec}`);

  const f2 = await api(token, "POST", "/api/chat/voice-calls/finalize", {
    conversationId: direct.id,
    characterId: direct.participants[0],
    mode: "voice",
    startedAtIso: startedA,
    endedReason: "user_hangup",
  });
  if (!f2.ok) fail(`finalize2 ${f2.status}`);
  log(`  f2 messageId=${f2.body.messageId}`);

  if (f1.body.messageId !== f2.body.messageId) {
    fail(`❌ 单聊 finalize 幂等失败：第二次写出了不同 messageId (${f1.body.messageId} vs ${f2.body.messageId})`);
  }
  log(`  ✅ 单聊 finalize 幂等命中：两次返回同一 messageId`);

  // 第三次用不同 startedAtIso：应当写出新 call_log（不被误命中）
  const startedB = new Date(Date.now() - 120_000).toISOString();
  const f3 = await api(token, "POST", "/api/chat/voice-calls/finalize", {
    conversationId: direct.id,
    characterId: direct.participants[0],
    mode: "voice",
    startedAtIso: startedB,
    endedReason: "user_hangup",
  });
  if (!f3.ok) fail(`finalize3 ${f3.status}`);
  log(`  f3 (diff startedAt) messageId=${f3.body.messageId}`);
  if (f3.body.messageId === f1.body.messageId) {
    fail(`❌ 单聊不同 startedAt 误命中幂等！应写出新 call_log`);
  }
  log(`  ✅ 不同 startedAt 写出独立 call_log（幂等正确按 startedAt 区分）`);

  // =========================================
  if (group) {
    log("--- R3.2 群聊 finalize 幂等 ---");
    const startedC = new Date(Date.now() - 45_000).toISOString();
    const g1 = await api(token, "POST", "/api/chat/group-voice-calls/finalize", {
      groupId: group.id,
      mode: "voice",
      startedAtIso: startedC,
      endedReason: "user_hangup",
      participantCount: 3,
    });
    if (!g1.ok) fail(`group finalize1 ${g1.status}`);
    log(`  g1 messageId=${g1.body.messageId} durationSec=${g1.body.durationSec}`);

    const g2 = await api(token, "POST", "/api/chat/group-voice-calls/finalize", {
      groupId: group.id,
      mode: "voice",
      startedAtIso: startedC,
      endedReason: "user_hangup",
      participantCount: 3,
    });
    if (!g2.ok) fail(`group finalize2 ${g2.status}`);
    log(`  g2 messageId=${g2.body.messageId}`);

    if (g1.body.messageId !== g2.body.messageId) {
      fail(`❌ 群聊 finalize 幂等失败 (${g1.body.messageId} vs ${g2.body.messageId})`);
    }
    log(`  ✅ 群聊 finalize 幂等命中`);
  }

  // =========================================
  log("--- R3.3 timeout endedReason 写出 '已超时' 卡片 ---");
  const startedD = new Date(Date.now() - 605_000).toISOString();
  const t1 = await api(token, "POST", "/api/chat/voice-calls/finalize", {
    conversationId: direct.id,
    characterId: direct.participants[0],
    mode: "voice",
    startedAtIso: startedD,
    endedReason: "timeout",
  });
  if (!t1.ok) fail(`timeout finalize ${t1.status}`);
  log(`  timeout finalize messageId=${t1.body.messageId} durationSec=${t1.body.durationSec}`);

  const msgs = (await api(token, "GET", `/api/conversations/${encodeURIComponent(direct.id)}/messages?limit=10`)).body;
  const timeoutCard = msgs.find((m) => m.id === t1.body.messageId);
  if (!timeoutCard) fail("找不到 timeout call_log");
  log(`  timeout text="${timeoutCard.text}" attachment.endedReason=${timeoutCard.attachment?.endedReason}`);
  if (timeoutCard.attachment?.endedReason !== "timeout") {
    fail(`❌ timeout call_log endedReason 不对：${timeoutCard.attachment?.endedReason}`);
  }
  if (!timeoutCard.text?.includes("已超时")) {
    fail(`❌ timeout call_log text 不含'已超时'：${timeoutCard.text}`);
  }
  log(`  ✅ timeout call_log 正确`);

  log("--- R3 finalize 幂等 + timeout 完成 ---");
}

main().catch((err) => { log("UNCAUGHT", err); process.exit(1); });
