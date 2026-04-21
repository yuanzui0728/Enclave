import "reflect-metadata";

import assert from "node:assert/strict";
import test from "node:test";
import { DataSource } from "typeorm";
import { PhoneAuthService } from "../src/auth/phone-auth.service";
import { PhoneVerificationSessionEntity } from "../src/entities/phone-verification-session.entity";

function createConfig(values: Record<string, string | undefined>) {
  return {
    get<T = string>(propertyPath: string): T | undefined {
      return values[propertyPath] as T | undefined;
    },
  };
}

async function createPhoneAuthDataSource() {
  const dataSource = new DataSource({
    type: "better-sqlite3",
    database: ":memory:",
    entities: [PhoneVerificationSessionEntity],
    synchronize: true,
  });

  await dataSource.initialize();
  return dataSource;
}

test("sendCode cleans up persisted sessions when the sms provider fails", async (t) => {
  const dataSource = await createPhoneAuthDataSource();
  t.after(async () => {
    await dataSource.destroy();
  });

  const sessionRepo = dataSource.getRepository(PhoneVerificationSessionEntity);
  let sendAttempts = 0;
  const service = new PhoneAuthService(
    sessionRepo,
    createConfig({}) as never,
    {} as never,
    {
      async sendCode(phone: string, code: string) {
        sendAttempts += 1;
        if (sendAttempts === 1) {
          throw new Error(`sms provider failed for ${phone}:${code}`);
        }

        return {
          debugCode: code,
        };
      },
    } as never,
  );

  await assert.rejects(
    () => service.sendCode("+8613800138200"),
    /短信验证码发送失败，请稍后重试。/,
  );
  assert.equal(await sessionRepo.count(), 0);

  const response = await service.sendCode("+8613800138200");
  assert.equal(response.phone, "+8613800138200");
  assert.match(response.debugCode ?? "", /^[0-9]{6}$/);
  assert.equal(await sessionRepo.count(), 1);
});
