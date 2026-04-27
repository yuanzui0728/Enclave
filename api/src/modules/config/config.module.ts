import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemConfigEntity } from './config.entity';
import { SystemConfigService } from './config.service';
import { SystemConfigController } from './config.controller';
import { WorldLanguageService } from './world-language.service';

@Module({
  imports: [TypeOrmModule.forFeature([SystemConfigEntity])],
  providers: [SystemConfigService, WorldLanguageService],
  controllers: [SystemConfigController],
  exports: [SystemConfigService, WorldLanguageService],
})
export class SystemConfigModule {}
