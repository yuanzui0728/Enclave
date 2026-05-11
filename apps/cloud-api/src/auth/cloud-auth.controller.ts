import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import {
  SendCodeDto,
  SendEmailCodeDto,
  VerifyCodeDto,
  VerifyEmailCodeDto,
  VerifyGoogleIdTokenDto,
} from "../http-dto/cloud-api.dto";
import {
  resolveCloudAuthTokenTtl,
  resolveCloudClientJwtAudience,
  resolveCloudJwtIssuer,
} from "../config/cloud-runtime-config";
import { CLOUD_CLIENT_ACCESS_TOKEN_PURPOSE } from "./cloud-jwt.constants";
import { CloudClientAuthGuard } from "./cloud-client-auth.guard";
import { EmailAuthService } from "./email-auth.service";
import { GoogleAuthService } from "./google-auth.service";
import { PhoneAuthService } from "./phone-auth.service";

function parseTtlMs(ttl: string): number {
  // 接受 "7d" / "12h" / "30m" / "60s" / 纯秒数；mirror @nestjs/jwt 的 expiresIn。
  const match = /^(\d+)\s*([smhd])?$/.exec(ttl.trim());
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const n = Number(match[1]);
  switch (match[2]) {
    case "s": return n * 1000;
    case "m": return n * 60 * 1000;
    case "h": return n * 60 * 60 * 1000;
    case "d": return n * 24 * 60 * 60 * 1000;
    default: return n * 1000;
  }
}

// 把 ::ffff:1.2.3.4 / [::1] / 带空格的字符串规整成裸 IP；空串返回 null。
function normalizeIp(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.replace(/^\[(.*)\]$/, "$1").trim();
  if (!trimmed) return null;
  return trimmed.replace(/^::ffff:/i, "");
}

// 判定 loopback / 私网 / 链路本地 / unique-local；这些 IP 不能作为「真实注册 IP」
// 写入数据库，遇到要继续往后找。
function isLoopbackOrPrivate(ip: string): boolean {
  const v = ip.toLowerCase();
  if (!v) return true;
  if (v === "::1" || v === "::" || v === "0.0.0.0") return true;
  if (v.startsWith("127.")) return true;
  if (v.startsWith("10.")) return true;
  if (v.startsWith("192.168.")) return true;
  // 172.16.0.0/12
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(v)) return true;
  // 169.254.0.0/16 link-local
  if (v.startsWith("169.254.")) return true;
  // IPv6 fc00::/7 ULA, fe80::/10 link-local
  if (/^f[cd][0-9a-f]{2}:/.test(v)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(v)) return true;
  return false;
}

// 校验 client 上报的 IP 是否是合法 v4/v6 字面量；只接受字面量，不接受域名。
function isValidIpLiteral(ip: string): boolean {
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
    return ip.split(".").every((seg) => {
      const n = Number(seg);
      return n >= 0 && n <= 255;
    });
  }
  // 粗略的 IPv6 校验：至少出现一次冒号且只包含 hex/冒号/点
  if (ip.includes(":") && /^[0-9a-fA-F:.]+$/.test(ip)) return true;
  return false;
}

// 取真实客户端 IP：依次尝试 cf-connecting-ip / true-client-ip / x-real-ip /
// x-forwarded-for（首个非私网跳）/ req.ip / socket.remoteAddress；
// 全部都是 loopback/私网时再回落到调用方提供的 clientReportedIp（前端探的公网 IP）。
// 花生壳 vicp.fun 是 L4 TCP 隧道，server-side 头里所有 IP 都会是 127.0.0.1，
// 这条兜底是真实公网 IP 的唯一来源；带防注入校验（仅接受 IP 字面量、不接受域名）。
export function extractIp(
  request: {
    headers: Record<string, string | string[] | undefined>;
    ip?: string;
    socket?: { remoteAddress?: string | null };
  },
  clientReportedIp?: string | null,
): string | null {
  const pickHeader = (name: string): string | null => {
    const raw = request.headers[name];
    if (typeof raw === "string") return raw;
    if (Array.isArray(raw) && raw.length > 0) return raw[0] ?? null;
    return null;
  };

  const singleHopHeaders = ["cf-connecting-ip", "true-client-ip", "x-real-ip"];
  for (const name of singleHopHeaders) {
    const ip = normalizeIp(pickHeader(name));
    if (ip && !isLoopbackOrPrivate(ip)) return ip;
  }

  const xff = pickHeader("x-forwarded-for");
  if (xff) {
    for (const hop of xff.split(",")) {
      const ip = normalizeIp(hop);
      if (ip && !isLoopbackOrPrivate(ip)) return ip;
    }
  }

  const reqIp = normalizeIp(request.ip);
  if (reqIp && !isLoopbackOrPrivate(reqIp)) return reqIp;

  const sockIp = normalizeIp(request.socket?.remoteAddress);
  if (sockIp && !isLoopbackOrPrivate(sockIp)) return sockIp;

  // 兜底：前端自报的公网 IP。可被伪造，仅用于显示与初步分析，
  // 不能作为安全决策依据（封禁/风控应以服务端可信源为准）。
  if (clientReportedIp) {
    const candidate = normalizeIp(clientReportedIp);
    if (candidate && isValidIpLiteral(candidate) && !isLoopbackOrPrivate(candidate)) {
      return candidate;
    }
  }

  // 最后兜底：返回 server-side 看到的任何 IP，哪怕是 loopback。
  // 在本机开发场景下这是合理的（用户就是从 127.0.0.1 来的），
  // 比写 null 更有诊断价值。
  for (const name of singleHopHeaders) {
    const ip = normalizeIp(pickHeader(name));
    if (ip) return ip;
  }
  if (xff) {
    const first = normalizeIp(xff.split(",")[0]);
    if (first) return first;
  }
  return reqIp || sockIp || null;
}

@Controller("cloud/auth")
export class CloudAuthController {
  constructor(
    private readonly phoneAuthService: PhoneAuthService,
    private readonly emailAuthService: EmailAuthService,
    private readonly googleAuthService: GoogleAuthService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  // Sliding TTL：客户端在 token 临到期前（剩余 < 1d）调用这个端点续命，
  // 不需要 refresh token 体系也不需要重新跑邮件验证码。鉴权仍走
  // CloudClientAuthGuard，所以过期 token 会被 401，必须重发验证码。
  @Post("refresh-access")
  @UseGuards(CloudClientAuthGuard)
  async refreshAccessToken(@Req() request: { cloudPhone?: string }) {
    const phone = request.cloudPhone ?? "";
    const ttl = resolveCloudAuthTokenTtl(this.configService);
    const accessToken = await this.jwtService.signAsync(
      {
        phone,
        purpose: CLOUD_CLIENT_ACCESS_TOKEN_PURPOSE,
      },
      {
        expiresIn: ttl as never,
        issuer: resolveCloudJwtIssuer(this.configService),
        audience: resolveCloudClientJwtAudience(this.configService),
        subject: phone,
      },
    );
    const expiresAt = new Date(
      Date.now() + parseTtlMs(typeof ttl === "string" ? ttl : String(ttl)),
    ).toISOString();
    return { accessToken, expiresAt };
  }

  @Post("send-code")
  sendCode(@Body() body: SendCodeDto) {
    return this.phoneAuthService.sendCode(body.phone);
  }

  @Post("verify-code")
  verifyCode(
    @Body() body: VerifyCodeDto,
    @Req() request: {
      headers: Record<string, string | string[] | undefined>;
      ip?: string;
      socket?: { remoteAddress?: string | null };
    },
  ) {
    return this.phoneAuthService.verifyCode(body.phone, body.code, {
      inviteCode: body.inviteCode ?? null,
      deviceFingerprint: body.deviceFingerprint ?? null,
      ip: extractIp(request, body.clientReportedIp ?? null),
    });
  }

  @Post("email/send-code")
  sendEmailCode(@Body() body: SendEmailCodeDto) {
    return this.emailAuthService.sendCode(body.email);
  }

  @Post("email/verify-code")
  verifyEmailCode(
    @Body() body: VerifyEmailCodeDto,
    @Req() request: {
      headers: Record<string, string | string[] | undefined>;
      ip?: string;
      socket?: { remoteAddress?: string | null };
    },
  ) {
    return this.emailAuthService.verifyCode(body.email, body.code, {
      inviteCode: body.inviteCode ?? null,
      deviceFingerprint: body.deviceFingerprint ?? null,
      ip: extractIp(request, body.clientReportedIp ?? null),
    });
  }

  @Post("google/verify-id-token")
  verifyGoogleIdToken(
    @Body() body: VerifyGoogleIdTokenDto,
    @Req() request: {
      headers: Record<string, string | string[] | undefined>;
      ip?: string;
      socket?: { remoteAddress?: string | null };
    },
  ) {
    return this.googleAuthService.verifyIdToken(body.idToken, {
      inviteCode: body.inviteCode ?? null,
      deviceFingerprint: body.deviceFingerprint ?? null,
      ip: extractIp(request, body.clientReportedIp ?? null),
    });
  }
}
