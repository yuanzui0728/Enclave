import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import type { SendPhoneCodeResponse, VerifyPhoneCodeResponse } from "@yinjie/contracts";
import { Repository } from "typeorm";
import { MockSmsProviderService } from "./mock-sms-provider.service";
import { PhoneVerificationSessionEntity } from "../entities/phone-verification-session.entity";

@Injectable()
export class PhoneAuthService {
  constructor(
    @InjectRepository(PhoneVerificationSessionEntity)
    private readonly sessionRepo: Repository<PhoneVerificationSessionEntity>,
    private readonly jwtService: JwtService,
    private readonly smsProvider: MockSmsProviderService,
  ) {}

  async sendCode(phone: string): Promise<SendPhoneCodeResponse> {
    const normalizedPhone = this.normalizePhone(phone);
    const code = this.generateCode();
    const expiresAt = new Date(Date.now() + this.getCodeTtlSeconds() * 1000);

    const session = this.sessionRepo.create({
      phone: normalizedPhone,
      code,
      expiresAt,
      verifiedAt: null,
    });
    await this.sessionRepo.save(session);
    const providerResult = await this.smsProvider.sendCode(normalizedPhone, code);

    return {
      phone: normalizedPhone,
      expiresAt: expiresAt.toISOString(),
      debugCode: providerResult.debugCode ?? null,
    };
  }

  async verifyCode(phone: string, code: string): Promise<VerifyPhoneCodeResponse> {
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

    const accessToken = await this.jwtService.signAsync({
      sid: session.id,
      phone: normalizedPhone,
      purpose: session.purpose,
    });
    const expiresAt = new Date(Date.now() + this.getTokenTtlMs()).toISOString();

    return {
      accessToken,
      phone: normalizedPhone,
      expiresAt,
    };
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
    const configured = Number(process.env.CLOUD_CODE_TTL_SECONDS ?? 600);
    return Number.isFinite(configured) && configured > 0 ? configured : 600;
  }

  private getTokenTtlMs() {
    const configured = process.env.CLOUD_AUTH_TOKEN_TTL_MS;
    const asNumber = configured ? Number(configured) : Number.NaN;
    if (Number.isFinite(asNumber) && asNumber > 0) {
      return asNumber;
    }

    return 7 * 24 * 60 * 60 * 1000;
  }
}
