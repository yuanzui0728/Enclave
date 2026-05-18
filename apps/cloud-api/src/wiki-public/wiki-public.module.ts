import { Module } from "@nestjs/common";
import { WikiPublicAvatarController } from "./wiki-public.controller";

@Module({
  controllers: [WikiPublicAvatarController],
})
export class WikiPublicModule {}
