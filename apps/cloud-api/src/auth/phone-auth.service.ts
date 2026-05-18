// i18n-ignore-start: data / seed / preset content — not user-facing UI.
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import type { SendPhoneCodeResponse, VerifyPhoneCodeResponse } from "@yinjie/contracts";
import { MoreThan, Repository } from "typeorm";
import {
  parseJwtDurationToMs,
  resolveCloudAuthTokenTtl,
  resolveCloudClientJwtAudience,
  resolveCloudJwtIssuer,
} from "../config/cloud-runtime-config";
import { CloudUserEntity } from "../entities/cloud-user.entity";
import { PhoneVerificationSessionEntity } from "../entities/phone-verification-session.entity";
import { CLOUD_CLIENT_ACCESS_TOKEN_PURPOSE } from "./cloud-jwt.constants";
import { MockSmsProviderService } from "./mock-sms-provider.service";
import { assertPasswordStrength } from "./password-policy";

const DEV_BYPASS_CODE = "123456";

@Injectable()
export class PhoneAuthService {
  constructor(
    @InjectRepository(PhoneVerificationSessionEntity)
    private readonly sessionRepo: Repository<PhoneVerificationSessionEntity>,
    @InjectRepository(CloudUserEntity)
    private readonly userRepo: Repository<CloudUserEntity>,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly smsProvider: MockSmsProviderService,
  ) {}

  async sendCode(phone: string): Promise<SendPhoneCodeResponse> {
    const normalizedPhone = this.normalizePhone(phone);
    await this.enforceSendCodeRateLimit(normalizedPhone);
    const code = this.generateCode();
    const expiresAt = new Date(Date.now() + this.getCodeTtlSeconds() * 1000);

    const session = this.sessionRepo.create({
      phone: normalizedPhone,
      code,
      expiresAt,
      verifiedAt: null,
    });
    await this.sessionRepo.save(session);
    let providerResult: Awaited<ReturnType<MockSmsProviderService["sendCode"]>>;
    try {
      providerResult = await this.smsProvider.sendCode(normalizedPhone, code);
    } catch {
      await this.sessionRepo.delete({ id: session.id });
      throw new ServiceUnavailableException("短信验证码发送失败，请稍后重试。");
    }

    return {
      phone: normalizedPhone,
      expiresAt: expiresAt.toISOString(),
      debugCode: providerResult.debugCode ?? null,
    };
  }

  async verifyCode(
    phone: string,
    code: string,
    extras?: {
      inviteCode?: string | null;
      deviceFingerprint?: string | null;
      ip?: string | null;
      userAgent?: string | null;
      clientPlatform?: string | null;
      setPasswordOnRegister?: string | null;
    },
  ): Promise<VerifyPhoneCodeResponse> {
    const normalizedPhone = this.normalizePhone(phone);
    const normalizedCode = code.trim();

    if (!normalizedCode) {
      throw new BadRequestException("验证码不能为空。");
    }

    // 先**只读校验** session，不写 verifiedAt；签 token 全部成功后再 markUsed。
    // 这样 user banned / hook 失败时 code 仍未消费，用户可重试同一码（仍会被相同
    // 错误拦截，但不会强制重发码）。
    let session: PhoneVerificationSessionEntity;

    if (normalizedCode === DEV_BYPASS_CODE) {
      // dev bypass 在内存构造 session，与普通路径一起在末尾 save。purpose 必须
      // 显式写——TypeORM 列默认值只在 INSERT 时生效，签 token 在 save 之前会读到
      // undefined，让 CloudClientAuthGuard 一律 401。
      session = this.sessionRepo.create({
        phone: normalizedPhone,
        code: normalizedCode,
        purpose: CLOUD_CLIENT_ACCESS_TOKEN_PURPOSE,
        expiresAt: new Date(Date.now() + this.getCodeTtlSeconds() * 1000),
        verifiedAt: null,
      });
    } else {
      const found = await this.sessionRepo.findOne({
        where: {
          phone: normalizedPhone,
          code: normalizedCode,
        },
        order: {
          createdAt: "DESC",
        },
      });

      if (!found) {
        throw new UnauthorizedException("验证码错误。");
      }

      if (found.verifiedAt) {
        throw new UnauthorizedException("该验证码已使用。");
      }

      if (found.expiresAt.getTime() < Date.now()) {
        throw new UnauthorizedException("验证码已过期。");
      }

      session = found;
    }

    const existingUser = await this.userRepo.findOne({
      where: { phone: normalizedPhone },
    });
    if (existingUser && existingUser.status !== "active") {
      throw new ForbiddenException(
        existingUser.status === "banned"
          ? "This cloud account has been banned."
          : "This cloud account has been archived.",
      );
    }

    // setPasswordOnRegister 在这里做"硬校验"，让超 72 字节的 emoji 密码、
    // 跟 phone 相同的弱密等直接 400 给客户端。否则 hook 里那段 try/catch
    // 会吞掉 BadRequestException，客户端看到 200 + accessToken 以为密码已设
    // 上，下一次走 login-with-password 就 401，体验灾难。
    if (extras?.setPasswordOnRegister) {
      assertPasswordStrength(extras.setPasswordOnRegister, [normalizedPhone]);
    }

    if (this.userPostVerifyHook) {
      try {
        await this.userPostVerifyHook(normalizedPhone, extras ?? {});
      } catch (error) {
        // ensureUser 不应阻塞登录，记录日志由调用方处理
      }
    }

    const accessToken = await this.jwtService.signAsync(
      {
        sid: session.id,
        phone: normalizedPhone,
        purpose: session.purpose,
      },
      {
        expiresIn: resolveCloudAuthTokenTtl(this.configService) as never,
        issuer: resolveCloudJwtIssuer(this.configService),
        audience: resolveCloudClientJwtAudience(this.configService),
        subject: normalizedPhone,
      },
    );
    const expiresAt = new Date(Date.now() + this.getTokenTtlMs()).toISOString();

    // token 已签发，最后一步才把 session 标记成已用。dev bypass 的 in-memory
    // session 这里第一次落库；普通路径走 update。
    session.verifiedAt = new Date();
    await this.sessionRepo.save(session);

    return {
      accessToken,
      phone: normalizedPhone,
      expiresAt,
    };
  }

  private userPostVerifyHook:
    | ((phone: string, extras: { inviteCode?: string | null; deviceFingerprint?: string | null; ip?: string | null; userAgent?: string | null; clientPlatform?: string | null; setPasswordOnRegister?: string | null }) => Promise<void>)
    | null = null;

  registerPostVerifyHook(
    hook: (
      phone: string,
      extras: { inviteCode?: string | null; deviceFingerprint?: string | null; ip?: string | null; userAgent?: string | null; clientPlatform?: string | null; setPasswordOnRegister?: string | null },
    ) => Promise<void>,
  ) {
    this.userPostVerifyHook = hook;
  }

  normalizePhone(phone: string) {
    const normalized = phone.trim().replace(/\s+/g, "");
    if (!/^\+?[0-9]{6,20}$/.test(normalized)) {
      throw new BadRequestException("手机号格式不正确。");
    }

    return normalized;
  }

  private generateCode() {
    return `${Math.floor(100000 + Math.random() * 900000)}`;
  }

  private getCodeTtlSeconds() {
    return this.parsePositiveInteger(this.configService.get<string>("CLOUD_CODE_TTL_SECONDS"), 600);
  }

  private getTokenTtlMs() {
    const configured = this.configService.get<string>("CLOUD_AUTH_TOKEN_TTL_MS");
    const asNumber = configured ? Number(configured) : Number.NaN;
    if (Number.isFinite(asNumber) && asNumber > 0) {
      return asNumber;
    }

    const parsedTtl = parseJwtDurationToMs(
      resolveCloudAuthTokenTtl(this.configService),
    );
    if (parsedTtl && parsedTtl > 0) {
      return parsedTtl;
    }

    return 7 * 24 * 60 * 60 * 1000;
  }

  private async enforceSendCodeRateLimit(phone: string) {
    const cooldownSeconds = this.parsePositiveInteger(
      this.configService.get<string>("CLOUD_CODE_RESEND_COOLDOWN_SECONDS"),
      60,
    );
    const windowSeconds = this.parsePositiveInteger(
      this.configService.get<string>("CLOUD_CODE_RATE_LIMIT_WINDOW_SECONDS"),
      60 * 60,
    );
    const maxCodesPerWindow = this.parsePositiveInteger(
      this.configService.get<string>("CLOUD_CODE_MAX_PER_WINDOW"),
      5,
    );

    const latestSession = await this.sessionRepo.findOne({
      where: { phone },
      order: {
        createdAt: "DESC",
      },
    });
    if (latestSession) {
      const retryAfterSeconds = cooldownSeconds - Math.floor((Date.now() - latestSession.createdAt.getTime()) / 1000);
      if (retryAfterSeconds > 0) {
        throw new HttpException(`验证码发送过于频繁，请在 ${retryAfterSeconds} 秒后重试。`, HttpStatus.TOO_MANY_REQUESTS);
      }
    }

    const recentWindowStart = new Date(Date.now() - windowSeconds * 1000);
    const recentCount = await this.sessionRepo.count({
      where: {
        phone,
        createdAt: MoreThan(recentWindowStart),
      },
    });
    if (recentCount >= maxCodesPerWindow) {
      throw new HttpException("该手机号验证码请求次数过多，请稍后再试。", HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private parsePositiveInteger(rawValue: string | undefined, fallback: number) {
    const parsed = Number(rawValue ?? "");
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }

    return Math.floor(parsed);
  }
}
// i18n-ignore-end
