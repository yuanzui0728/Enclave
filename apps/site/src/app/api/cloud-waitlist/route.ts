import { NextRequest, NextResponse } from "next/server";
import { appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WAITLIST_FILE = join(process.cwd(), ".data", "cloud-waitlist.jsonl");
const OPTIONAL_WEBHOOK = process.env.CLOUD_WAITLIST_WEBHOOK_URL;

interface WaitlistEntry {
  email: string;
  priceWillingness?: string;
  feature?: string;
  source?: string;
  locale?: string;
  submittedAt: string;
  userAgent?: string;
  ip?: string;
}

function validateEmail(email: unknown): email is string {
  if (typeof email !== "string") return false;
  if (email.length < 3 || email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function sanitize(value: unknown, max = 500): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!validateEmail(body.email)) {
    return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });
  }

  const entry: WaitlistEntry = {
    email: body.email,
    priceWillingness: sanitize(body.priceWillingness, 50),
    feature: sanitize(body.feature, 1000),
    source: sanitize(body.source, 100),
    locale: sanitize(body.locale, 10),
    submittedAt: new Date().toISOString(),
    userAgent: sanitize(req.headers.get("user-agent"), 300),
    ip:
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      undefined,
  };

  try {
    await mkdir(dirname(WAITLIST_FILE), { recursive: true });
    await appendFile(WAITLIST_FILE, JSON.stringify(entry) + "\n", "utf8");
  } catch (err) {
    console.error("[cloud-waitlist] failed to persist entry", err);
    return NextResponse.json({ ok: false, error: "storage_failed" }, { status: 500 });
  }

  if (OPTIONAL_WEBHOOK) {
    void fetch(OPTIONAL_WEBHOOK, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(entry),
    }).catch((err) => {
      console.error("[cloud-waitlist] webhook forward failed", err);
    });
  }

  return NextResponse.json({ ok: true });
}
