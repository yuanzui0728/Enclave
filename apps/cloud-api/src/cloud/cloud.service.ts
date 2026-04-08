import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { CloudWorldLookupResponse, CloudWorldRequestRecord, CloudWorldStatus, CloudWorldSummary } from "@yinjie/contracts";
import { Repository } from "typeorm";
import { PhoneAuthService } from "../auth/phone-auth.service";
import { CloudWorldEntity } from "../entities/cloud-world.entity";
import { CloudWorldRequestEntity } from "../entities/cloud-world-request.entity";

type EditableRequestStatus = Exclude<CloudWorldStatus, "none">;

@Injectable()
export class CloudService {
  constructor(
    @InjectRepository(CloudWorldEntity)
    private readonly worldRepo: Repository<CloudWorldEntity>,
    @InjectRepository(CloudWorldRequestEntity)
    private readonly requestRepo: Repository<CloudWorldRequestEntity>,
    private readonly phoneAuthService: PhoneAuthService,
  ) {}

  async getWorldLookupByPhone(phone: string): Promise<CloudWorldLookupResponse> {
    const normalizedPhone = this.phoneAuthService.normalizePhone(phone);
    const [world, latestRequest] = await Promise.all([
      this.worldRepo.findOne({
        where: { phone: normalizedPhone },
      }),
      this.requestRepo.findOne({
        where: { phone: normalizedPhone },
        order: { updatedAt: "DESC" },
      }),
    ]);

    return {
      phone: normalizedPhone,
      status: world ? this.toStatus(world.status) : latestRequest ? this.toStatus(latestRequest.status) : "none",
      world: world ? this.serializeWorld(world) : null,
      latestRequest: latestRequest ? this.serializeRequest(latestRequest) : null,
    };
  }

  async getLatestRequestByPhone(phone: string) {
    const normalizedPhone = this.phoneAuthService.normalizePhone(phone);
    const latestRequest = await this.requestRepo.findOne({
      where: { phone: normalizedPhone },
      order: { updatedAt: "DESC" },
    });
    return latestRequest ? this.serializeRequest(latestRequest) : null;
  }

  async createWorldRequest(phone: string, worldName: string) {
    const normalizedPhone = this.phoneAuthService.normalizePhone(phone);
    const normalizedName = worldName.trim();
    if (!normalizedName) {
      throw new BadRequestException("世界名称不能为空。");
    }

    const lookup = await this.getWorldLookupByPhone(normalizedPhone);
    if (lookup.status === "pending" || lookup.status === "provisioning" || lookup.status === "active" || lookup.status === "disabled") {
      throw new BadRequestException("该手机号已经存在云世界记录，不能重复创建。");
    }

    const entity = this.requestRepo.create({
      phone: normalizedPhone,
      worldName: normalizedName,
      status: "pending",
      note: null,
      source: "app",
    });
    await this.requestRepo.save(entity);
    return this.serializeRequest(entity);
  }

  async listRequests(status?: EditableRequestStatus) {
    const where = status ? { status } : undefined;
    const items = await this.requestRepo.find({
      where,
      order: { updatedAt: "DESC" },
    });
    return items.map((item) => this.serializeRequest(item));
  }

  async getRequestById(id: string) {
    const request = await this.requestRepo.findOne({ where: { id } });
    if (!request) {
      throw new NotFoundException("找不到该云世界申请。");
    }
    return this.serializeRequest(request);
  }

  async updateRequest(
    id: string,
    payload: {
      phone?: string;
      worldName?: string;
      status?: EditableRequestStatus;
      note?: string | null;
      apiBaseUrl?: string | null;
      adminUrl?: string | null;
    },
  ) {
    const request = await this.requestRepo.findOne({ where: { id } });
    if (!request) {
      throw new NotFoundException("找不到该云世界申请。");
    }

    const nextPhone = payload.phone ? this.phoneAuthService.normalizePhone(payload.phone) : request.phone;
    const nextWorldName = payload.worldName?.trim() || request.worldName;
    const nextStatus = payload.status ?? this.toStatus(request.status);
    const normalizedApiBaseUrl = this.normalizeUrl(payload.apiBaseUrl);
    const normalizedAdminUrl = this.normalizeUrl(payload.adminUrl);

    request.phone = nextPhone;
    request.worldName = nextWorldName;
    request.status = nextStatus;
    request.note = payload.note?.trim() || null;
    await this.requestRepo.save(request);

    await this.syncWorldForRequest(request, {
      apiBaseUrl: normalizedApiBaseUrl,
      adminUrl: normalizedAdminUrl,
    });

    return this.serializeRequest(request);
  }

  async listWorlds(status?: EditableRequestStatus) {
    const where = status ? { status } : undefined;
    const items = await this.worldRepo.find({
      where,
      order: { updatedAt: "DESC" },
    });
    return items.map((item) => this.serializeWorld(item));
  }

  async getWorldById(id: string) {
    const world = await this.worldRepo.findOne({ where: { id } });
    if (!world) {
      throw new NotFoundException("找不到该云世界。");
    }
    return this.serializeWorld(world);
  }

  async updateWorld(
    id: string,
    payload: {
      phone?: string;
      name?: string;
      status?: EditableRequestStatus;
      apiBaseUrl?: string | null;
      adminUrl?: string | null;
      note?: string | null;
    },
  ) {
    const world = await this.worldRepo.findOne({ where: { id } });
    if (!world) {
      throw new NotFoundException("找不到该云世界。");
    }

    const nextPhone = payload.phone ? this.phoneAuthService.normalizePhone(payload.phone) : world.phone;
    const nextStatus = payload.status ?? this.toStatus(world.status);
    const nextApiBaseUrl = this.normalizeUrl(payload.apiBaseUrl) ?? world.apiBaseUrl;
    if (nextStatus === "active" && !nextApiBaseUrl) {
      throw new BadRequestException("激活云世界时必须提供 apiBaseUrl。");
    }

    world.phone = nextPhone;
    world.name = payload.name?.trim() || world.name;
    world.status = nextStatus;
    world.apiBaseUrl = nextApiBaseUrl;
    world.adminUrl = this.normalizeUrl(payload.adminUrl) ?? world.adminUrl;
    world.note = payload.note?.trim() || null;
    await this.worldRepo.save(world);

    return this.serializeWorld(world);
  }

  private async syncWorldForRequest(
    request: CloudWorldRequestEntity,
    payload: {
      apiBaseUrl?: string | null;
      adminUrl?: string | null;
    },
  ) {
    if (request.status === "pending") {
      return;
    }

    let world = await this.worldRepo.findOne({
      where: { phone: request.phone },
    });

    if (!world) {
      world = this.worldRepo.create({
        phone: request.phone,
        name: request.worldName,
        status: request.status,
        apiBaseUrl: null,
        adminUrl: null,
        note: null,
      });
    }

    world.phone = request.phone;
    world.name = request.worldName;
    world.status = request.status;
    world.note = request.note ?? null;
    world.adminUrl = payload.adminUrl ?? world.adminUrl ?? null;

    if (request.status === "active") {
      if (!payload.apiBaseUrl && !world.apiBaseUrl) {
        throw new BadRequestException("激活云世界时必须提供 apiBaseUrl。");
      }
      world.apiBaseUrl = payload.apiBaseUrl ?? world.apiBaseUrl;
    } else if (payload.apiBaseUrl !== undefined) {
      world.apiBaseUrl = payload.apiBaseUrl;
    }

    await this.worldRepo.save(world);
  }

  private serializeWorld(world: CloudWorldEntity): CloudWorldSummary {
    return {
      id: world.id,
      phone: world.phone,
      name: world.name,
      status: this.toStatus(world.status),
      apiBaseUrl: world.apiBaseUrl,
      adminUrl: world.adminUrl,
      note: world.note,
      createdAt: world.createdAt.toISOString(),
      updatedAt: world.updatedAt.toISOString(),
    };
  }

  private serializeRequest(request: CloudWorldRequestEntity): CloudWorldRequestRecord {
    return {
      id: request.id,
      phone: request.phone,
      worldName: request.worldName,
      status: this.toStatus(request.status),
      note: request.note,
      createdAt: request.createdAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
    };
  }

  private toStatus(value: string): EditableRequestStatus {
    switch (value) {
      case "pending":
      case "provisioning":
      case "active":
      case "rejected":
      case "disabled":
        return value;
      default:
        throw new BadRequestException("不支持的云世界状态。");
    }
  }

  private normalizeUrl(value?: string | null) {
    const normalized = value?.trim();
    if (!normalized) {
      return null;
    }
    return normalized.replace(/\/+$/, "");
  }
}
