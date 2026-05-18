import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { PushTokenController } from './push-token.controller';
import { PushTokenEntity } from './push-token.entity';
import { PushTokenService } from './push-token.service';

@Module({
  imports: [TypeOrmModule.forFeature([PushTokenEntity]), AuthModule],
  controllers: [PushTokenController],
  providers: [PushTokenService],
  exports: [PushTokenService],
})
export class PushModule {}
