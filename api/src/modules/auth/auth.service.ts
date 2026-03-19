import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UserEntity } from './user.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private userRepo: Repository<UserEntity>,
    private jwtService: JwtService,
  ) {}

  async register(username: string, password: string) {
    const existing = await this.userRepo.findOneBy({ username });
    if (existing) throw new ConflictException('用户名已存在');

    const passwordHash = await bcrypt.hash(password, 10);
    const user = this.userRepo.create({ username, passwordHash, onboardingCompleted: true });
    await this.userRepo.save(user);

    const token = this.jwtService.sign({ sub: user.id, username: user.username });
    return { token, userId: user.id, username: user.username, onboardingCompleted: user.onboardingCompleted };
  }

  async login(username: string, password: string) {
    const user = await this.userRepo.findOneBy({ username });
    if (!user) throw new UnauthorizedException('用户名或密码错误');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('用户名或密码错误');

    const token = this.jwtService.sign({ sub: user.id, username: user.username });
    return { token, userId: user.id, username: user.username, onboardingCompleted: user.onboardingCompleted };
  }

  // Onboarding: create user with just a name (no password required)
  async initUser(username: string) {
    let user = await this.userRepo.findOneBy({ username });
    if (user) {
      // Return existing user token (re-entry)
      const token = this.jwtService.sign({ sub: user.id, username: user.username });
      return { token, userId: user.id, username: user.username, onboardingCompleted: user.onboardingCompleted };
    }

    const passwordHash = await bcrypt.hash(`onboarding_${Date.now()}`, 10);
    user = this.userRepo.create({ username, passwordHash, onboardingCompleted: false });
    await this.userRepo.save(user);

    const token = this.jwtService.sign({ sub: user.id, username: user.username });
    return { token, userId: user.id, username: user.username, onboardingCompleted: false };
  }

  async completeOnboarding(userId: string) {
    await this.userRepo.update(userId, { onboardingCompleted: true });
    return { success: true };
  }

  async updateUser(userId: string, data: { username?: string; avatar?: string; signature?: string }) {
    await this.userRepo.update(userId, data);
    return { success: true };
  }
}
