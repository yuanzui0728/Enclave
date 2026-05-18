import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FriendshipEntity } from './friendship.entity';
import { FriendRemarkResolver } from './friend-remark-resolver.service';

@Module({
  imports: [TypeOrmModule.forFeature([FriendshipEntity])],
  providers: [FriendRemarkResolver],
  exports: [FriendRemarkResolver],
})
export class FriendRemarkResolverModule {}
