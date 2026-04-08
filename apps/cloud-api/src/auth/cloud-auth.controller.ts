import { Body, Controller, Post } from "@nestjs/common";
import { PhoneAuthService } from "./phone-auth.service";

@Controller("cloud/auth")
export class CloudAuthController {
  constructor(private readonly phoneAuthService: PhoneAuthService) {}

  @Post("send-code")
  sendCode(@Body() body: { phone?: string }) {
    return this.phoneAuthService.sendCode(body.phone ?? "");
  }

  @Post("verify-code")
  verifyCode(@Body() body: { phone?: string; code?: string }) {
    return this.phoneAuthService.verifyCode(body.phone ?? "", body.code ?? "");
  }
}
