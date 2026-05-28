import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AiModule } from '../ai/ai.module';
import { CharacterSkillRuntimeService } from './character-skill-runtime.service';
import { SkillArtifactJobEntity } from './skill-artifact-job.entity';
import { SkillRunEntity } from './skill-run.entity';

// 角色技能（PPT/Word/Excel 真实产出）框架。CharacterSkillRuntimeService 处理直聊里的
// 意图识别→需求收集→报价→确认→扣费→排渲染 job。渲染 job 处理器在 ChatModule 内
// （SkillArtifactJobService），因其需要 ChatGateway/消息仓等 chat 内部依赖。
// CloudWalletClient 为 @Global 无需 import。
@Module({
  imports: [
    TypeOrmModule.forFeature([SkillRunEntity, SkillArtifactJobEntity]),
    forwardRef(() => AiModule),
  ],
  providers: [CharacterSkillRuntimeService],
  exports: [CharacterSkillRuntimeService, TypeOrmModule],
})
export class CharacterSkillModule {}
