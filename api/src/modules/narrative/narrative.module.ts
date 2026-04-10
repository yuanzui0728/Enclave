import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NarrativeArcEntity } from './narrative-arc.entity';
import { NarrativeController } from './narrative.controller';
import { NarrativeService } from './narrative.service';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([NarrativeArcEntity]), AuthModule, AiModule],
  providers: [NarrativeService],
  controllers: [NarrativeController],
  exports: [NarrativeService],
})
export class NarrativeModule {}
