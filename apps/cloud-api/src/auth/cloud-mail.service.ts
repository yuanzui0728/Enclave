import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { SocksClient } from "socks";
import { MockEmailProviderService } from "./mock-email-provider.service";

// 海外邮箱白名单：命中走 Gmail，否则走阿里云 DirectMail。
// QQ/163 等国内邮箱对 Gmail 个人账号反垃圾极严，silently drop 率 ~50%；
// 阿里云国际版 IP 池对国内邮箱投递率好，但海外（gmail/outlook/yahoo 等）反过来
// 也会嫌"国内出海邮件 + 中文品牌名"是垃圾。所以两边各走各的。
const OVERSEAS_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "outlook.jp",
  "hotmail.com",
  "hotmail.co.jp",
  "live.com",
  "msn.com",
  "yahoo.com",
  "yahoo.co.jp",
  "yahoo.co.uk",
  "ymail.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "pm.me",
  "fastmail.com",
  "fastmail.fm",
  "yandex.com",
  "yandex.ru",
  "mail.ru",
  "hey.com",
  "duck.com",
  "tutanota.com",
  "tuta.io",
  "naver.com",
  "kakao.com",
  "daum.net",
]);

type MailRoute = "overseas" | "domestic";

// i18n-ignore-start: data / seed / preset content — not user-facing UI.
@Injectable()
export class CloudMailService {
  private readonly logger = new Logger(CloudMailService.name);
  private domesticTransporter: Transporter | null = null;
  private overseasTransporter: Transporter | null = null;
  private domesticReady = false;
  private overseasReady = false;

  constructor(
    private readonly config: ConfigService,
    private readonly mock: MockEmailProviderService,
  ) {}

  async sendVerificationCode(
    email: string,
    code: string,
    isNewUser: boolean,
  ): Promise<{ delivered: boolean; debugCode: string | null }> {
    const requestedRoute = this.pickRoute(email);
    const channel = this.resolveChannel(requestedRoute);
    if (!channel) {
      const result = await this.mock.sendCode(email, code);
      return { delivered: false, debugCode: result.debugCode };
    }

    const { transporter, route, fromAddress, fromName } = channel;
    const from = fromAddress ? `${fromName} <${fromAddress}>` : fromName;

    const { subject, text, html } = this.buildLoginMail(code, isNewUser);

    this.logger.log(
      `Sending verification code to ${email} via ${route}` +
        (route !== requestedRoute ? ` (fallback from ${requestedRoute})` : "") +
        ` (from=${fromAddress ?? fromName})`,
    );

    try {
      await transporter.sendMail({ from, to: email, subject, text, html });
    } catch (error) {
      this.logger.error(
        `Email send failed to ${email} via ${route}: ${(error as Error).message}`,
      );
      throw new ServiceUnavailableException("邮件验证码发送失败，请稍后重试。");
    }

    return { delivered: true, debugCode: null };
  }

  private pickRoute(email: string): MailRoute {
    const at = (email ?? "").lastIndexOf("@");
    if (at < 0) return "domestic";
    const domain = email.slice(at + 1).trim().toLowerCase();
    return OVERSEAS_EMAIL_DOMAINS.has(domain) ? "overseas" : "domestic";
  }

  private buildLoginMail(
    code: string,
    isNewUser: boolean,
  ): { subject: string; text: string; html: string } {
    if (isNewUser) {
      const subject = "【隐界】欢迎来到隐界";
      const text = [
        "看到你来了。",
        "",
        "用这串数字进来就好：",
        "",
        code,
        "",
        "10 分钟内有效。",
        "如果不是你本人在操作，把这封信忘掉就行，我们什么都不会发生。",
        "",
        "—— 隐界，一直都在",
      ].join("\n");
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

    const subject = "【隐界】你回来了";
    const text = [
      "你回来了。",
      "",
      "用这串数字继续：",
      "",
      code,
      "",
      "10 分钟内有效。",
      "如果不是你本人在操作，把这封信忘掉就行。",
      "",
      "—— 隐界，一直都在",
    ].join("\n");
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
  // mismatch — 阿里云 DirectMail 强制 from 必须是已验证发信地址，不一致直接 5.7.0
  // 拒收。所以选哪个通道就用哪个通道的 from。
  private resolveChannel(route: MailRoute): {
    transporter: Transporter;
    route: MailRoute;
    fromAddress: string | undefined;
    fromName: string;
  } | null {
    if (route === "overseas") {
      if (!this.overseasReady) {
        this.overseasTransporter = this.buildTransporter("OVERSEAS_");
        this.overseasReady = true;
        if (!this.overseasTransporter) {
          this.logger.warn(
            "CLOUD_SMTP_OVERSEAS_HOST 未配置，海外邮箱将回落到国内通道发送。",
          );
        }
      }
      if (this.overseasTransporter) {
        return {
          transporter: this.overseasTransporter,
          route: "overseas",
          fromAddress:
            this.config.get<string>("CLOUD_MAIL_OVERSEAS_FROM_ADDRESS") ??
            this.config.get<string>("CLOUD_MAIL_FROM_ADDRESS"),
          fromName:
            this.config.get<string>("CLOUD_MAIL_OVERSEAS_FROM_NAME") ??
            this.config.get<string>("CLOUD_MAIL_FROM_NAME") ??
            "隐界",
        };
      }
      // fall through to domestic
    }
    if (!this.domesticReady) {
      this.domesticTransporter = this.buildTransporter("");
      this.domesticReady = true;
      if (!this.domesticTransporter) {
        this.logger.warn(
          "CLOUD_SMTP_HOST 未配置，邮件发送进入 mock 模式（仅打印验证码到日志）。",
        );
      }
    }
    if (!this.domesticTransporter) return null;
    return {
      transporter: this.domesticTransporter,
      route: "domestic",
      fromAddress: this.config.get<string>("CLOUD_MAIL_FROM_ADDRESS"),
      fromName: this.config.get<string>("CLOUD_MAIL_FROM_NAME") ?? "隐界",
    };
  }

  private buildTransporter(prefix: string): Transporter | null {
    const host = this.config.get<string>(`CLOUD_SMTP_${prefix}HOST`);
    if (!host) return null;
    const port = Number(
      this.config.get<string>(`CLOUD_SMTP_${prefix}PORT`) ?? "465",
    );
    const secureRaw =
      this.config.get<string>(`CLOUD_SMTP_${prefix}SECURE`) ?? "true";
    const secure = secureRaw !== "false";
    const user = this.config.get<string>(`CLOUD_SMTP_${prefix}USER`);
    const pass = this.config.get<string>(`CLOUD_SMTP_${prefix}PASS`);
    const proxy = this.config.get<string>(`CLOUD_SMTP_${prefix}PROXY`);

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
      ...(proxy ? { proxy } : {}),
    });
    if (proxy) {
      transporter.set("proxy_socks_module", { SocksClient });
    }
    return transporter;
  }
}
// i18n-ignore-end
