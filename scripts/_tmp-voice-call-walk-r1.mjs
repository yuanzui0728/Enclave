// 端到端真实操作走查：移动端语音通话（单聊 + 群聊）
// 1) 登 yuanzui0728 拿 cloud accessToken
// 2) cloud-api /cloud/world/resolve 拿到 world child apiBaseUrl
// 3) 拉一条 direct conversation + 一个 group → 各自做一轮 voice-call/turns
// 4) finalize 单聊 + 群聊 call_log 卡片
//
// 不走 playwright（mobile 模拟没法真正给 mic stream）。直接打后端 API，
// 等同于"按住-松开"完整 round-trip，断言关键字段。

import { readFile } from "node:fs/promises";
import { Blob } from "node:buffer";

const CLOUD_API = process.env.CLOUD_API_BASE || "http://127.0.0.1:3001";
const EMAIL = "yuanzui0728@gmail.com";
const PASSWORD = "Test1234!";
const VOICE_SAMPLE_PATH =
  "/home/ps/claude/yinjie-app/data/accounts/17757541197/chat-attachments/1776996541187-357e0b34-voice-call-smoke.wav";

function log(...args) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}]`, ...args);
}

function fail(msg) {
  log("FAIL", msg);
  process.exit(1);
}

async function login() {
  const res = await fetch(`${CLOUD_API}/cloud/auth/login-with-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identifier: EMAIL,
      identifierKind: "email",
      password: PASSWORD,
    }),
  });
  if (!res.ok) fail(`login ${res.status} ${await res.text()}`);
  const json = await res.json();
  log("login ok phone=", json.phone, "exp=", json.expiresAt);
  return json.accessToken;
}

async function resolveWorldApiBase(token) {
  // 走 cloud-api 反代：所有 /cloud/world-api/* 调用都由 cloud-api 路由到当前
  // 用户 world child。这里直接用 cloud-api 的 /cloud/world/resolve 拿原始 child url
  // 不是必须的 —— 走 world-api 反代即可。
  return `${CLOUD_API}/cloud/world-api`;
}

async function getJson(token, path) {
  const res = await fetch(`${CLOUD_API}/cloud/world-api${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) fail(`GET ${path} ${res.status} ${await res.text()}`);
  return res.json();
}

async function loadVoiceBlob() {
  const buf = await readFile(VOICE_SAMPLE_PATH);
  return new Blob([buf], { type: "audio/wav" });
}

async function postVoiceCallTurn(token, conversationId, blob) {
  const fd = new FormData();
  fd.set("file", blob, "voice-message.wav");
  fd.set("durationMs", "1000");
  fd.set("conversationId", conversationId);
  const res = await fetch(`${CLOUD_API}/cloud/world-api/api/chat/voice-calls/turns`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  const text = await res.text();
  if (!res.ok) {
    log(`voice-call turn ${res.status}: ${text}`);
    return { ok: false, status: res.status, body: text };
  }
  return { ok: true, status: res.status, body: JSON.parse(text) };
}

async function postGroupVoiceCallTurn(token, groupId, blob) {
  const fd = new FormData();
  fd.set("file", blob, "voice-message.wav");
  fd.set("durationMs", "1000");
  fd.set("groupId", groupId);
  const res = await fetch(`${CLOUD_API}/cloud/world-api/api/chat/group-voice-calls/turns`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: fd,
  });
  const text = await res.text();
  if (!res.ok) {
    log(`group voice-call turn ${res.status}: ${text}`);
    return { ok: false, status: res.status, body: text };
  }
  return { ok: true, status: res.status, body: JSON.parse(text) };
}

async function postFinalize(token, scope, payload) {
  const url =
    scope === "direct"
      ? `${CLOUD_API}/cloud/world-api/api/chat/voice-calls/finalize`
      : `${CLOUD_API}/cloud/world-api/api/chat/group-voice-calls/finalize`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) {
    log(`finalize ${scope} ${res.status}: ${text}`);
    return { ok: false, status: res.status, body: text };
  }
  return { ok: true, status: res.status, body: JSON.parse(text) };
}

async function main() {
  const token = await login();

  log("--- 拉会话列表 ---");
  const conversations = await getJson(token, "/api/conversations");
  log(`conversations: ${conversations.length} total`);
  const direct = conversations.find((c) => c.type === "direct");
  if (!direct) fail("没找到 direct 会话");
  log(`direct: id=${direct.id} title=${direct.title} participants=${JSON.stringify(direct.participants)}`);

  log("--- 拉群组 ---");
  const groups = await getJson(token, "/api/groups");
  log(`groups: ${groups.length} total`);
  const group = groups[0];
  if (!group) {
    log("WARN 没有群，跳过群语音");
  } else {
    log(`group: id=${group.id} name=${group.name}`);
  }

  log("--- 单聊语音通话 R1：1 个 turn ---");
  const blob = await loadVoiceBlob();
  const startedAtIso = new Date().toISOString();
  const turn = await postVoiceCallTurn(token, direct.id, blob);
  if (!turn.ok) fail(`单聊 turn 失败 ${turn.status}`);
  const r = turn.body;
  log(
    `单聊 turn ok: characterId=${r.characterId} characterName=${r.characterName}`,
    `\n   transcriptStatus=${r.transcriptStatus} userTranscript=${JSON.stringify(r.userTranscript)}`,
    `\n   assistantText="${(r.assistantText ?? "").slice(0, 80)}"`,
    `\n   assistantAudioUrl=${r.assistantAudioUrl}`,
    `\n   synthesisDurationMs=${r.synthesisDurationMs} totalDurationMs=${r.totalDurationMs}`,
    `\n   provider=${r.provider} speechFallbackReason=${r.speechFallbackReason}`,
  );

  // 断言：transcriptStatus 必须是 4 个枚举值之一
  if (!["completed", "pending", "failed", "skipped"].includes(r.transcriptStatus)) {
    fail(`transcriptStatus 非法: ${r.transcriptStatus}`);
  }
  // 断言：assistantText 不能空
  if (!r.assistantText || !r.assistantText.trim()) {
    fail("assistantText 空");
  }

  log("--- 单聊语音通话 finalize（user_hangup）---");
  const fin = await postFinalize(token, "direct", {
    conversationId: direct.id,
    characterId: r.characterId,
    mode: "voice",
    startedAtIso,
    endedReason: "user_hangup",
  });
  if (!fin.ok) fail(`finalize 失败 ${fin.status}`);
  log(`finalize ok: messageId=${fin.body.messageId} durationSec=${fin.body.durationSec}`);

  if (group) {
    log("--- 群语音通话 R1：1 个 turn ---");
    const groupStartedAt = new Date().toISOString();
    const gturn = await postGroupVoiceCallTurn(token, group.id, blob);
    if (!gturn.ok) fail(`群 turn 失败 ${gturn.status}`);
    const g = gturn.body;
    log(
      `群 turn ok: assistantTurns=${g.assistantTurns?.length}`,
      `\n   transcriptStatus=${g.transcriptStatus} userTranscript=${JSON.stringify(g.userTranscript)}`,
      `\n   totalDurationMs=${g.totalDurationMs}`,
    );
    for (const t of g.assistantTurns ?? []) {
      log(
        `   actor=${t.characterName} text="${(t.assistantText ?? "").slice(0, 60)}"`,
        `audioUrl=${t.assistantAudioUrl ? t.assistantAudioUrl.slice(0, 60) : "null"}`,
        `tts=${t.synthesisDurationMs}ms fb=${t.speechFallbackReason}`,
      );
    }
    if (!["completed", "pending", "failed", "skipped"].includes(g.transcriptStatus)) {
      fail(`群 transcriptStatus 非法: ${g.transcriptStatus}`);
    }

    log("--- 群语音通话 finalize（user_hangup）---");
    const gfin = await postFinalize(token, "group", {
      groupId: group.id,
      mode: "voice",
      startedAtIso: groupStartedAt,
      endedReason: "user_hangup",
      participantCount: 3,
    });
    if (!gfin.ok) fail(`群 finalize 失败 ${gfin.status}`);
    log(`群 finalize ok: messageId=${gfin.body.messageId} durationSec=${gfin.body.durationSec}`);
  }

  log("--- R1 全部通过 ---");
}

main().catch((err) => {
  log("UNCAUGHT", err);
  process.exit(1);
});
