import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CharactersModule } from '../characters/characters.module';
import { MinimaxModule } from '../minimax/minimax.module';
import { XhsPromoController } from './xhs-promo.controller';
import { XhsPromoService } from './xhs-promo.service';

@Module({
  imports: [MinimaxModule, forwardRef(() => CharactersModule), AuthModule],
  controllers: [XhsPromoController],
  providers: [XhsPromoService],
})
export class XhsPromoModule {}
