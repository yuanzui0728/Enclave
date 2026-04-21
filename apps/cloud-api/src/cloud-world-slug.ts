import { createHash } from "node:crypto";

export function createCloudWorldSlug(phone: string) {
  const digits = phone.replace(/\D+/g, "");
  const phoneSuffix = digits.slice(-4) || "0000";
  const hashSuffix = createHash("sha1").update(phone).digest("hex").slice(0, 8);
  return `world-${phoneSuffix}-${hashSuffix}`;
}
