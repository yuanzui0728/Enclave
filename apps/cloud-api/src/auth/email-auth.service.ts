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
import type {
  SendChangePasswordCodeResponse,
  SendEmailCodeResponse,
  VerifyEmailCodeResponse,
} from "@yinjie/contracts";
import { MoreThan, Repository } from "typeorm";
import { createHash } from "node:crypto";
import { CloudUserEntity } from "../entities/cloud-user.entity";
import { EmailVerificationSessionEntity } from "../entities/email-verification-session.entity";
import { issueCloudClientAccessToken } from "./cloud-client-token";
import { CloudMailService } from "./cloud-mail.service";
import { assertPasswordStrength } from "./password-policy";

const DEV_BYPASS_CODE = "123456";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 邮箱用户的合成手机号：前缀 "9" + email sha256 前 16 位转十进制截 13 位，纯数字共 14 位。
// 与真实手机号不会冲突（各国个人手机号几乎不以 9 开头作完整号码段），且对同一邮箱稳定。
export function synthesizePhoneFromEmail(email: string): string {
  const hash = createHash("sha256").update(email).digest("hex");
  const num = BigInt("0x" + hash.slice(0, 16)).toString().padStart(13, "0");
  return "9" + num.slice(0, 13);
}

export type EmailVerifyExtras = {
  inviteCode?: string | null;
  deviceFingerprint?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  clientPlatform?: string | null;
  setPasswordOnRegister?: string | null;
};

@Injectable()
export class EmailAuthService {
  constructor(
    @InjectRepository(EmailVerificationSessionEntity)
    private readonly sessionRepo: Repository<EmailVerificationSessionEntity>,
    @InjectRepository(CloudUserEntity)
    private readonly userRepo: Repository<CloudUserEntity>,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly mailService: CloudMailService,
  ) {}

  async sendCode(email: string): Promise<SendEmailCodeResponse> {
    const normalized = this.normalizeEmail(email);
    await this.enforceSendCodeRateLimit(normalized, "world_access");

    const existing = await this.userRepo.findOne({
      where: { email: normalized },
    });
    const isNewUser = !existing;

    const code = this.generateCode();
    const expiresAt = new Date(Date.now() + this.getCodeTtlSeconds() * 1000);

    const session = this.sessionRepo.create({
      email: normalized,
      code,
      purpose: "world_access",
      expiresAt,
      verifiedAt: null,
    });
    await this.sessionRepo.save(session);

    let result: Awaited<ReturnType<CloudMailService["sendVerificationCode"]>>;
    try {
      result = await this.mailService.sendVerificationCode(
        normalized,
        code,
        isNewUser,
      );
    } catch (error) {
      await this.sessionRepo.delete({ id: session.id });
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException("邮件验证码发送失败，请稍后重试。");
    }

    return {
      email: normalized,
      expiresAt: expiresAt.toISOString(),
      debugCode: result.debugCode ?? null,
    };
  }

  async verifyCode(
    email: string,
    code: string,
    extras?: EmailVerifyExtras,
  ): Promise<VerifyEmailCodeResponse> {
    const normalized = this.normalizeEmail(email);
    const trimmedCode = (code ?? "").trim();
    if (!trimmedCode) {
      throw new BadRequestException("验证码不能为空。");
    }

    // 先**只读校验** session 状态，不写 verifiedAt；等下面 hook + 签 token 全部
    // 成功后再 markSessionUsed 作废，避免「校验通过但下游操作失败」时码被白白消费。
    let session: EmailVerificationSessionEntity;

    if (trimmedCode === DEV_BYPASS_CODE) {
      // dev bypass 不查库；直接 in-memory 构造一条「待写入」session，等末尾跟其他
      // 路径走同一条 markSessionUsed 路径写库。
      session = this.sessionRepo.create({
        email: normalized,
        code: trimmedCode,
        purpose: "world_access",
        expiresAt: new Date(Date.now() + this.getCodeTtlSeconds() * 1000),
        verifiedAt: null,
      });
    } else {
      const found = await this.sessionRepo.findOne({
        where: {
          email: normalized,
          code: trimmedCode,
          purpose: "world_access",
        },
        order: { createdAt: "DESC" },
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
      where: { email: normalized },
    });
    if (existingUser && existingUser.status !== "active") {
      throw new ForbiddenException(
        existingUser.status === "banned"
          ? "This cloud account has been banned."
          : "This cloud account has been archived.",
      );
    }

    const synthPhone = synthesizePhoneFromEmail(normalized);

    // setPasswordOnRegister 在这里硬校验（72 字节 / 跟身份相同 / 含空格），不让
    // hook 里那段 try/catch 把 BadRequest 吞掉、客户端误以为密码已设。
    if (extras?.setPasswordOnRegister) {
      assertPasswordStrength(extras.setPasswordOnRegister, [normalized, synthPhone]);
    }

    if (this.userPostVerifyHook) {
      try {
        await this.userPostVerifyHook(normalized, synthPhone, extras ?? {});
      } catch {
        // ensureUser 不应阻塞登录
      }
    }

    // 邮箱用户在云端用合成 phone 作为身份标识，CloudClientAuthGuard 与下游 by-phone 查询都能命中。
    const tokenResult = await issueCloudClientAccessToken({
      jwtService: this.jwtService,
      configService: this.configService,
      sessionId: session.id,
      synthPhone,
      email: normalized,
    });

    // 所有副作用都完成、token 已签发，最后一步才把 session 标记成已用。
    // dev bypass 的 in-memory session 这里第一次落库；普通路径走 update。
    session.verifiedAt = new Date();
    await this.sessionRepo.save(session);

    return {
      accessToken: tokenResult.accessToken,
      email: normalized,
      expiresAt: tokenResult.expiresAt,
    };
  }

  private userPostVerifyHook:
    | ((
        email: string,
        synthPhone: string,
        extras: EmailVerifyExtras,
      ) => Promise<void>)
    | null = null;

  registerPostVerifyHook(
    hook: (
      email: string,
      synthPhone: string,
      extras: EmailVerifyExtras,
    ) => Promise<void>,
  ) {
    this.userPostVerifyHook = hook;
  }

  normalizeEmail(email: string) {
    const normalized = (email ?? "").trim().toLowerCase();
    if (!normalized || !EMAIL_PATTERN.test(normalized) || normalized.length > 254) {
      throw new BadRequestException("邮箱格式不正确。");
    }
    return normalized;
  }

  private generateCode() {
    return `${Math.floor(100000 + Math.random() * 900000)}`;
  }

  private getCodeTtlSeconds() {
    return this.parsePositiveInteger(
      this.configService.get<string>("CLOUD_EMAIL_CODE_TTL_SECONDS") ??
        this.configService.get<string>("CLOUD_CODE_TTL_SECONDS"),
      600,
    );
  }

  private async enforceSendCodeRateLimit(email: string, purpose: string) {
    const cooldownSeconds = this.parsePositiveInteger(
      this.configService.get<string>("CLOUD_EMAIL_CODE_RESEND_COOLDOWN_SECONDS") ??
        this.configService.get<string>("CLOUD_CODE_RESEND_COOLDOWN_SECONDS"),
      60,
    );
    const windowSeconds = this.parsePositiveInteger(
      this.configService.get<string>("CLOUD_EMAIL_CODE_RATE_LIMIT_WINDOW_SECONDS") ??
        this.configService.get<string>("CLOUD_CODE_RATE_LIMIT_WINDOW_SECONDS"),
      60 * 60,
    );
    const maxPerWindow = this.parsePositiveInteger(
      this.configService.get<string>("CLOUD_EMAIL_CODE_MAX_PER_WINDOW") ??
        this.configService.get<string>("CLOUD_CODE_MAX_PER_WINDOW"),
      5,
    );

    const latest = await this.sessionRepo.findOne({
      where: { email, purpose },
      order: { createdAt: "DESC" },
    });
    if (latest) {
      const retryAfter =
        cooldownSeconds -
        Math.floor((Date.now() - latest.createdAt.getTime()) / 1000);
      if (retryAfter > 0) {
        throw new HttpException(
          `验证码发送过于频繁，请在 ${retryAfter} 秒后重试。`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    const since = new Date(Date.now() - windowSeconds * 1000);
    const count = await this.sessionRepo.count({
      where: { email, purpose, createdAt: MoreThan(since) },
    });
    if (count >= maxPerWindow) {
      throw new HttpException(
        "该邮箱验证码请求次数过多，请稍后再试。",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  // 改密码场景的发码：要求邮箱必须是已有用户的绑定邮箱（避免「枚举注册邮箱」），
  // 与 world_access 通道分开走限流计数器，互不影响。
  async sendChangePasswordCode(
    email: string,
  ): Promise<SendChangePasswordCodeResponse> {
    const normalized = this.normalizeEmail(email);

    const user = await this.userRepo.findOne({
      where: { email: normalized },
    });
    if (!user) {
      // 不区分「邮箱未注册」和「未绑定」对外报同样错，避免枚举。
      throw new BadRequestException("邮箱与当前账号不匹配。");
    }

    await this.enforceSendCodeRateLimit(normalized, "change_password");

    const code = this.generateCode();
    const expiresAt = new Date(Date.now() + this.getCodeTtlSeconds() * 1000);
    const session = this.sessionRepo.create({
      email: normalized,
      code,
      purpose: "change_password",
      expiresAt,
      verifiedAt: null,
    });
    await this.sessionRepo.save(session);

    let result: Awaited<ReturnType<CloudMailService["sendVerificationCode"]>>;
    try {
      result = await this.mailService.sendVerificationCode(
        normalized,
        code,
        false,
      );
    } catch (error) {
      await this.sessionRepo.delete({ id: session.id });
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException("邮件验证码发送失败，请稍后重试。");
    }

    return {
      email: normalized,
      expiresAt: expiresAt.toISOString(),
      debugCode: result.debugCode ?? null,
    };
  }

  // 改密码场景的「**只读**校验」：检查验证码 + 用户状态，但**不**写 verifiedAt。
  // 与 verifyCode 不同：**故意不接受** DEV_BYPASS_CODE，改密码必须凭真实邮箱
  // 验证码，避免「拿到任意账号 token + 默认码 123456」就能改密的攻击面。
  //
  // 调用方流程：validateChangePasswordCode → 完成密码强度校验 + 写新 hash →
  // 最后调 markChangePasswordCodeUsed 作废 code。这样如果密码强度校验失败、
  // hash 写库失败，code 仍可被同一用户重试使用，不会让用户被迫再发一遍码。
  async validateChangePasswordCode(
    email: string,
    code: string,
  ): Promise<{
    email: string;
    user: CloudUserEntity;
    session: EmailVerificationSessionEntity;
  }> {
    const normalized = this.normalizeEmail(email);
    const trimmedCode = (code ?? "").trim();
    if (!trimmedCode) {
      throw new BadRequestException("验证码不能为空。");
    }

    const session = await this.sessionRepo.findOne({
      where: {
        email: normalized,
        code: trimmedCode,
        purpose: "change_password",
      },
      order: { createdAt: "DESC" },
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

    const user = await this.userRepo.findOne({
      where: { email: normalized },
    });
    if (!user) {
      throw new BadRequestException("邮箱与当前账号不匹配。");
    }
    if (user.status !== "active") {
      throw new ForbiddenException(
        user.status === "banned"
          ? "This cloud account has been banned."
          : "This cloud account has been archived.",
      );
    }

    return { email: normalized, user, session };
  }

  // 真正作废一条 change_password 验证码 session。调用方在所有副作用（密码写库
  // 等）都成功后才调用，避免「码废了但操作失败」的尴尬。
  async markChangePasswordCodeUsed(sessionId: string): Promise<void> {
    await this.sessionRepo.update(
      { id: sessionId },
      { verifiedAt: new Date() },
    );
  }

  private parsePositiveInteger(rawValue: string | undefined, fallback: number) {
    const parsed = Number(rawValue ?? "");
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.floor(parsed);
  }
}
// i18n-ignore-end
