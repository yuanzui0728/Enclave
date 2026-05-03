import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { UserEntity } from './user.entity';

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

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(username: string, password: string): Promise<AuthSession> {
    const trimmed = username.trim();
    if (!trimmed || !password) {
      throw new UnauthorizedException('用户名与密码不能为空');
    }
    const exists = await this.userRepo.findOne({ where: { username: trimmed } });
    if (exists) throw new ConflictException('用户名已被占用');

    const passwordHash = await bcrypt.hash(password, 10);
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
      role: 'newcomer',
    });
    const saved = await this.userRepo.save(user);
    return this.buildSession(saved);
  }

  async login(username: string, password: string): Promise<AuthSession> {
    const trimmed = username.trim();
    const user = await this.userRepo.findOne({ where: { username: trimmed } });
    if (!user) throw new UnauthorizedException('账号或密码错误');
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('账号或密码错误');
    return this.buildSession(user);
  }

  async findById(id: string): Promise<UserEntity | null> {
    return this.userRepo.findOne({ where: { id } });
  }

  async verifyToken(token: string): Promise<AuthUserPayload> {
    return this.jwt.verifyAsync<AuthUserPayload>(token, {
      secret: this.resolveSecret(),
    });
  }

  resolveSecret(): string {
    const secret = this.config.get<string>('JWT_SECRET');
    if (!secret) {
      throw new UnauthorizedException('服务器未配置 JWT_SECRET');
    }
    return secret;
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
