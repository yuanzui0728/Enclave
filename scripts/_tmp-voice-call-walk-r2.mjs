// R2 真实走查：扩展场景
// - 单聊连续 2 turns（验证 finalizedRef + state 不串轮次）
// - finalize 二次幂等（writeProtect 不双写 call_log）
// - finalize endedReason='timeout' 写出"已超时"call_log
// - 群聊 requestedSpeakerIds 优先点名
// - 拉聊天最后 N 条消息，验证 call_log + waiting/connected/ended socket 卡片实际入库
//
// 测试需要 yuanzui world child 跑当前 dist。OpenAI quota 已耗尽（whisper/TTS 都 403），
// 但 LLM 还有，验证三级兜底 + transcriptStatus failed 仍能返 200。

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
  if (!r.ok) fail(`login ${r.status} ${await r.text()}`);
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
  return { ok: r.ok, status: r.status, body: t ? safeJson(t) : null };
}
function safeJson(s) { try { return JSON.parse(s); } catch { return s; } }

async function voiceTurn(token, conversationId, blob) {
  const fd = new FormData();
  fd.set("file", blob, "voice-message.wav");
  fd.set("durationMs", "1000");
  fd.set("conversationId", conversationId);
  return api(token, "POST", "/api/chat/voice-calls/turns", fd, true);
}
async function groupVoiceTurn(token, groupId, blob, requestedSpeakerIds) {
  const fd = new FormData();
  fd.set("file", blob, "voice-message.wav");
  fd.set("durationMs", "1000");
  fd.set("groupId", groupId);
  if (requestedSpeakerIds?.length) fd.set("requestedSpeakerIds", requestedSpeakerIds.join(","));
  return api(token, "POST", "/api/chat/group-voice-calls/turns", fd, true);
}

async function main() {
  const token = await login();
  const blob = new Blob([await readFile(VOICE)], { type: "audio/wav" });

  // 拉 direct/group
  const conv = (await api(token, "GET", "/api/conversations")).body;
  const direct = conv.find((c) => c.type === "direct");
  const groups = (await api(token, "GET", "/api/groups")).body;
  const group = groups[0];
  log(`direct=${direct.id} group=${group?.id}`);

  // ================================
  log("--- R2.1 单聊连续 2 turns ---");
  const startedAt1 = new Date().toISOString();
  const t1 = await voiceTurn(token, direct.id, blob);
  if (!t1.ok) fail(`turn1 ${t1.status} ${JSON.stringify(t1.body).slice(0, 200)}`);
  log(`  turn1 OK assistantText="${(t1.body.assistantText ?? "").slice(0, 40)}" status=${t1.body.transcriptStatus} audio=${t1.body.assistantAudioUrl}`);

  // 立刻第二轮（同一会话）
  const t2 = await voiceTurn(token, direct.id, blob);
  if (!t2.ok) fail(`turn2 ${t2.status} ${JSON.stringify(t2.body).slice(0, 200)}`);
  log(`  turn2 OK assistantText="${(t2.body.assistantText ?? "").slice(0, 40)}" status=${t2.body.transcriptStatus} audio=${t2.body.assistantAudioUrl}`);

  // 断言：两轮各自有独立 messageId
  if (t1.body.userMessageId === t2.body.userMessageId) fail("turn1/turn2 userMessageId 重复");
  if (t1.body.assistantMessageId === t2.body.assistantMessageId) fail("turn1/turn2 assistantMessageId 重复");

  // ================================
  log("--- R2.2 finalize 二次调用：第二次应幂等无副作用 ---");
  const f1 = await api(token, "POST", "/api/chat/voice-calls/finalize", {
    conversationId: direct.id,
    characterId: direct.participants[0],
    mode: "voice",
    startedAtIso: startedAt1,
    endedReason: "user_hangup",
  });
  if (!f1.ok) fail(`finalize1 ${f1.status}`);
  log(`  finalize1: messageId=${f1.body.messageId} durationSec=${f1.body.durationSec}`);

  // 二次（前端 finalizedRef 已锁，但后端没有 idempotency key — 这是个潜在 bug）
  const f2 = await api(token, "POST", "/api/chat/voice-calls/finalize", {
    conversationId: direct.id,
    characterId: direct.participants[0],
    mode: "voice",
    startedAtIso: startedAt1,
    endedReason: "user_hangup",
  });
  log(`  finalize2 status=${f2.status} messageId=${f2.body?.messageId}`);
  // 这里只 LOG，不 fail——确认后端是否会写出 2 条 call_log

  // 拉最近消息看是否双写
  const msgs = (await api(token, "GET", `/api/conversations/${encodeURIComponent(direct.id)}/messages?limit=10`)).body;
  const callLogs = msgs.filter((m) =>
    m.attachment?.kind === "call_log" &&
    Math.abs(new Date(m.createdAt).getTime() - new Date(f1.body.messageId?.split("_")[1] ? Number(f1.body.messageId.split("_")[1]) : Date.now()).getTime()) < 60_000
  );
  log(`  ⚠️ 最近 10 条里 call_log 数=${callLogs.length}（finalize×2 → 期望 1 但当前可能 2，反映后端无 idempotency）`);
  for (const m of callLogs) {
    log(`     call_log: id=${m.id} createdAt=${m.createdAt} endedReason=${m.attachment.endedReason} durationSec=${m.attachment.durationSec}`);
  }

  // ================================
  log("--- R2.3 finalize endedReason=timeout 写'已超时' call_log ---");
  const startedAt2 = new Date(Date.now() - 605_000).toISOString();
  const f3 = await api(token, "POST", "/api/chat/voice-calls/finalize", {
    conversationId: direct.id,
    characterId: direct.participants[0],
    mode: "voice",
    startedAtIso: startedAt2,
    endedReason: "timeout",
  });
  if (!f3.ok) fail(`finalize3 ${f3.status}`);
  log(`  finalize3 timeout: messageId=${f3.body.messageId} durationSec=${f3.body.durationSec}`);
  const msgs2 = (await api(token, "GET", `/api/conversations/${encodeURIComponent(direct.id)}/messages?limit=5`)).body;
  const timeoutLog = msgs2.find((m) => m.attachment?.kind === "call_log" && m.attachment?.endedReason === "timeout");
  if (!timeoutLog) fail("没找到 timeout call_log");
  log(`  timeout call_log: text="${timeoutLog.text}" durationSec=${timeoutLog.attachment.durationSec}`);

  // ================================
  if (group) {
    log("--- R2.4 群聊 requestedSpeakerIds 优先点名 ---");
    const members = (await api(token, "GET", `/api/groups/${encodeURIComponent(group.id)}/members`)).body;
    log(`  group members count=${members.length}`);
    const aiMember = members.find((m) => m.memberType === "character" && m.role !== "user");
    if (!aiMember) {
      log("  WARN 群里没 AI member，跳过 requestedSpeakerIds 测试");
    } else {
      log(`  指定 actor=${aiMember.memberName} (${aiMember.memberId})`);
      const gt = await groupVoiceTurn(token, group.id, blob, [aiMember.memberId]);
      if (!gt.ok) fail(`群 requestedSpeakerIds turn ${gt.status} ${JSON.stringify(gt.body).slice(0, 200)}`);
      log(`  群 turn ok actors=${gt.body.assistantTurns?.length}`);
      const turn = gt.body.assistantTurns?.[0];
      if (turn) {
        log(`     actor=${turn.characterName} (id=${turn.characterId}) text="${(turn.assistantText ?? "").slice(0, 40)}"`);
        // 断言：requestedSpeakerIds 优先生效
        if (turn.characterId !== aiMember.memberId) {
          log(`  ⚠️ requestedSpeakerIds 未优先点名（要求 ${aiMember.memberId} 但实际 ${turn.characterId}）`);
        }
      }
    }
  }

  log("--- R2 完成 ---");
}

main().catch((err) => { log("UNCAUGHT", err); process.exit(1); });
