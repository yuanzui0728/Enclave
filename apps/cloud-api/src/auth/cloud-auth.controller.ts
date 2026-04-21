import { Body, Controller, Post } from "@nestjs/common";
import { SendCodeDto, VerifyCodeDto } from "../http-dto/cloud-api.dto";
import { PhoneAuthService } from "./phone-auth.service";

@Controller("cloud/auth")
export class CloudAuthController {
  constructor(private readonly phoneAuthService: PhoneAuthService) {}

  @Post("send-code")
  sendCode(@Body() body: SendCodeDto) {
    return this.phoneAuthService.sendCode(body.phone);
  }

  @Post("verify-code")
  verifyCode(@Body() body: VerifyCodeDto) {
    return this.phoneAuthService.verifyCode(body.phone, body.code);
  }
}
