import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AppError } from '../../common/app-error.exception';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { SocksClient } from 'socks';

// i18n-ignore-start: data / seed / preset content — not user-facing UI.
export type SendVerificationCodeResult = {
  delivered: boolean;
  debugCode: string | null;
};

// 海外邮箱白名单：命中走海外通道，否则走默认（国内）通道。
// 与 apps/cloud-api/src/auth/cloud-mail.service.ts 的 OVERSEAS_EMAIL_DOMAINS 保持一致 ——
// QQ/163 等国内邮箱对 Gmail 个人账号反垃圾极严，silently drop 率 ~50%；
// 阿里云国际版 IP 池对国内邮箱投递率好，但海外邮箱反过来也会嫌"国内出海邮件 + 中文品牌名"
// 是垃圾。所以两边各走各的，wiki 的注册/登录邮件也得这么发。
const OVERSEAS_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'outlook.jp',
  'hotmail.com',
  'hotmail.co.jp',
  'live.com',
  'msn.com',
  'yahoo.com',
  'yahoo.co.jp',
  'yahoo.co.uk',
  'ymail.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'pm.me',
  'fastmail.com',
  'fastmail.fm',
  'yandex.com',
  'yandex.ru',
  'mail.ru',
  'hey.com',
  'duck.com',
  'tutanota.com',
  'tuta.io',
  'naver.com',
  'kakao.com',
  'daum.net',
]);

type MailRoute = 'overseas' | 'domestic';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private domesticTransporter: Transporter | null = null;
  private overseasTransporter: Transporter | null = null;
  private domesticReady = false;
  private overseasReady = false;

  constructor(private readonly config: ConfigService) {}

  async sendVerificationCode(
    email: string,
    code: string,
    isNewUser: boolean,
  ): Promise<SendVerificationCodeResult> {
    const requestedRoute = this.pickRoute(email);
    const domain = this.extractDomain(email);
    const channel = this.resolveChannel(requestedRoute);
    if (!channel) {
      this.logger.log(
        `[Mock] Email verification code for ${email} (domain=${domain}, requested=${requestedRoute}): ${code}`,
      );
      return { delivered: false, debugCode: code };
    }

    const { transporter, route, fromAddress, fromName } = channel;
    const from = fromAddress ? `${fromName} <${fromAddress}>` : fromName;

    const { subject, text, html } = this.buildLoginMail(code, isNewUser);

    this.logger.log(
      `Sending verification code to ${email} via ${route}` +
        (route !== requestedRoute ? ` (fallback from ${requestedRoute})` : '') +
        ` (domain=${domain}, from=${fromAddress ?? fromName})`,
    );

    try {
      await transporter.sendMail({ from, to: email, subject, text, html });
    } catch (error) {
      this.logger.error(
        `Email send failed to ${email} via ${route} (domain=${domain}): ${(error as Error).message}`,
      );
      throw new AppError('MAIL_CODE_SEND_FAILED', {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        legacyMessage: '邮件验证码发送失败，请稍后重试。',
      });
    }

    return { delivered: true, debugCode: null };
  }

  private pickRoute(email: string): MailRoute {
    const domain = this.extractDomain(email);
    return OVERSEAS_EMAIL_DOMAINS.has(domain) ? 'overseas' : 'domestic';
  }

  private extractDomain(email: string): string {
    const at = (email ?? '').lastIndexOf('@');
    if (at < 0) return '';
    return email.slice(at + 1).trim().toLowerCase();
  }

  private buildLoginMail(
    code: string,
    isNewUser: boolean,
  ): { subject: string; text: string; html: string } {
    if (isNewUser) {
      const subject = '【隐界】欢迎来到隐界';
      const text = [
        '看到你来了。',
        '',
        '用这串数字进来就好：',
        '',
        code,
        '',
        '10 分钟内有效。',
        '如果不是你本人在操作，把这封信忘掉就行，我们什么都不会发生。',
        '',
        '—— 隐界，一直都在',
      ].join('\n');
      const html = `
        <div style="font-family: -apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif; line-height:1.8; color:#1f2937;">
          <p style="margin:0 0 16px;">看到你来了。</p>
          <p style="margin:0 0 8px;">用这串数字进来就好：</p>
          <p style="font-size:28px; letter-spacing:6px; font-weight:600; color:#1d4ed8; margin:12px 0 20px;">${code}</p>
          <p style="color:#6b7280; font-size:13px; margin:0 0 4px;">10 分钟内有效。</p>
          <p style="color:#6b7280; font-size:13px; margin:0 0 24px;">如果不是你本人在操作，把这封信忘掉就行，我们什么都不会发生。</p>
          <p style="color:#6b7280; font-size:13px; margin:0;">—— 隐界，一直都在</p>
        </div>
      `.trim();
      return { subject, text, html };
    }

    const subject = '【隐界】你回来了';
    const text = [
      '你回来了。',
      '',
      '用这串数字继续：',
      '',
      code,
      '',
      '10 分钟内有效。',
      '如果不是你本人在操作，把这封信忘掉就行。',
      '',
      '—— 隐界，一直都在',
    ].join('\n');
    const html = `
      <div style="font-family: -apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif; line-height:1.8; color:#1f2937;">
        <p style="margin:0 0 16px;">你回来了。</p>
        <p style="margin:0 0 8px;">用这串数字继续：</p>
        <p style="font-size:28px; letter-spacing:6px; font-weight:600; color:#1d4ed8; margin:12px 0 20px;">${code}</p>
        <p style="color:#6b7280; font-size:13px; margin:0 0 4px;">10 分钟内有效。</p>
        <p style="color:#6b7280; font-size:13px; margin:0 0 24px;">如果不是你本人在操作，把这封信忘掉就行。</p>
        <p style="color:#6b7280; font-size:13px; margin:0;">—— 隐界，一直都在</p>
      </div>
    `.trim();
    return { subject, text, html };
  }

  // transporter 与 from 一起返回，避免出现 transporter 是 A、from 写 B 的 envelope
  // mismatch —— 阿里云 DirectMail 强制 from 必须是已验证发信地址，不一致直接 5.7.0
  // 拒收。选哪个通道就用哪个通道的 from。
  private resolveChannel(route: MailRoute): {
    transporter: Transporter;
    route: MailRoute;
    fromAddress: string | undefined;
    fromName: string;
  } | null {
    if (route === 'overseas') {
      if (!this.overseasReady) {
        this.overseasTransporter = this.buildTransporter('OVERSEAS_');
        this.overseasReady = true;
        if (!this.overseasTransporter) {
          this.logger.warn(
            'SMTP_OVERSEAS_HOST 未配置，海外邮箱将回落到国内通道发送。',
          );
        }
      }
      if (this.overseasTransporter) {
        return {
          transporter: this.overseasTransporter,
          route: 'overseas',
          fromAddress:
            this.readEnv('MAIL_OVERSEAS_FROM_ADDRESS') ??
            this.readEnv('MAIL_FROM_ADDRESS'),
          fromName:
            this.readEnv('MAIL_OVERSEAS_FROM_NAME') ??
            this.readEnv('MAIL_FROM_NAME') ??
            '隐界 Yinjie',
        };
      }
      // fall through to domestic
    }
    if (!this.domesticReady) {
      this.domesticTransporter = this.buildTransporter('');
      this.domesticReady = true;
      if (!this.domesticTransporter) {
        this.logger.warn(
          'SMTP_HOST 未配置，邮件发送进入 mock 模式（仅打印验证码到日志）。',
        );
      }
    }
    if (!this.domesticTransporter) return null;
    return {
      transporter: this.domesticTransporter,
      route: 'domestic',
      fromAddress: this.readEnv('MAIL_FROM_ADDRESS'),
      fromName: this.readEnv('MAIL_FROM_NAME') ?? '隐界 Yinjie',
    };
  }

  // 把空字符串和未配置都当作"未配置"，避免 env 里写 `MAIL_FROM_NAME=`
  // 导致 ?? fallback 不触发、from 头变成 " <addr>" 的尴尬。
  private readEnv(key: string): string | undefined {
    const raw = this.config.get<string>(key);
    if (raw === undefined || raw === null) return undefined;
    const trimmed = raw.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }

  private buildTransporter(prefix: string): Transporter | null {
    const host = this.readEnv(`SMTP_${prefix}HOST`);
    if (!host) return null;
    const portRaw = this.readEnv(`SMTP_${prefix}PORT`);
    const port = portRaw ? Number(portRaw) : 465;
    const secureRaw = this.readEnv(`SMTP_${prefix}SECURE`);
    // 默认 secure=true（465 端口），仅当显式写 "false" 才关。
    const secure = secureRaw !== 'false';
    const user = this.readEnv(`SMTP_${prefix}USER`);
    const pass = this.readEnv(`SMTP_${prefix}PASS`);
    const proxy = this.readEnv(`SMTP_${prefix}PROXY`);

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
      ...(proxy ? { proxy } : {}),
    });
    if (proxy) {
      // nodemailer 需要显式注入 socks 客户端模块以解析 socks 代理
      transporter.set('proxy_socks_module', { SocksClient });
    }
    return transporter;
  }
}
// i18n-ignore-end
