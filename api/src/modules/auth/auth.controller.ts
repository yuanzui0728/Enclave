import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { EmailAuthService } from './email-auth.service';
import { JwtAuthGuard, type AuthenticatedUser } from './jwt-auth.guard';

// 非字符串入参（如 {"a":1} / [b]）走到 service 后会触发 (x ?? '').trim() →
// "trim is not a function" → 500，把原始 stack trace 漏出去。controller 层强制
// 把每个字段归一成 string，service 内部就只需关心空 / 长度 / 内容。
function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly emailAuth: EmailAuthService,
  ) {}

  @Post('register')
  register(@Body() body?: Record<string, unknown>) {
    return this.auth.register(
      asString(body?.username),
      asString(body?.password),
    );
  }

  @Post('login')
  login(@Body() body?: Record<string, unknown>) {
    return this.auth.login(
      asString(body?.username),
      asString(body?.password),
    );
  }

  @Post('email/send-code')
  sendEmailCode(@Body() body?: Record<string, unknown>) {
    return this.emailAuth.sendCode(asString(body?.email));
  }

  @Post('email/verify-code')
  verifyEmailCode(@Body() body?: Record<string, unknown>) {
    return this.emailAuth.verifyCode(asString(body?.email), asString(body?.code));
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.getProfile(user.id);
  }

  @Post('username/change')
  @UseGuards(JwtAuthGuard)
  changeUsername(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body?: Record<string, unknown>,
  ) {
    return this.auth.changeUsername(user.id, asString(body?.username));
  }

  @Post('password/send-code')
  @UseGuards(JwtAuthGuard)
  sendChangePasswordCode(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.sendChangePasswordCode(user.id);
  }

  @Post('password/change')
  @UseGuards(JwtAuthGuard)
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body?: Record<string, unknown>,
  ) {
    return this.auth.changePassword(
      user.id,
      asString(body?.code),
      asString(body?.newPassword),
    );
  }
}
