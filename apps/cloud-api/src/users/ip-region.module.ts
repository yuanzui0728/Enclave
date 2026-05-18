import { Global, Module } from "@nestjs/common";
import { IpRegionService } from "./ip-region.service";

// IpRegionService 内部有进程级 in-memory cache（7d 命中），多 module 实例化会让
// 缓存重复。提为 @Global() 单例，AuthModule 的登录服务和 UsersModule 的回填任务
// 共用一份缓存。
@Global()
@Module({
  providers: [IpRegionService],
  exports: [IpRegionService],
})
export class IpRegionModule {}
