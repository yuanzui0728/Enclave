import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NarrativeArcEntity } from './narrative-arc.entity';
import { NarrativeController } from './narrative.controller';
import { NarrativeService } from './narrative.service';

@Module({
  imports: [TypeOrmModule.forFeature([NarrativeArcEntity])],
  providers: [NarrativeService],
  controllers: [NarrativeController],
  exports: [NarrativeService],
})
export class NarrativeModule {}
