import { HttpStatus, Injectable } from '@nestjs/common';
import { AppError } from '../../common/app-error.exception';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { EmailAuthService } from './email-auth.service';
import { UserEntity } from './user.entity';
import { WelcomeMessageService } from './welcome-message.service';

// i18n-ignore-start: data / seed / preset content — not user-facing UI.
export type AuthUserPayload = {
  sub: string;
  username: string;
  role: string;
  userType: string;
};

export type AuthSession = {
  token: string;
  user: {
    id: string;
    username: string;
    role: string;
    userType: string;
    avatar?: string;
  };
};

export type AuthProfile = {
  id: string;
  username: string;
  role: string;
  userType: string;
  avatar?: string;
  email: string | null;
  emailVerifiedAt: string | null;
  hasPassword: boolean;
};

const MIN_PASSWORD_LENGTH = 6;
const MIN_USERNAME_LENGTH = 2;
const MAX_USERNAME_LENGTH = 32;

// trim() 只剥常规空白，不剥零宽字符 (U+200B-U+200D / U+FEFF / U+2060 等)
// 与各种 unicode 空格。register/changeUsername 不挡的话用户能注册成纯
// 零宽账号 (e.g. U+200B U+200C)，admin 列表渲染显示空白行无法点击
// (跟 wiki.types.ts 的 isNameVisuallyEmpty 同一类问题)。
//
// 注意：regex 字符类里直接放真实 U+2028 (LINE SEPARATOR) 会让 tsc 编译
// 出来的 .js 在该位置真换行，导致 SyntaxError。所以这里用 \u 转义。
const VISUAL_BLANK_USERNAME_REGEX =
  /[\s\u00a0\u2000-\u200d\u2028-\u202f\u205f\u3000\ufeff\u2060]/g;

function isUsernameVisuallyEmpty(raw: string): boolean {
  return raw.replace(VISUAL_BLANK_USERNAME_REGEX, '').length === 0;
}
// bcrypt 只看密码的前 72 字节，超出部分静默丢弃 —— UTF-8 中文一字 3 字节，
// 25 个汉字密码就触顶。允许更长 → 用户以为换了密码，实际只有前 72 字节生效，
// 两段不同密码可能哈希一致；以及超长 payload 做 hash 还是个轻量 DoS。
// 注册 / 改密时按字节卡死；登录不卡（历史用户的旧 hash 不破）。
const MAX_PASSWORD_BYTES = 72;

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly welcomeMessageService: WelcomeMessageService,
    private readonly emailAuth: EmailAuthService,
  ) {}

  async register(username: unknown, password: unknown): Promise<AuthSession> {
    // typeof 守：入参可能是 undefined / null / 对象 / 数组（前端漏传 / 直接
    // POST {"username":{"a":1}} 时 (x ?? '').trim() 抛 TypeError → 500。
    // 非字符串当空字符串处理，下面的"用户名与密码不能为空"会接住。
    const trimmed = typeof username === 'string' ? username.trim() : '';
    const rawPassword = typeof password === 'string' ? password : '';
    if (!trimmed || !rawPassword) {
      throw new AppError('AUTH_USERNAME_PASSWORD_REQUIRED', {
        status: HttpStatus.BAD_REQUEST,
        legacyMessage: '用户名与密码不能为空',
      });
    }
    if (trimmed.length < MIN_USERNAME_LENGTH) {
      throw new AppError('AUTH_USERNAME_TOO_SHORT', {
        status: HttpStatus.BAD_REQUEST,
        params: { min: MIN_USERNAME_LENGTH },
        legacyMessage: `用户名至少 ${MIN_USERNAME_LENGTH} 个字符。`,
      });
    }
    if (trimmed.length > MAX_USERNAME_LENGTH) {
      throw new AppError('AUTH_USERNAME_TOO_LONG', {
        status: HttpStatus.BAD_REQUEST,
        params: { max: MAX_USERNAME_LENGTH },
        legacyMessage: `用户名不能超过 ${MAX_USERNAME_LENGTH} 个字符。`,
      });
    }
    if (rawPassword.length < MIN_PASSWORD_LENGTH) {
      throw new AppError('AUTH_PASSWORD_TOO_SHORT', {
        status: HttpStatus.BAD_REQUEST,
        params: { min: MIN_PASSWORD_LENGTH },
        legacyMessage: `密码至少 ${MIN_PASSWORD_LENGTH} 位。`,
      });
    }
    if (Buffer.byteLength(rawPassword, 'utf8') > MAX_PASSWORD_BYTES) {
      throw new AppError('AUTH_PASSWORD_TOO_LONG', {
        status: HttpStatus.BAD_REQUEST,
        params: { max: MAX_PASSWORD_BYTES },
        legacyMessage: `密码过长（最多 ${MAX_PASSWORD_BYTES} 字节，中文等多字节字符按字节计）。`,
      });
    }
    // 跟 changeUsername 同样的字符约束：login 用是否含 @ 来判邮箱 vs 用户名，
    // 注册时不挡的话用户能注册成 "foo@bar"，之后用任何方式都登不上
    // （永远走 email 分支查不到自己），只能找 admin 改库。
    if (trimmed.includes('@')) {
      throw new AppError('AUTH_USERNAME_INVALID_CHAR', {
        status: HttpStatus.BAD_REQUEST,
        legacyMessage: '用户名不能包含 @ 字符',
      });
    }
    if (isUsernameVisuallyEmpty(trimmed)) {
      throw new AppError('AUTH_USERNAME_INVALID_CHAR', {
        status: HttpStatus.BAD_REQUEST,
        legacyMessage: '用户名不能只由空白或零宽字符组成',
      });
    }
    const exists = await this.userRepo.findOne({ where: { username: trimmed } });
    if (exists) {
      throw new AppError('AUTH_USERNAME_TAKEN', {
        status: HttpStatus.CONFLICT,
        legacyMessage: '用户名已被占用',
      });
    }

    const passwordHash = await bcrypt.hash(rawPassword, 10);
    const adminCount = await this.userRepo.count({ where: { role: 'admin' } });
    const bootstrapAsAdmin = adminCount === 0;
    const user = this.userRepo.create({
      username: trimmed,
      passwordHash,
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
    return this.buildSession(saved);
  }

  async login(username: unknown, password: unknown): Promise<AuthSession> {
    // typeof 守：入参可能是 undefined / null / 对象 / 数组（直接 POST
    // {"username":{"a":1}} 时 (x ?? '').trim() 抛 TypeError → 500 漏 stack）。
    // 非字符串当空字符串处理，下面的 AUTH_INVALID_CREDENTIALS 会接住。
    const trimmed = typeof username === 'string' ? username.trim() : '';
    const rawPassword = typeof password === 'string' ? password : '';
    if (!trimmed || !rawPassword) {
      throw new AppError('AUTH_INVALID_CREDENTIALS', {
        status: HttpStatus.UNAUTHORIZED,
        legacyMessage: '账号或密码错误',
      });
    }
    // 带 @ 视为邮箱，按 email 查；否则按 username 查。
    // username 是大小写敏感的，但 email 用户大概率会输大小写混合（手机键盘
    // 自动大写首字母），落库时 email 是从邮箱验证流程进来的小写形式，所以
    // email 分支统一 toLowerCase 一次。
    const isEmail = trimmed.includes('@');
    const user = isEmail
      ? await this.userRepo.findOne({
          where: { email: trimmed.toLowerCase() },
        })
      : await this.userRepo.findOne({ where: { username: trimmed } });
    if (!user) {
      throw new AppError('AUTH_INVALID_CREDENTIALS', {
        status: HttpStatus.UNAUTHORIZED,
        legacyMessage: '账号或密码错误',
      });
    }
    if (!user.passwordHash) {
      throw new AppError('AUTH_EMAIL_LOGIN_ONLY', {
        status: HttpStatus.UNAUTHORIZED,
        legacyMessage: '该账号通过邮箱验证码注册，请使用邮箱验证码登录。',
      });
    }
    const ok = await bcrypt.compare(rawPassword, user.passwordHash);
    if (!ok) {
      throw new AppError('AUTH_INVALID_CREDENTIALS', {
        status: HttpStatus.UNAUTHORIZED,
        legacyMessage: '账号或密码错误',
      });
    }
    return this.buildSession(user);
  }

  async findById(id: string): Promise<UserEntity | null> {
    return this.userRepo.findOne({ where: { id } });
  }

  async getProfile(userId: string): Promise<AuthProfile> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new AppError('AUTH_USER_NOT_FOUND', {
        status: HttpStatus.UNAUTHORIZED,
        legacyMessage: '用户不存在',
      });
    }
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      userType: user.userType,
      avatar: user.avatar,
      email: user.email ?? null,
      emailVerifiedAt: user.emailVerifiedAt
        ? user.emailVerifiedAt.toISOString()
        : null,
      hasPassword: Boolean(user.passwordHash),
    };
  }

  async changeUsername(
    userId: string,
    newUsername: unknown,
  ): Promise<AuthSession> {
    const trimmed = typeof newUsername === 'string' ? newUsername.trim() : '';
    if (!trimmed) {
      throw new AppError('AUTH_USERNAME_REQUIRED', {
        status: HttpStatus.BAD_REQUEST,
        legacyMessage: '用户名不能为空',
      });
    }
    if (trimmed.length < MIN_USERNAME_LENGTH) {
      throw new AppError('AUTH_USERNAME_TOO_SHORT', {
        status: HttpStatus.BAD_REQUEST,
        params: { min: MIN_USERNAME_LENGTH },
        legacyMessage: `用户名至少 ${MIN_USERNAME_LENGTH} 个字符。`,
      });
    }
    if (trimmed.length > MAX_USERNAME_LENGTH) {
      throw new AppError('AUTH_USERNAME_TOO_LONG', {
        status: HttpStatus.BAD_REQUEST,
        params: { max: MAX_USERNAME_LENGTH },
        legacyMessage: `用户名不能超过 ${MAX_USERNAME_LENGTH} 个字符。`,
      });
    }
    // 禁止 @：login 用是否含 @ 来判邮箱 vs 用户名，带 @ 的 username 会让自己
    // 登不上（永远走 email 分支查不到）。同样禁开头 / 末尾空白和控制字符。
    if (trimmed.includes('@')) {
      throw new AppError('AUTH_USERNAME_INVALID_CHAR', {
        status: HttpStatus.BAD_REQUEST,
        legacyMessage: '用户名不能包含 @ 字符',
      });
    }
    if (isUsernameVisuallyEmpty(trimmed)) {
      throw new AppError('AUTH_USERNAME_INVALID_CHAR', {
        status: HttpStatus.BAD_REQUEST,
        legacyMessage: '用户名不能只由空白或零宽字符组成',
      });
    }
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new AppError('AUTH_USER_NOT_FOUND', {
        status: HttpStatus.UNAUTHORIZED,
        legacyMessage: '用户不存在',
      });
    }
    if (user.username === trimmed) {
      // 没改，直接重发一个 session（旧 token 里 username 已经是这个，无需失效）
      return this.buildSession(user);
    }
    const collision = await this.userRepo.findOne({
      where: { username: trimmed },
    });
    if (collision && collision.id !== userId) {
      throw new AppError('AUTH_USERNAME_TAKEN', {
        status: HttpStatus.CONFLICT,
        legacyMessage: '用户名已被占用',
      });
    }
    user.username = trimmed;
    await this.userRepo.save(user);
    // JWT 里嵌了 username，改名后旧 token 显示的还是旧名 —— 直接重签一个返给
    // 前端，前端覆盖 localStorage 即可。
    return this.buildSession(user);
  }

  async sendChangePasswordCode(userId: string) {
    const user = await this.requireUserWithEmail(userId);
    return this.emailAuth.sendCode(user.email!, 'change_password');
  }

  async changePassword(
    userId: string,
    code: string,
    newPassword: string,
  ): Promise<{ ok: true }> {
    const user = await this.requireUserWithEmail(userId);
    // 不 trim：前导/尾随空白本身就是合法密码字符，trim 会让 "abc " 和 "abc" 在登录时
    // 表现一致但落库不一致——用户下次输 "abc " 反而登不上去。
    const password = newPassword ?? '';
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new AppError('AUTH_PASSWORD_TOO_SHORT', {
        status: HttpStatus.BAD_REQUEST,
        params: { min: MIN_PASSWORD_LENGTH },
        legacyMessage: `新密码至少 ${MIN_PASSWORD_LENGTH} 位。`,
      });
    }
    if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
      throw new AppError('AUTH_PASSWORD_TOO_LONG', {
        status: HttpStatus.BAD_REQUEST,
        params: { max: MAX_PASSWORD_BYTES },
        legacyMessage: `新密码过长（最多 ${MAX_PASSWORD_BYTES} 字节，中文等多字节字符按字节计）。`,
      });
    }

    const session = await this.emailAuth.verifyCodeForPurpose(
      user.email!,
      code,
      'change_password',
    );

    user.passwordHash = await bcrypt.hash(password, 10);
    await this.userRepo.save(user);
    await this.emailAuth.markCodeUsed(session.id);
    return { ok: true };
  }

  async verifyToken(token: string): Promise<AuthUserPayload> {
    return this.jwt.verifyAsync<AuthUserPayload>(token, {
      secret: this.resolveSecret(),
    });
  }

  resolveSecret(): string {
    const secret = this.config.get<string>('JWT_SECRET');
    if (!secret) {
      throw new AppError('AUTH_JWT_SECRET_MISSING', {
        status: HttpStatus.UNAUTHORIZED,
        legacyMessage: '服务器未配置 JWT_SECRET',
      });
    }
    return secret;
  }

  private async requireUserWithEmail(userId: string): Promise<UserEntity> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new AppError('AUTH_USER_NOT_FOUND', {
        status: HttpStatus.UNAUTHORIZED,
        legacyMessage: '用户不存在',
      });
    }
    if (!user.email) {
      throw new AppError('AUTH_NO_EMAIL_BOUND', {
        status: HttpStatus.BAD_REQUEST,
        legacyMessage: '当前账号尚未绑定邮箱，无法通过邮箱验证码修改密码。',
      });
    }
    return user;
  }

  private async buildSession(user: UserEntity): Promise<AuthSession> {
    const payload: AuthUserPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
      userType: user.userType,
    };
    const token = await this.jwt.signAsync(payload, {
      secret: this.resolveSecret(),
      expiresIn: '30d',
    });
    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        userType: user.userType,
        avatar: user.avatar,
      },
    };
  }
}
// i18n-ignore-end
