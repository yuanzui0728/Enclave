import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemConfigEntity } from './config.entity';
import { SystemConfigService } from './config.service';
import { SystemConfigController } from './config.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SystemConfigEntity])],
  providers: [SystemConfigService],
  controllers: [SystemConfigController],
  exports: [SystemConfigService],
})
export class SystemConfigModule {}
