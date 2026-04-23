import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from '../ai/ai.module';
import { AdminGuard } from '../admin/admin.guard';
import { AuthModule } from '../auth/auth.module';
import { CharactersModule } from '../characters/characters.module';
import { SystemConfigModule } from '../config/config.module';
import { CyberAvatarModule } from '../cyber-avatar/cyber-avatar.module';
import { ActionConnectorEntity } from './action-connector.entity';
import { ActionRunEntity } from './action-run.entity';
import { ActionRuntimeAdminController } from './action-runtime-admin.controller';
import { ActionRuntimeRulesService } from './action-runtime-rules.service';
import { ActionRuntimeService } from './action-runtime.service';
import { CharacterEntity } from '../characters/character.entity';

@Module({
  imports: [
    forwardRef(() => AiModule),
    AuthModule,
    CharactersModule,
    SystemConfigModule,
    forwardRef(() => CyberAvatarModule),
    TypeOrmModule.forFeature([
      ActionConnectorEntity,
      ActionRunEntity,
      CharacterEntity,
    ]),
  ],
  controllers: [ActionRuntimeAdminController],
  providers: [AdminGuard, ActionRuntimeRulesService, ActionRuntimeService],
  exports: [ActionRuntimeRulesService, ActionRuntimeService],
})
export class ActionRuntimeModule {}
