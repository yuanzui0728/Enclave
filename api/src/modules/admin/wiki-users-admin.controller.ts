// i18n-ignore-start: admin-only API, returns JSON for the cloud console.
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import {
  WikiUsersAdminService,
  type WikiUserListQuery,
} from './wiki-users-admin.service';

@Controller('admin/wiki-users')
@UseGuards(AdminGuard)
export class WikiUsersAdminController {
  constructor(private readonly service: WikiUsersAdminService) {}

  @Get()
  listUsers(@Query() query: WikiUserListQuery) {
    return this.service.listUsers(query ?? {});
  }

  @Get(':userId/private-characters')
  listPrivateCharacters(@Param('userId') userId: string) {
    return this.service.listPrivateCharacters(userId);
  }
}
// i18n-ignore-end
