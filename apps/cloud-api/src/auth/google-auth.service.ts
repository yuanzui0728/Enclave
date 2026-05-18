// i18n-ignore-start: data / seed / preset content — not user-facing UI.
import {
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import type { VerifyGoogleIdTokenResponse } from "@yinjie/contracts";
import { OAuth2Client, type TokenPayload } from "google-auth-library";
import { randomUUID } from "node:crypto";
import { Repository } from "typeorm";
import { resolveGoogleOAuthClientId } from "../config/cloud-runtime-config";
import { CloudUserOAuthIdentityEntity } from "../entities/cloud-user-oauth-identity.entity";
import { CloudUserEntity } from "../entities/cloud-user.entity";
import { IpRegionService } from "../users/ip-region.service";
import { issueCloudClientAccessToken } from "./cloud-client-token";
import { classifyDeviceType } from "./device-type";
import { synthesizePhoneFromEmail } from "./email-auth.service";

export type GoogleVerifyExtras = {
  inviteCode?: string | null;
  deviceFingerprint?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  clientPlatform?: string | null;
};

const GOOGLE_PROVIDER = "google";

@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);
  private cachedClient: OAuth2Client | null = null;
  private cachedClientId: string | null = null;
  private postVerifyHook:
    | ((
        profile: GoogleVerifiedProfile,
        synthPhone: string,
        extras: GoogleVerifyExtras,
      ) => Promise<CloudUserEntity>)
    | null = null;

  constructor(
    @InjectRepository(CloudUserEntity)
    private readonly userRepo: Repository<CloudUserEntity>,
    @InjectRepository(CloudUserOAuthIdentityEntity)
    private readonly identityRepo: Repository<CloudUserOAuthIdentityEntity>,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly ipRegion: IpRegionService,
  ) {}

  registerPostVerifyHook(
    hook: (
      profile: GoogleVerifiedProfile,
      synthPhone: string,
      extras: GoogleVerifyExtras,
    ) => Promise<CloudUserEntity>,
  ) {
    this.postVerifyHook = hook;
  }

  async verifyIdToken(
    rawIdToken: string,
    extras: GoogleVerifyExtras = {},
  ): Promise<VerifyGoogleIdTokenResponse> {
    const clientId = resolveGoogleOAuthClientId(this.configService);
    if (!clientId) {
      throw new ServiceUnavailableException(
        "Google 登录尚未配置，请联系管理员开启。",
      );
    }

    const payload = await this.verifyAgainstGoogle(rawIdToken, clientId);

    if (!payload.email || !payload.sub) {
      throw new UnauthorizedException("Google 身份信息不完整。");
    }
    if (payload.email_verified !== true) {
      throw new UnauthorizedException(
        "该 Google 邮箱未验证，请改用邮箱验证码登录。",
      );
    }

    const normalizedEmail = payload.email.trim().toLowerCase();
    const profile: GoogleVerifiedProfile = {
      sub: payload.sub,
      email: normalizedEmail,
      emailVerified: true,
      displayName: payload.name ?? null,
      avatarUrl: payload.picture ?? null,
      rawProfile: payload,
    };

    const synthPhone = synthesizePhoneFromEmail(normalizedEmail);

    let user: CloudUserEntity | null = null;
    if (this.postVerifyHook) {
      try {
        user = await this.postVerifyHook(profile, synthPhone, extras);
      } catch (error) {
        if (error instanceof ForbiddenException) throw error;
        this.logger.warn(
          `ensureUserByGoogle hook failed for sub=${profile.sub}: ${(error as Error).message}`,
        );
      }
    }

    if (!user) {
      // Fallback：hook 未注册或抛错时仍尽力查找/创建本地身份，保证登录链路不断。
      // 把 extras 透传过去，让 fallback 也能写 device / region — 否则
      // hook 偶发失败时这次登录会丢掉这两项数据。
      user = await this.fallbackEnsureUser(profile, synthPhone, extras);
    }

    if (user.status !== "active") {
      throw new ForbiddenException(
        user.status === "banned"
          ? "This cloud account has been banned."
          : "This cloud account has been archived.",
      );
    }

    const sessionId = randomUUID();
    const { accessToken, expiresAt } = await issueCloudClientAccessToken({
      jwtService: this.jwtService,
      configService: this.configService,
      sessionId,
      synthPhone,
      email: normalizedEmail,
    });

    return {
      accessToken,
      email: normalizedEmail,
      expiresAt,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
    };
  }

  private async verifyAgainstGoogle(
    rawIdToken: string,
    audience: string,
  ): Promise<TokenPayload> {
    const client = this.getOrCreateClient(audience);
    let ticket;
    try {
      ticket = await client.verifyIdToken({ idToken: rawIdToken, audience });
    } catch (error) {
      throw new UnauthorizedException(
        `Google ID Token 验签失败：${(error as Error).message}`,
      );
    }
    const payload = ticket.getPayload();
    if (!payload) {
      throw new UnauthorizedException("Google ID Token 无 payload。");
    }
    return payload;
  }

  private getOrCreateClient(clientId: string): OAuth2Client {
    if (this.cachedClient && this.cachedClientId === clientId) {
      return this.cachedClient;
    }
    this.cachedClient = new OAuth2Client(clientId);
    this.cachedClientId = clientId;
    return this.cachedClient;
  }

  private async fallbackEnsureUser(
    profile: GoogleVerifiedProfile,
    synthPhone: string,
    extras: GoogleVerifyExtras = {},
  ): Promise<CloudUserEntity> {
    const now = new Date();
    const device = classifyDeviceType(extras.clientPlatform, extras.userAgent);
    let user = await this.userRepo.findOne({ where: { email: profile.email } });
    if (!user) {
      user = this.userRepo.create({
        phone: synthPhone,
        email: profile.email,
        emailVerifiedAt: now,
        displayName: profile.displayName,
        firstLoginAt: now,
        lastLoginAt: now,
        registrationIp: extras.ip ?? null,
        lastLoginIp: extras.ip ?? null,
        lastLoginDeviceType: device,
      });
      user = await this.userRepo.save(user);
    } else {
      user.lastLoginAt = now;
      if (extras.ip) user.lastLoginIp = extras.ip;
      if (!user.phone) user.phone = synthPhone;
      if (!user.emailVerifiedAt) user.emailVerifiedAt = now;
      if (!user.displayName && profile.displayName) {
        user.displayName = profile.displayName;
      }
      if (device) user.lastLoginDeviceType = device;
      user = await this.userRepo.save(user);
    }
    await this.upsertIdentity(user.id, profile);
    // Region 走异步：fallback 路径已经偏离正常流，IpRegion 5s × 2 provider 阻塞
    // 不值。fire-and-forget 让登录响应立返，几百 ms 后 UPDATE 写入。
    if (extras.ip) {
      void this.resolveAndUpdateLastLoginRegion(user.id, extras.ip);
    }
    return user;
  }

  // 把 lastLoginRegion / lastLoginCountryCode 的解析挪到登录响应之后异步执行。
  // 7d 缓存命中 ≈ 零延迟；未命中 5s × 2 provider 也不挡用户。解析失败保留旧值。
  private async resolveAndUpdateLastLoginRegion(userId: string, ip: string) {
    try {
      const lookup = await this.ipRegion.resolve(ip);
      const patch: Partial<CloudUserEntity> = {};
      if (lookup.region) patch.lastLoginRegion = lookup.region;
      if (lookup.countryCode) patch.lastLoginCountryCode = lookup.countryCode;
      if (Object.keys(patch).length > 0) {
        await this.userRepo.update(userId, patch);
      }
    } catch (error) {
      this.logger.warn(
        `lastLoginRegion async resolve failed for user=${userId} ip=${ip}: ${(error as Error).message}`,
      );
    }
  }

  async upsertIdentity(userId: string, profile: GoogleVerifiedProfile) {
    const now = new Date();
    let identity = await this.identityRepo.findOne({
      where: { provider: GOOGLE_PROVIDER, providerSubject: profile.sub },
    });
    if (!identity) {
      identity = this.identityRepo.create({
        userId,
        provider: GOOGLE_PROVIDER,
        providerSubject: profile.sub,
        providerEmail: profile.email,
        emailVerified: profile.emailVerified,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        rawProfile: JSON.stringify(profile.rawProfile ?? null),
        linkedAt: now,
        lastLoginAt: now,
      });
    } else {
      identity.userId = userId;
      identity.providerEmail = profile.email;
      identity.emailVerified = profile.emailVerified;
      identity.displayName = profile.displayName;
      identity.avatarUrl = profile.avatarUrl;
      identity.rawProfile = JSON.stringify(profile.rawProfile ?? null);
      identity.lastLoginAt = now;
    }
    await this.identityRepo.save(identity);
    return identity;
  }
}

export type GoogleVerifiedProfile = {
  sub: string;
  email: string;
  emailVerified: boolean;
  displayName: string | null;
  avatarUrl: string | null;
  rawProfile: TokenPayload;
};
// i18n-ignore-end
