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
    const user = this.userRepo.create({ username, passwordHash });
    await this.userRepo.save(user);

    const token = this.jwtService.sign({ sub: user.id, username: user.username });
    return { token, userId: user.id, username: user.username };
  }

  async login(username: string, password: string) {
    const user = await this.userRepo.findOneBy({ username });
    if (!user) throw new UnauthorizedException('用户名或密码错误');

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('用户名或密码错误');

    const token = this.jwtService.sign({ sub: user.id, username: user.username });
    return { token, userId: user.id, username: user.username };
  }
}
