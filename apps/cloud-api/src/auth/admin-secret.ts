import { timingSafeEqual } from "node:crypto";

export function matchesCloudAdminSecret(providedSecret: string, expectedSecret: string) {
  const providedBuffer = Buffer.from(providedSecret, "utf8");
  const expectedBuffer = Buffer.from(expectedSecret, "utf8");

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}
