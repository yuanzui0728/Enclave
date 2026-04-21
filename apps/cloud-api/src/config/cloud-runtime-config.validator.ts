import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { assertCloudProductionSecrets } from "./cloud-runtime-config";
import { ComputeProviderRegistryService } from "../providers/compute-provider-registry.service";

@Injectable()
export class CloudRuntimeConfigValidator {
  constructor(
    private readonly configService: ConfigService,
    private readonly computeProviderRegistry: ComputeProviderRegistryService,
  ) {
    assertCloudProductionSecrets(this.configService);
    this.computeProviderRegistry.getDefaultProviderKey();
  }
}
