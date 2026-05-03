import {
  BadRequestException,
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
import { MockSmsProviderService } from "./mock-sms-provider.service";
import { PhoneVerificationSessionEntity } from "../entities/phone-verification-session.entity";

@Injectable()
export class PhoneAuthService {
  constructor(
    @InjectRepository(PhoneVerificationSessionEntity)
    private readonly sessionRepo: Repository<PhoneVerificationSessionEntity>,
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
    },
  ): Promise<VerifyPhoneCodeResponse> {
    const normalizedPhone = this.normalizePhone(phone);
    const normalizedCode = code.trim();

    if (!normalizedCode) {
      throw new BadRequestException("验证码不能为空。");
    }

    const session = await this.sessionRepo.findOne({
      where: {
        phone: normalizedPhone,
        code: normalizedCode,
      },
      order: {
        createdAt: "DESC",
      },
    });

    if (!session) {
      throw new UnauthorizedException("验证码错误。");
    }

    if (session.verifiedAt) {
      throw new UnauthorizedException("该验证码已使用。");
    }

    if (session.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException("验证码已过期。");
    }

    session.verifiedAt = new Date();
    await this.sessionRepo.save(session);

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

    return {
      accessToken,
      phone: normalizedPhone,
      expiresAt,
    };
  }

  private userPostVerifyHook:
    | ((phone: string, extras: { inviteCode?: string | null; deviceFingerprint?: string | null; ip?: string | null }) => Promise<void>)
    | null = null;

  registerPostVerifyHook(
    hook: (
      phone: string,
      extras: { inviteCode?: string | null; deviceFingerprint?: string | null; ip?: string | null },
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
