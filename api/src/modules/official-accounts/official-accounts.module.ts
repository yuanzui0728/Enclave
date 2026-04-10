import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { OfficialAccountEntity } from './official-account.entity';
import { OfficialAccountArticleEntity } from './official-account-article.entity';
import { OfficialAccountDeliveryEntity } from './official-account-delivery.entity';
import { OfficialAccountFollowEntity } from './official-account-follow.entity';
import { OfficialAccountServiceMessageEntity } from './official-account-service-message.entity';
import { OfficialAccountsController } from './official-accounts.controller';
import { OfficialAccountsService } from './official-accounts.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OfficialAccountEntity,
      OfficialAccountArticleEntity,
      OfficialAccountDeliveryEntity,
      OfficialAccountFollowEntity,
      OfficialAccountServiceMessageEntity,
    ]),
    AuthModule,
  ],
  controllers: [OfficialAccountsController],
  providers: [OfficialAccountsService],
  exports: [OfficialAccountsService],
})
export class OfficialAccountsModule {}
