// i18n-ignore-start: data / seed / preset content — not user-facing UI.
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import type {
  ChangePasswordResponse,
  LoginWithPasswordResponse,
} from "@yinjie/contracts";
import { MoreThan, Repository } from "typeorm";
import { CloudLoginAttemptEntity } from "../entities/cloud-login-attempt.entity";
import { CloudUserEntity } from "../entities/cloud-user.entity";
import { IpRegionService } from "../users/ip-region.service";
import { issueCloudClientAccessToken } from "./cloud-client-token";
import { classifyDeviceType } from "./device-type";
import { EmailAuthService, synthesizePhoneFromEmail } from "./email-auth.service";
import {
  assertPasswordStrength,
  hashPassword,
  verifyPassword,
} from "./password-policy";

const FAILED_ATTEMPT_WINDOW_SECONDS = 5 * 60;
const FAILED_ATTEMPT_MAX = 5;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type LoginWithPasswordExtras = {
  ip?: string | null;
  userAgent?: string | null;
  clientPlatform?: string | null;
};

@Injectable()
export class PasswordAuthService {
  constructor(
    @InjectRepository(CloudUserEntity)
    private readonly userRepo: Repository<CloudUserEntity>,
    @InjectRepository(CloudLoginAttemptEntity)
    private readonly attemptRepo: Repository<CloudLoginAttemptEntity>,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly emailAuth: EmailAuthService,
    private readonly ipRegionService: IpRegionService,
  ) {}

  async loginWithPassword(
    identifierKind: "phone" | "email",
    identifier: string,
    password: string,
    extras: LoginWithPasswordExtras = {},
  ): Promise<LoginWithPasswordResponse> {
    const normalized = this.normalizeIdentifier(identifierKind, identifier);
    await this.enforceFailedAttemptLockout(normalized, extras.ip ?? null);

    const user = await this.userRepo.findOne({
      where:
        identifierKind === "phone"
          ? { phone: normalized }
          : { email: normalized },
    });

    // 「用户不存在」「用户没设密码」「密码不对」三类失败一律走相同分支：
    // (1) 跑一次 verifyPassword 平衡耗时，防 timing 枚举；
    // (2) 对外统一报「密码错误」，不暴露邮箱/手机是否已注册。
    if (!user || !user.passwordHash || user.status !== "active") {
      await verifyPassword(password, user?.passwordHash ?? null);
      await this.recordAttempt(identifierKind, normalized, extras.ip ?? null, false);
      throw new UnauthorizedException("密码错误，请重试。");
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      await this.recordAttempt(identifierKind, normalized, extras.ip ?? null, false);
      throw new UnauthorizedException("密码错误，请重试。");
    }

    await this.recordAttempt(identifierKind, normalized, extras.ip ?? null, true);

    const now = new Date();
    user.lastLoginAt = now;
    if (extras.ip) user.lastLoginIp = extras.ip;
    const device = classifyDeviceType(extras.clientPlatform, extras.userAgent);
    if (device) user.lastLoginDeviceType = device;
    if (extras.ip) {
      // IpRegionService 内部 5s 超时 + 7d 缓存命中后零延迟；解析失败保留旧值。
      try {
        const region = await this.ipRegionService.resolve(extras.ip);
        if (region.region) user.lastLoginRegion = region.region;
        if (region.countryCode) user.lastLoginCountryCode = region.countryCode;
      } catch {
        // 忽略解析失败，不阻塞登录。
      }
    }
    await this.userRepo.save(user);

    const synthPhone = user.phone
      ? user.phone
      : user.email
        ? synthesizePhoneFromEmail(user.email)
        : null;
    if (!synthPhone) {
      // 异常数据：active user 既无 phone 也无 email。理论上 ensureUser 总会写其一，
      // 这里硬拦避免签出空身份的 token（如果走默认 fallback 会把多个空账号映射到同一 synth phone）。
      throw new ForbiddenException("This account is missing an identifier.");
    }
    // 密码登录场景没有验证码 session，用 user.id 作为 sid 标识此次登录（与 phone-auth/email-auth
    // 的 session.id 同样是一次性 token 标识，下游 token-refresh 不依赖该 sid 在 verification_sessions 表里存在）。
    const { accessToken, expiresAt } = await issueCloudClientAccessToken({
      jwtService: this.jwtService,
      configService: this.configService,
      sessionId: `pwd:${user.id}:${now.getTime()}`,
      synthPhone,
      email: user.email ?? null,
    });

    return {
      accessToken,
      phone: synthPhone,
      email: user.email ?? null,
      expiresAt,
    };
  }

  async changePassword(
    userId: string,
    code: string,
    newPassword: string,
  ): Promise<ChangePasswordResponse> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException("登录已失效，请重新登录。");
    }
    if (!user.email) {
      throw new BadRequestException("修改密码需要先绑定邮箱。");
    }

    // 先只读校验 code，不消费——这样后续密码强度校验/写库失败时码仍可重用。
    const { user: confirmedUser, session } =
      await this.emailAuth.validateChangePasswordCode(user.email, code);

    if (confirmedUser.id !== user.id) {
      // 邮箱对应的 user 与当前 token 的 user 不一致：防止有人手工拼接接口越权。
      throw new ForbiddenException("邮箱与当前账号不匹配。");
    }

    const valid = assertPasswordStrength(newPassword, [user.email, user.phone]);
    user.passwordHash = await hashPassword(valid);
    user.passwordUpdatedAt = new Date();
    await this.userRepo.save(user);

    // 密码写库成功后才作废验证码。
    await this.emailAuth.markChangePasswordCodeUsed(session.id);

    return {
      ok: true,
      passwordUpdatedAt: user.passwordUpdatedAt.toISOString(),
    };
  }

  private normalizeIdentifier(
    kind: "phone" | "email",
    raw: string,
  ): string {
    const value = (raw ?? "").trim();
    if (!value) {
      throw new BadRequestException(
        kind === "phone" ? "手机号格式不正确。" : "邮箱格式不正确。",
      );
    }
    if (kind === "phone") {
      const compact = value.replace(/\s+/g, "");
      if (!/^\+?[0-9]{6,20}$/.test(compact)) {
        throw new BadRequestException("手机号格式不正确。");
      }
      return compact;
    }
    const lowered = value.toLowerCase();
    if (!EMAIL_PATTERN.test(lowered) || lowered.length > 254) {
      throw new BadRequestException("邮箱格式不正确。");
    }
    return lowered;
  }

  private async enforceFailedAttemptLockout(
    identifierValue: string,
    clientIp: string | null,
  ) {
    const since = new Date(Date.now() - FAILED_ATTEMPT_WINDOW_SECONDS * 1000);
    const count = await this.attemptRepo.count({
      where: {
        identifierValue,
        succeeded: false,
        createdAt: MoreThan(since),
      },
    });
    if (count >= FAILED_ATTEMPT_MAX) {
      throw new HttpException(
        "连续多次错误，账号已暂时锁定，请稍后再试。",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (clientIp) {
      const ipCount = await this.attemptRepo.count({
        where: {
          clientIp,
          succeeded: false,
          createdAt: MoreThan(since),
        },
      });
      // 单 IP 维度允许稍宽松一点，避免共享出口 NAT 误伤；这里翻倍。
      if (ipCount >= FAILED_ATTEMPT_MAX * 2) {
        throw new HttpException(
          "连续多次错误，请稍后再试。",
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
  }

  private async recordAttempt(
    identifierKind: "phone" | "email",
    identifierValue: string,
    clientIp: string | null,
    succeeded: boolean,
  ) {
    try {
      const attempt = this.attemptRepo.create({
        identifierKind,
        identifierValue,
        clientIp,
        succeeded,
      });
      await this.attemptRepo.save(attempt);
    } catch {
      // attempt 表写入失败不阻塞主流程。
    }
  }
}
// i18n-ignore-end
