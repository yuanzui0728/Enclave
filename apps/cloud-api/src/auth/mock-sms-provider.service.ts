import { Injectable, Logger } from "@nestjs/common";

@Injectable()
export class MockSmsProviderService {
  private readonly logger = new Logger(MockSmsProviderService.name);

  async sendCode(phone: string, code: string) {
    this.logger.log(`Mock SMS code for ${phone}: ${code}`);
    return {
      debugCode: code,
    };
  }
}
