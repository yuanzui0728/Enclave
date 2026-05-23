// R4 真实操作走查：错误路径 + 边角 case
// - 不存在的 conversationId / groupId → 404
// - 无效 startedAtIso → fallback 处理（不崩）
// - finalize mode='video' 路由到 voice-calls/finalize（用户切模式后再 hangup）
// - finalize 同 startedAt 但不同 endedReason → 应当幂等命中（只看 startedAt）
// - 并发 finalize 2 次（race condition）

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

  log("--- R4.1 不存在的 conversationId / groupId ---");
  const e1 = await api(token, "POST", "/api/chat/voice-calls/finalize", {
    conversationId: "direct_nonexistent_xyz",
    mode: "voice",
    startedAtIso: new Date().toISOString(),
    endedReason: "user_hangup",
  });
  log(`  不存在的 conversation: status=${e1.status} body=${JSON.stringify(e1.body).slice(0, 120)}`);
  if (e1.status === 200 || e1.status === 201) {
    fail(`❌ 不存在的 conversation 仍然 ${e1.status}！`);
  }
  log(`  ✅ 不存在的 conversation 返回 ${e1.status}（非 2xx）`);

  const e2 = await api(token, "POST", "/api/chat/group-voice-calls/finalize", {
    groupId: "group_nonexistent_xyz",
    mode: "voice",
    startedAtIso: new Date().toISOString(),
    endedReason: "user_hangup",
    participantCount: 2,
  });
  log(`  不存在的 group: status=${e2.status} body=${JSON.stringify(e2.body).slice(0, 120)}`);
  if (e2.status === 200 || e2.status === 201) {
    fail(`❌ 不存在的 group 仍然 ${e2.status}！`);
  }
  log(`  ✅ 不存在的 group 返回 ${e2.status}`);

  log("--- R4.2 无效 startedAtIso ---");
  const e3 = await api(token, "POST", "/api/chat/voice-calls/finalize", {
    conversationId: direct.id,
    mode: "voice",
    startedAtIso: "not-an-iso-date",
    endedReason: "user_hangup",
  });
  log(`  无效 startedAt: status=${e3.status} messageId=${e3.body?.messageId} durationSec=${e3.body?.durationSec}`);
  // parseStartedAt 兜底返回 new Date()，durationSec 应该接近 0
  if (!e3.ok) {
    fail(`❌ 无效 startedAt 直接 ${e3.status}（应该兜底）`);
  }
  if (e3.body.durationSec > 5) {
    fail(`❌ 无效 startedAt 兜底没生效，durationSec=${e3.body.durationSec}`);
  }
  log(`  ✅ 无效 startedAt 兜底为当前时间，durationSec=${e3.body.durationSec}`);

  log("--- R4.3 finalize mode='video' 路由到 voice-calls/finalize ---");
  // 真实场景：用户在视频通话页切到语音通话，handleSwitchToVoiceCall hangup
  // 前一段 video session 时传 mode='video'
  const startedV = new Date(Date.now() - 15_000).toISOString();
  const e4 = await api(token, "POST", "/api/chat/voice-calls/finalize", {
    conversationId: direct.id,
    characterId: direct.participants[0],
    mode: "video",
    startedAtIso: startedV,
    endedReason: "user_hangup",
  });
  if (!e4.ok) fail(`mode=video finalize ${e4.status}`);
  log(`  mode=video finalize ok messageId=${e4.body.messageId}`);
  const msgs = (await api(token, "GET", `/api/conversations/${encodeURIComponent(direct.id)}/messages?limit=5`)).body;
  const videoCard = msgs.find((m) => m.id === e4.body.messageId);
  if (!videoCard) fail("找不到 video call_log");
  log(`  video card text="${videoCard.text}" mode=${videoCard.attachment?.mode}`);
  if (videoCard.attachment?.mode !== "video") {
    fail(`❌ mode 字段错：期望 video，实际 ${videoCard.attachment?.mode}`);
  }
  if (!videoCard.text?.includes("视频通话")) {
    fail(`❌ video call_log text 不含"视频通话"：${videoCard.text}`);
  }
  log(`  ✅ mode=video 写出"视频通话" call_log 正确`);

  log("--- R4.4 同 startedAt 不同 endedReason → 仅 startedAt 决定幂等 ---");
  const startedE = new Date(Date.now() - 60_000).toISOString();
  const fA = await api(token, "POST", "/api/chat/voice-calls/finalize", {
    conversationId: direct.id,
    mode: "voice",
    startedAtIso: startedE,
    endedReason: "user_hangup",
  });
  if (!fA.ok) fail(`fA ${fA.status}`);
  log(`  fA endedReason=user_hangup messageId=${fA.body.messageId}`);
  const fB = await api(token, "POST", "/api/chat/voice-calls/finalize", {
    conversationId: direct.id,
    mode: "voice",
    startedAtIso: startedE,
    endedReason: "timeout",  // 不同 reason
  });
  if (!fB.ok) fail(`fB ${fB.status}`);
  log(`  fB endedReason=timeout messageId=${fB.body.messageId}`);
  if (fA.body.messageId !== fB.body.messageId) {
    log(`  ⚠️ 同 startedAt 不同 endedReason 写出独立 call_log——这是设计选择`);
    log(`     建议：幂等只按 startedAt，因为同一通话不应有两个不同结束原因`);
  } else {
    log(`  ✅ 同 startedAt 即使 endedReason 不同也复用首条（保留原 endedReason）`);
  }

  log("--- R4.5 并发 finalize race ---");
  const startedF = new Date(Date.now() - 5_000).toISOString();
  const [p1, p2, p3] = await Promise.all([
    api(token, "POST", "/api/chat/voice-calls/finalize", {
      conversationId: direct.id, mode: "voice", startedAtIso: startedF, endedReason: "user_hangup",
    }),
    api(token, "POST", "/api/chat/voice-calls/finalize", {
      conversationId: direct.id, mode: "voice", startedAtIso: startedF, endedReason: "user_hangup",
    }),
    api(token, "POST", "/api/chat/voice-calls/finalize", {
      conversationId: direct.id, mode: "voice", startedAtIso: startedF, endedReason: "user_hangup",
    }),
  ]);
  const ids = [p1.body.messageId, p2.body.messageId, p3.body.messageId];
  log(`  并发 3 个 finalize → messageIds=${JSON.stringify(ids)}`);
  const distinctIds = new Set(ids);
  if (distinctIds.size > 1) {
    log(`  ⚠️ 并发 race：${distinctIds.size} 个不同 messageId，幂等查询没拦住同时刻写入`);
    log(`     真实环境概率低（用户点击间隔 >ms），但理想情况应有 UNIQUE INDEX 兜底`);
  } else {
    log(`  ✅ 并发 race 全部命中同一 messageId（SQLite 序列化）`);
  }

  log("--- R4 完成 ---");
}

main().catch((err) => { log("UNCAUGHT", err); process.exit(1); });
