import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { InviteSummaryResponse, RedeemInviteResponse } from "@yinjie/contracts";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { CloudClientAuthGuard } from "../auth/cloud-client-auth.guard";
import { CloudUserEntity } from "../entities/cloud-user.entity";
import { RedeemInviteDto } from "../http-dto/cloud-api.dto";
import { InviteService } from "./invite.service";

type CloudPhoneRequest = { cloudPhone?: string };

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

@Controller("cloud/me/invite")
@UseGuards(CloudClientAuthGuard)
export class InviteClientController {
  constructor(
    private readonly invite: InviteService,
    @InjectRepository(CloudUserEntity)
    private readonly userRepo: Repository<CloudUserEntity>,
  ) {}

  @Get("summary")
  async getSummary(@Req() req: CloudPhoneRequest): Promise<InviteSummaryResponse> {
    const phone = req.cloudPhone;
    if (!phone) throw new NotFoundException("会话未携带手机号。");
    const user = await this.userRepo.findOne({ where: { phone } });
    if (!user) throw new NotFoundException("当前手机号尚未注册云端用户。");
    return this.invite.buildClientSummary(user.id);
  }

  @Post("redeem")
  async redeem(
    @Body() dto: RedeemInviteDto,
    @Req() req: CloudPhoneRequest & {
      headers: Record<string, string | string[] | undefined>;
    },
  ): Promise<RedeemInviteResponse> {
    const phone = req.cloudPhone;
    if (!phone) throw new NotFoundException("会话未携带手机号。");
    const user = await this.userRepo.findOne({ where: { phone } });
    if (!user) throw new NotFoundException("当前手机号尚未注册云端用户。");
    if (await this.invite.hasRedemptionForInvitee(user.id)) {
      throw new BadRequestException("你已使用过邀请码，无法再次兑换。");
    }
    const code = await this.invite.findCodeByCodeString(dto.code);
    if (!code) {
      throw new NotFoundException("邀请码不存在或已停用。");
    }
    if (code.ownerUserId === user.id) {
      throw new BadRequestException("不能使用自己的邀请码。");
    }
    const ip = extractIp(req);
    const result = await this.invite.assessAndRecordRedemption({
      inviterUserId: code.ownerUserId,
      code,
      inviteeUserId: user.id,
      context: {
        inviteePhone: user.phone,
        inviteeIp: ip,
        inviteeDeviceFingerprint: user.registrationDeviceFingerprint,
      },
    });
    return result;
  }
}
