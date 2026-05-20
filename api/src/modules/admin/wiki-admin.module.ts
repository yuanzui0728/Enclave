// i18n-ignore-start: server module wiring, no user-facing strings.
import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { CharactersModule } from '../characters/characters.module';
import { WikiModule } from '../wiki/wiki.module';
import { CharacterEntity } from '../characters/character.entity';
import { CharacterPageEntity } from '../wiki/entities/character-page.entity';
import { CharacterRevisionEntity } from '../wiki/entities/character-revision.entity';
import { UserWikiProfileEntity } from '../wiki/entities/user-wiki-profile.entity';
import { UserPrivateCharacterEntity } from '../wiki/entities/user-private-character.entity';
import { UserEntity } from '../auth/user.entity';
import { AdminGuard } from './admin.guard';
import { WikiSyncAdminService } from './wiki-sync-admin.service';
import { WikiSyncController } from './wiki-sync.controller';
import { WikiUsersAdminService } from './wiki-users-admin.service';
import { WikiUsersAdminController } from './wiki-users-admin.controller';

// 把"wiki 后台"相关的 admin 端口从 AdminModule 剥离出来：原本 WikiSyncAdminService /
// WikiUsersAdminService 和它们的 controller 直接挂在 AdminModule 上，结果每个 cloud-api spawn
// 的 world child 进程都会注册一份 wiki 后台路由 + 跑 wiki cron，逻辑上属于"独立 wiki 体系"。
// 拆出来后只在 WikiAppModule（main-wiki.ts 的 bootstrap）里加载，普通 world child 完全
// 不再触及 wiki 业务。
@Module({
  imports: [
    AuthModule,
    forwardRef(() => CharactersModule),
    WikiModule,
    TypeOrmModule.forFeature([
      UserEntity,
      CharacterEntity,
      CharacterPageEntity,
      CharacterRevisionEntity,
      UserWikiProfileEntity,
      UserPrivateCharacterEntity,
    ]),
  ],
  providers: [WikiSyncAdminService, WikiUsersAdminService, AdminGuard],
  controllers: [WikiSyncController, WikiUsersAdminController],
  exports: [WikiSyncAdminService, WikiUsersAdminService],
})
export class WikiAdminModule {}
// i18n-ignore-end
