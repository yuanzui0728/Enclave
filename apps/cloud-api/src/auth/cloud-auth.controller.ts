import { Body, Controller, Post, Req } from "@nestjs/common";
import { SendCodeDto, VerifyCodeDto } from "../http-dto/cloud-api.dto";
import { PhoneAuthService } from "./phone-auth.service";

function extractIp(request: { headers: Record<string, string | string[] | undefined> }) {
  const forwarded = request.headers["x-forwarded-for"];
  const real = request.headers["x-real-ip"];
  if (typeof forwarded === "string") {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  if (Array.isArray(forwarded) && forwarded.length > 0) {
    const first = forwarded[0].split(",")[0]?.trim();
    if (first) return first;
  }
  if (typeof real === "string") return real.trim();
  return null;
}

@Controller("cloud/auth")
export class CloudAuthController {
  constructor(private readonly phoneAuthService: PhoneAuthService) {}

  @Post("send-code")
  sendCode(@Body() body: SendCodeDto) {
    return this.phoneAuthService.sendCode(body.phone);
  }

  @Post("verify-code")
  verifyCode(
    @Body() body: VerifyCodeDto,
    @Req() request: { headers: Record<string, string | string[] | undefined> },
  ) {
    return this.phoneAuthService.verifyCode(body.phone, body.code, {
      inviteCode: body.inviteCode ?? null,
      deviceFingerprint: body.deviceFingerprint ?? null,
      ip: extractIp(request),
    });
  }
}
