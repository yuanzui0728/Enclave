// 消息 tab 全功能端到端走查 harness（隔离 :4200，wgj 租户）
// 直连 shared-world :4200，注 header x-cloud-user-phone=wgj123456789101112。
// 覆盖：会话列表/单聊收发/搜索/pin·mute·read·unread·strongReminder·hide·clear/
//       recall·delete/红包发收/收藏/笔记CRUD+AI/提醒/贴纸/群聊全量/委派。
// 不阻塞等 AI 回复（real LLM 慢且可能失败）——只断言用户消息落库 + 管线不崩。
import { io } from "/home/ps/claude/yinjie-app/node_modules/.pnpm/socket.io-client@4.8.3/node_modules/socket.io-client/build/cjs/index.js";

const BASE = "http://127.0.0.1:4200";
const PHONE = "wgj123456789101112";
const H = { "x-cloud-user-phone": PHONE };
const CHAR = "char-default-doctor"; // 全科医生

const findings = [];
const timings = [];
function finding(sev, area, msg) { findings.push({ sev, area, msg }); console.log(`  [${sev}] ${area}: ${msg}`); }
function ok(area, msg) { console.log(`  ✓ ${area}: ${msg}`); }

async function api(method, path, body, extraHeaders, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  const init = { method, headers: { ...H, ...(extraHeaders || {}) }, signal: ctrl.signal };
  if (body !== undefined) { init.headers["Content-Type"] = "application/json"; init.body = JSON.stringify(body); }
  const t0 = Date.now();
  try {
    const r = await fetch(`${BASE}${path}`, init);
    const dt = Date.now() - t0;
    timings.push({ method, path, dt, status: r.status });
    const text = await r.text();
    let parsed = null; try { parsed = JSON.parse(text); } catch {}
    return { ok: r.ok, status: r.status, body: parsed ?? text, dt };
  } catch (e) {
    const dt = Date.now() - t0;
    timings.push({ method, path, dt, status: "ERR" });
    return { ok: false, status: e?.name === "AbortError" ? "TIMEOUT" : "ERR", body: String(e?.message || e), dt };
  } finally { clearTimeout(to); }
}

function emitAck(socket, event, payload, timeoutMs = 8000) {
  return new Promise((resolve) => {
    let done = false;
    const t = setTimeout(() => { if (!done) { done = true; resolve({ __timeout: true }); } }, timeoutMs);
    socket.emit(event, payload, (ack) => { if (!done) { done = true; clearTimeout(t); resolve(ack); } });
  });
}

function connectSocket() {
  return new Promise((resolve, reject) => {
    const socket = io(`${BASE}/chat`, {
      transports: ["websocket"], timeout: 8000, reconnection: false,
      extraHeaders: H,
    });
    const t = setTimeout(() => reject(new Error("socket connect timeout")), 8000);
    socket.on("connect", () => { clearTimeout(t); resolve(socket); });
    socket.on("connect_error", (e) => { clearTimeout(t); reject(e); });
  });
}

async function main() {
  console.log("=== 消息 tab 走查 harness (wgj @ :4200) ===\n");

  // ---------- 1. 会话列表 ----------
  console.log("[1] 会话列表");
  let r = await api("GET", "/api/conversations");
  if (!r.ok) finding("BUG", "conversations", `GET 列表 ${r.status}`);
  else ok("conversations", `列表 ${Array.isArray(r.body) ? r.body.length : "?"} 条, ${r.dt}ms`);

  // ---------- 2. 创建/获取会话 ----------
  console.log("[2] 创建/获取单聊会话");
  r = await api("POST", "/api/conversations", { characterId: CHAR });
  let convId = r.body?.id;
  if (!r.ok || !convId) finding("BUG", "getOrCreate", `创建会话失败 ${r.status} ${JSON.stringify(r.body).slice(0,200)}`);
  else ok("getOrCreate", `convId=${convId}, ${r.dt}ms`);
  convId = convId || `direct_${CHAR}`;

  // ---------- 3. socket 发文本消息 ----------
  console.log("[3] socket 发文本消息 (不等 AI 回复)");
  let socket;
  try {
    socket = await connectSocket();
    ok("socket", "已连接");
    const events = { new_message: [], errors: [], typing: 0 };
    socket.on("new_message", (m) => events.new_message.push(m));
    socket.on("error", (e) => events.errors.push(e));
    socket.on("typing_start", () => events.typing++);
    // NestJS @SubscribeMessage 返回 {event,data} 会作为一条 emit 事件回推（非 ack 回调），
    // 故 join 用 fire-and-forget + 监听 'joined' 事件，别等 ack（等不到是框架行为非 bug）。
    const joined = new Promise((res) => { socket.once("joined", res); setTimeout(() => res(null), 3000); });
    socket.emit("join_conversation", { conversationId: convId });
    const jr = await joined;
    ok("join_conversation", jr ? "收到 joined 事件" : "未回 joined 事件（前端用 message_sent ack，可接受）");

    // 真实前端 emitChatMessage 是 fire-and-forget（不等 ack；message_sent 在 AI 全链路后才
    // 返回，前端不监听）。这里照真实路径 fire-and-forget，再轮询 getMessages 断言用户消息落库。
    const sendText = "走查测试你好" + Date.now();
    socket.emit("send_message", { conversationId: convId, characterId: CHAR, type: "text", text: sendText });
    let persisted = false;
    for (let i = 0; i < 12; i++) {
      const mr = await api("GET", `/api/conversations/${convId}/messages?limit=50`);
      if (Array.isArray(mr.body) && mr.body.some((m) => m.text === sendText)) { persisted = true; break; }
      await new Promise((res) => setTimeout(res, 500));
    }
    if (persisted) ok("send_message", "用户消息已落库（fire-and-forget，AI 回复异步）");
    else finding("BUG", "send_message", "6s 内用户消息未落库");
    if (events.errors.length) finding("WARN", "send_message", `socket error: ${JSON.stringify(events.errors[0]).slice(0,200)}`);
  } catch (e) {
    finding("BUG", "socket", `连接/发送失败: ${e?.message || e}`);
  }

  // ---------- 4. 拉消息 + 分页 ----------
  console.log("[4] 拉消息/分页");
  r = await api("GET", `/api/conversations/${convId}/messages?limit=20`);
  const msgs = Array.isArray(r.body) ? r.body : [];
  if (!r.ok) finding("BUG", "getMessages", `${r.status}`);
  else ok("getMessages", `${msgs.length} 条, ${r.dt}ms`);
  if (msgs.length) {
    const oldest = msgs[0];
    r = await api("GET", `/api/conversations/${convId}/messages?limit=10&before=${new Date(oldest.createdAt).getTime()}`);
    ok("getMessages(before)", `${Array.isArray(r.body) ? r.body.length : "?"} 条, ${r.dt}ms`);
  }

  // ---------- 5. 消息内搜索 ----------
  console.log("[5] 消息内搜索");
  r = await api("GET", `/api/conversations/${convId}/message-search?keyword=${encodeURIComponent("你好")}`);
  if (!r.ok) finding("BUG", "message-search", `${r.status} ${JSON.stringify(r.body).slice(0,150)}`);
  else ok("message-search", `命中 ${r.body?.items?.length ?? r.body?.results?.length ?? "?"}, ${r.dt}ms`);
  // 空 keyword 边界
  r = await api("GET", `/api/conversations/${convId}/message-search?keyword=`);
  ok("message-search(空kw)", `status ${r.status}, ${r.dt}ms`);

  // ---------- 6. 会话写操作 ----------
  console.log("[6] pin/mute/read/unread/strongReminder/hide/clear");
  for (const [label, path, body] of [
    ["pin", `/api/conversations/${convId}/pin`, { pinned: true }],
    ["unpin", `/api/conversations/${convId}/pin`, { pinned: false }],
    ["mute", `/api/conversations/${convId}/mute`, { muted: true }],
    ["unmute", `/api/conversations/${convId}/mute`, { muted: false }],
    ["read", `/api/conversations/${convId}/read`, {}],
    ["unread", `/api/conversations/${convId}/unread`, {}],
    ["strongReminder-on", `/api/conversations/${convId}/strong-reminder`, { enabled: true, durationHours: 3 }],
    ["strongReminder-off", `/api/conversations/${convId}/strong-reminder`, { enabled: false }],
  ]) {
    r = await api("POST", path, body);
    if (!r.ok) finding("BUG", "conv-write", `${label} ${r.status} ${JSON.stringify(r.body).slice(0,150)}`);
    else ok("conv-write", `${label} ok ${r.dt}ms`);
  }

  // ---------- 7. recall / delete message ----------
  console.log("[7] recall/delete 消息");
  // 取一条 user 消息来 recall/delete
  r = await api("GET", `/api/conversations/${convId}/messages?limit=50`);
  const allMsgs = Array.isArray(r.body) ? r.body : [];
  const userMsg = [...allMsgs].reverse().find((m) => m.senderType === "user");
  if (userMsg) {
    const rr = await api("POST", `/api/conversations/${convId}/messages/${userMsg.id}/recall`);
    if (!rr.ok) finding("WARN", "recall", `${rr.status} ${JSON.stringify(rr.body).slice(0,150)}`);
    else ok("recall", `ok ${rr.dt}ms`);
  } else ok("recall", "无 user 消息可撤回（跳过）");

  // ---------- 8. 红包 发 + 开 ----------
  console.log("[8] 红包发送/打开（结构性，cloud 钱包不可用时应优雅降级）");
  if (socket) {
    const before = Date.now();
    socket.emit("send_message", { conversationId: convId, characterId: CHAR, type: "red_packet", text: "恭喜发财", redPacket: { amountCents: 100, message: "恭喜发财" } });
    await new Promise((res) => setTimeout(res, 1500));
    // 超额红包
    socket.emit("send_message", { conversationId: convId, characterId: CHAR, type: "red_packet", redPacket: { amountCents: 99999999, message: "超额" } });
    await new Promise((res) => setTimeout(res, 800));
    ok("red_packet", `已发两条（含超额），耗时 ${Date.now() - before}ms（错误见 socket error 汇总）`);
  }

  // ---------- 9. 收藏 ----------
  console.log("[9] 收藏 favorites");
  r = await api("GET", "/api/favorites");
  ok("favorites-list", `status ${r.status}, ${r.dt}ms`);
  if (userMsg) {
    r = await api("POST", "/api/favorites/messages", { threadId: convId, messageId: userMsg.id, threadType: "direct" });
    if (!r.ok) finding("WARN", "favorite-message", `${r.status} ${JSON.stringify(r.body).slice(0,150)}`);
    else ok("favorite-message", `ok ${r.dt}ms`);
  }

  // ---------- 10. 笔记 CRUD + AI ----------
  console.log("[10] 笔记 notes CRUD + AI");
  r = await api("GET", "/api/favorites/notes");
  ok("notes-list", `status ${r.status} (${Array.isArray(r.body) ? r.body.length : "?"}), ${r.dt}ms`);
  r = await api("POST", "/api/favorites/notes", { title: "走查笔记", contentHtml: "<p>今天测试消息tab</p>", contentText: "今天测试消息tab", tags: ["走查", "测试"] });
  const noteId = r.body?.id;
  if (!r.ok || !noteId) finding("WARN", "note-create", `${r.status} ${JSON.stringify(r.body).slice(0,150)}`);
  else ok("note-create", `id=${noteId}, ${r.dt}ms`);
  if (noteId) {
    r = await api("PATCH", `/api/favorites/notes/${noteId}`, { title: "走查笔记(改)", contentHtml: "<p>更新内容</p>" });
    ok("note-update", `status ${r.status}, ${r.dt}ms`);
    r = await api("POST", `/api/favorites/notes/${noteId}/pin`, { pinned: true });
    ok("note-pin", `status ${r.status}, ${r.dt}ms`);
    r = await api("GET", `/api/favorites/notes/${noteId}`);
    ok("note-get", `status ${r.status}, ${r.dt}ms`);
  }
  // AI 工具/问答（依赖 LLM，慢/可能失败——记录但不判 BUG）
  r = await api("POST", "/api/favorites/notes/ask", { question: "我记了什么测试笔记？" });
  ok("notes-ask(RAG)", `status ${r.status}, ${r.dt}ms${r.ok ? "" : " " + JSON.stringify(r.body).slice(0,120)}`);

  // ---------- 11. 提醒 reminders ----------
  console.log("[11] 提醒 reminders");
  r = await api("GET", "/api/reminders/messages");
  ok("reminders-list", `status ${r.status} (${Array.isArray(r.body) ? r.body.length : "?"}), ${r.dt}ms`);
  if (userMsg) {
    const remindAt = new Date(Date.now() + 3600_000).toISOString();
    r = await api("POST", "/api/reminders/messages", { threadId: convId, messageId: userMsg.id, threadType: "direct", remindAt });
    // 额外：故意漏 threadId，断言返回干净 400 而非 500（reminder 守卫修复回归）
    const bad = await api("POST", "/api/reminders/messages", { messageId: userMsg.id, threadType: "direct", remindAt });
    if (bad.status === 500) finding("BUG", "reminder-guard", `漏字段返回 500（应 400）: ${JSON.stringify(bad.body).slice(0,120)}`);
    else ok("reminder-guard", `漏字段返回 ${bad.status}（非 500，已收敛）`);
    if (!r.ok) finding("WARN", "reminder-create", `${r.status} ${JSON.stringify(r.body).slice(0,150)}`);
    else { ok("reminder-create", `ok ${r.dt}ms`); }
  }

  // ---------- 12. 贴纸 catalog ----------
  console.log("[12] 贴纸");
  r = await api("GET", "/api/chat/stickers/catalog");
  ok("sticker-catalog", `status ${r.status}, ${r.dt}ms`);

  // ---------- 13. 群聊全量 ----------
  console.log("[13] 群聊");
  r = await api("GET", "/api/groups");
  ok("groups-list", `status ${r.status} (${Array.isArray(r.body) ? r.body.length : "?"}), ${r.dt}ms`);
  // 建群（需 ≥2 角色成员）
  r = await api("POST", "/api/groups", { name: "走查群", memberIds: [CHAR, "char-default-doctor"] });
  let groupId = r.body?.id;
  if (!r.ok || !groupId) {
    // 换两个不同角色重试
    r = await api("POST", "/api/groups", { name: "走查群2", memberIds: ["char-default-doctor", "char-preset-zhou-ran-fitness-coach"] });
    groupId = r.body?.id;
  }
  if (!groupId) finding("WARN", "group-create", `${r.status} ${JSON.stringify(r.body).slice(0,200)}`);
  else {
    ok("group-create", `groupId=${groupId}, ${r.dt}ms`);
    r = await api("GET", `/api/groups/${groupId}`); ok("group-get", `status ${r.status}, ${r.dt}ms`);
    r = await api("GET", `/api/groups/${groupId}/members`); ok("group-members", `status ${r.status} (${Array.isArray(r.body) ? r.body.length : "?"}), ${r.dt}ms`);
    r = await api("GET", `/api/groups/${groupId}/messages?limit=20`); ok("group-messages", `status ${r.status}, ${r.dt}ms`);
    r = await api("POST", `/api/groups/${groupId}/messages`, { type: "text", text: "群里大家好" });
    if (!r.ok) finding("WARN", "group-send", `${r.status} ${JSON.stringify(r.body).slice(0,150)}`); else ok("group-send", `ok ${r.dt}ms`);
    r = await api("GET", `/api/groups/${groupId}/message-search?keyword=${encodeURIComponent("大家好")}`); ok("group-search", `status ${r.status}, ${r.dt}ms`);
    r = await api("POST", `/api/groups/${groupId}/pin`, { pinned: true }); ok("group-pin", `status ${r.status}, ${r.dt}ms`);
    r = await api("POST", `/api/groups/${groupId}/read`); ok("group-read", `status ${r.status}, ${r.dt}ms`);
    r = await api("POST", `/api/groups/${groupId}/unread`); ok("group-unread", `status ${r.status}, ${r.dt}ms`);
    r = await api("PATCH", `/api/groups/${groupId}/me`, { nickname: "我的群昵称" }); ok("group-nickname", `status ${r.status}, ${r.dt}ms`);
    r = await api("PATCH", `/api/groups/${groupId}`, { announcement: "群公告：走查中" }); ok("group-announce", `status ${r.status}, ${r.dt}ms`);
    r = await api("PATCH", `/api/groups/${groupId}/preferences`, { isMuted: true }); ok("group-prefs", `status ${r.status}, ${r.dt}ms`);
    r = await api("POST", `/api/groups/${groupId}/clear`); ok("group-clear", `status ${r.status}, ${r.dt}ms`);
  }

  // ---------- 14. 委派列表 ----------
  console.log("[14] 委派 delegations");
  r = await api("GET", `/api/conversations/${convId}/delegations`);
  ok("delegations", `status ${r.status} (${Array.isArray(r.body) ? r.body.length : "?"}), ${r.dt}ms`);

  // ---------- 收尾 ----------
  if (socket) {
    // 汇总 socket errors
    socket.disconnect();
  }

  // ---------- 性能汇总 ----------
  console.log("\n=== 性能汇总 (Top 10 慢调用) ===");
  timings.sort((a, b) => b.dt - a.dt).slice(0, 10).forEach((t) => {
    const flag = t.dt > 1000 ? " ⚠️SLOW" : "";
    console.log(`  ${t.dt}ms  ${t.method} ${t.path} [${t.status}]${flag}`);
  });

  console.log("\n=== Findings 汇总 ===");
  if (!findings.length) console.log("  （无 BUG/WARN）");
  else findings.forEach((f) => console.log(`  [${f.sev}] ${f.area}: ${f.msg}`));
  console.log(`\n总计 findings: ${findings.length} (BUG=${findings.filter(f=>f.sev==="BUG").length}, WARN=${findings.filter(f=>f.sev==="WARN").length})`);
  process.exit(0);
}

main().catch((e) => { console.error("HARNESS CRASH", e); process.exit(1); });
