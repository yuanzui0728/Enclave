// SaaS smoke test for the cloud-api stage 1 接口。
// 使用：node scripts/saas-smoke-test.mjs <phone> [inviteCode]
// 默认 phone: +8613800000099
const phone = process.argv[2] ?? "+8613800000099";
const inviteCode = process.argv[3] ?? null;
const base = process.env.CLOUD_API_BASE ?? "http://127.0.0.1:3001";

async function send() {
  const res = await fetch(`${base}/cloud/auth/send-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone }),
  });
  if (!res.ok) throw new Error(`send-code failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function verify(code) {
  const res = await fetch(`${base}/cloud/auth/verify-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, code, inviteCode, deviceFingerprint: "smoke-fp" }),
  });
  if (!res.ok) throw new Error(`verify-code failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function getMe(token, path) {
  const res = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

const sent = await send();
console.log("send", sent);
const verified = await verify(sent.debugCode);
console.log("verify", { phone: verified.phone, expiresAt: verified.expiresAt });
const sub = await getMe(verified.accessToken, "/cloud/me/subscription");
console.log("subscription", JSON.stringify(sub, null, 2));
const inv = await getMe(verified.accessToken, "/cloud/me/invite/summary");
console.log("invite", JSON.stringify(inv, null, 2));
