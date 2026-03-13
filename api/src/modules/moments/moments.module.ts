import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MomentsService } from './moments.service';
import { MomentsController } from './moments.controller';
import { MomentEntity } from './moment.entity';
import { AiModule } from '../ai/ai.module';
import { CharactersModule } from '../characters/characters.module';

@Module({
  imports: [TypeOrmModule.forFeature([MomentEntity]), AiModule, CharactersModule],
  providers: [MomentsService],
  controllers: [MomentsController],
  exports: [MomentsService],
})
export class MomentsModule {}
