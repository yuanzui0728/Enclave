import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { EmailAuthService } from './email-auth.service';
import { EmailVerificationSessionEntity } from './email-verification-session.entity';
import { JwtAuthGuard } from './jwt-auth.guard';
import { MailModule } from '../mail/mail.module';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard';
import { UserEntity } from './user.entity';
import { WorldOwnerService } from './world-owner.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([UserEntity, EmailVerificationSessionEntity]),
    MailModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') ?? 'yinjie-dev-secret',
        signOptions: { expiresIn: '30d' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    WorldOwnerService,
    AuthService,
    EmailAuthService,
    JwtAuthGuard,
    OptionalJwtAuthGuard,
  ],
  exports: [
    WorldOwnerService,
    AuthService,
    EmailAuthService,
    JwtAuthGuard,
    OptionalJwtAuthGuard,
    JwtModule,
  ],
})
export class AuthModule {}
