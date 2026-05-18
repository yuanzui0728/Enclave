import { HttpStatus, Injectable } from '@nestjs/common';
import { AppError } from '../../common/app-error.exception';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { MailService } from '../mail/mail.service';
import type { AuthSession, AuthUserPayload } from './auth.service';
import { EmailVerificationSessionEntity } from './email-verification-session.entity';
import { UserEntity } from './user.entity';
import { WelcomeMessageService } from './welcome-message.service';

// i18n-ignore-start: data / seed / preset content — not user-facing UI.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type EmailCodePurpose = 'login' | 'change_password';

export type SendEmailCodeResult = {
  email: string;
  expiresAt: string;
  debugCode: string | null;
};

@Injectable()
export class EmailAuthService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(EmailVerificationSessionEntity)
    private readonly sessionRepo: Repository<EmailVerificationSessionEntity>,
    private readonly mail: MailService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly welcomeMessageService: WelcomeMessageService,
  ) {}

  async sendCode(
    email: string,
    purpose: EmailCodePurpose = 'login',
  ): Promise<SendEmailCodeResult> {
    const normalized = this.normalizeEmail(email);
    await this.enforceSendCodeRateLimit(normalized, purpose);

    const existing = await this.userRepo.findOne({
      where: { email: normalized },
    });
    const isNewUser = !existing;

    // 同一邮箱发新码时，把所有未使用的旧码立刻 expire 掉 —— 否则旧 code 在 TTL（默认 10 分钟）
    // 内仍能通过 verifyCode（按 email+code 精确匹配，命中即放行），泄漏一次 = 攻击窗口 10 分钟。
    // 不能 delete：enforceSendCodeRateLimit 的 cooldown 要靠最近一条 session.createdAt 算，
    // delete 掉历史就能被无限重发绕过。改 expiresAt 既作废 code，又保留 cooldown 历史。
    // 按 purpose 隔离，避免改密码流程把刚发的登录码作废（或反过来）。
    await this.sessionRepo.update(
      { email: normalized, purpose, verifiedAt: IsNull() },
      { expiresAt: new Date(Date.now() - 1) },
    );

    const code = this.generateCode();
    const expiresAt = new Date(Date.now() + this.getCodeTtlSeconds() * 1000);
    const session = this.sessionRepo.create({
      email: normalized,
      code,
      purpose,
      expiresAt,
      verifiedAt: null,
    });
    await this.sessionRepo.save(session);

    let result: Awaited<ReturnType<MailService['sendVerificationCode']>>;
    try {
      result = await this.mail.sendVerificationCode(normalized, code, isNewUser);
    } catch (error) {
      await this.sessionRepo.delete({ id: session.id });
      throw error;
    }

    return {
      email: normalized,
      expiresAt: expiresAt.toISOString(),
      debugCode: result.debugCode,
    };
  }

  async verifyCode(email: string, code: string): Promise<AuthSession> {
    const normalized = this.normalizeEmail(email);
    const session = await this.lookupActiveSession(normalized, code, 'login');
    session.verifiedAt = new Date();
    await this.sessionRepo.save(session);

    const user = await this.findOrCreateUserByEmail(normalized);
    return this.buildSession(user);
  }

  /**
   * 校验一条 purpose 对应的验证码但**不**立即标记 verifiedAt——留给业务层在最终动作
   * （如真正写入新密码）成功后再调 markCodeUsed，避免"码已验但业务失败"导致码白用。
   */
  async verifyCodeForPurpose(
    email: string,
    code: string,
    purpose: EmailCodePurpose,
  ): Promise<EmailVerificationSessionEntity> {
    const normalized = this.normalizeEmail(email);
    return this.lookupActiveSession(normalized, code, purpose);
  }

  async markCodeUsed(sessionId: string): Promise<void> {
    await this.sessionRepo.update({ id: sessionId }, { verifiedAt: new Date() });
  }

  private async lookupActiveSession(
    email: string,
    code: string,
    purpose: EmailCodePurpose,
  ): Promise<EmailVerificationSessionEntity> {
    const trimmedCode = (code ?? '').trim();
    if (!trimmedCode) {
      throw new AppError('AUTH_CODE_REQUIRED', {
        legacyMessage: '验证码不能为空。',
      });
    }
    const session = await this.sessionRepo.findOne({
      where: { email, code: trimmedCode, purpose },
      order: { createdAt: 'DESC' },
    });
    if (!session) {
      throw new AppError('AUTH_CODE_INVALID', {
        status: HttpStatus.UNAUTHORIZED,
        legacyMessage: '验证码错误。',
      });
    }
    if (session.verifiedAt) {
      throw new AppError('AUTH_CODE_USED', {
        status: HttpStatus.UNAUTHORIZED,
        legacyMessage: '该验证码已使用。',
      });
    }
    if (session.expiresAt.getTime() < Date.now()) {
      throw new AppError('AUTH_CODE_EXPIRED', {
        status: HttpStatus.UNAUTHORIZED,
        legacyMessage: '验证码已过期。',
      });
    }
    return session;
  }

  private async findOrCreateUserByEmail(email: string): Promise<UserEntity> {
    const existing = await this.userRepo.findOne({ where: { email } });
    if (existing) {
      if (!existing.emailVerifiedAt) {
        existing.emailVerifiedAt = new Date();
        await this.userRepo.save(existing);
      }
      return existing;
    }

    const username = await this.generateUniqueUsernameFromEmail(email);
    const adminCount = await this.userRepo.count({ where: { role: 'admin' } });
    const bootstrapAsAdmin = adminCount === 0;

    const user = this.userRepo.create({
      username,
      email,
      emailVerifiedAt: new Date(),
      passwordHash: null,
      onboardingCompleted: false,
      avatar: '',
      signature: '',
      customApiKey: null,
      customApiBase: null,
      defaultChatBackgroundPayload: null,
      userType: 'wiki_member',
      role: bootstrapAsAdmin ? 'admin' : 'newcomer',
      roleGrantedAt: bootstrapAsAdmin ? new Date() : null,
      roleGrantedBy: bootstrapAsAdmin ? 'first_wiki_member_bootstrap' : null,
    });
    const saved = await this.userRepo.save(user);
    await this.welcomeMessageService.sendWelcomeMessage(saved.id);
    return saved;
  }

  private async generateUniqueUsernameFromEmail(email: string): Promise<string> {
    const base = (email.split('@')[0] ?? 'user')
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 24) || 'user';

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const suffix = randomBytes(2).toString('hex');
      const candidate = `${base}_${suffix}`;
      const collision = await this.userRepo.findOne({
        where: { username: candidate },
      });
      if (!collision) return candidate;
    }
    return `${base}_${randomBytes(4).toString('hex')}`;
  }

  private buildSession(user: UserEntity): Promise<AuthSession> {
    const payload: AuthUserPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      userType: user.userType,
    };
    return this.jwt
      .signAsync(payload, {
        secret: this.resolveJwtSecret(),
        expiresIn: '30d',
      })
      .then((token) => ({
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          userType: user.userType,
          avatar: user.avatar,
        },
      }));
  }

  private resolveJwtSecret(): string {
    const secret = this.config.get<string>('JWT_SECRET');
    if (!secret) {
      throw new AppError('AUTH_JWT_SECRET_MISSING', {
        status: HttpStatus.UNAUTHORIZED,
        legacyMessage: '服务器未配置 JWT_SECRET',
      });
    }
    return secret;
  }

  private async enforceSendCodeRateLimit(
    email: string,
    purpose: EmailCodePurpose,
  ): Promise<void> {
    const cooldown = this.parsePositiveInteger(
      this.config.get<string>('EMAIL_CODE_RESEND_COOLDOWN_SECONDS'),
      60,
    );
    const window = this.parsePositiveInteger(
      this.config.get<string>('EMAIL_CODE_RATE_LIMIT_WINDOW_SECONDS'),
      3600,
    );
    const max = this.parsePositiveInteger(
      this.config.get<string>('EMAIL_CODE_MAX_PER_WINDOW'),
      5,
    );

    // 限频按 (email, purpose) 分别计算 —— 改密码和登录的码不互相挤占额度。
    const latest = await this.sessionRepo.findOne({
      where: { email, purpose },
      order: { createdAt: 'DESC' },
    });
    if (latest) {
      const retryAfter =
        cooldown - Math.floor((Date.now() - latest.createdAt.getTime()) / 1000);
      if (retryAfter > 0) {
        throw new AppError('AUTH_CODE_RESEND_TOO_FAST', {
          status: HttpStatus.TOO_MANY_REQUESTS,
          params: { retryAfter },
          legacyMessage: `验证码发送过于频繁，请在 ${retryAfter} 秒后重试。`,
        });
      }
    }

    const since = new Date(Date.now() - window * 1000);
    const count = await this.sessionRepo.count({
      where: { email, purpose, createdAt: MoreThan(since) },
    });
    if (count >= max) {
      throw new AppError('AUTH_CODE_TOO_MANY', {
        status: HttpStatus.TOO_MANY_REQUESTS,
        legacyMessage: '该邮箱验证码请求次数过多，请稍后再试。',
      });
    }
  }

  private getCodeTtlSeconds(): number {
    return this.parsePositiveInteger(
      this.config.get<string>('EMAIL_CODE_TTL_SECONDS'),
      600,
    );
  }

  private generateCode(): string {
    return `${Math.floor(100000 + Math.random() * 900000)}`;
  }

  private normalizeEmail(raw: string): string {
    const trimmed = (raw ?? '').trim().toLowerCase();
    if (!trimmed || !EMAIL_PATTERN.test(trimmed) || trimmed.length > 254) {
      throw new AppError('AUTH_EMAIL_INVALID', {
        legacyMessage: '邮箱格式不正确。',
      });
    }
    return trimmed;
  }

  private parsePositiveInteger(raw: string | undefined, fallback: number) {
    const parsed = Number(raw ?? '');
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.floor(parsed);
  }
}
// i18n-ignore-end
