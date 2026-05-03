import { SetMetadata } from '@nestjs/common';
import { WIKI_ROLE_KEY } from '../guards/wiki-role.guard';

export const RequireRole = (role: 'autoconfirmed' | 'patroller' | 'admin') =>
  SetMetadata(WIKI_ROLE_KEY, role);
