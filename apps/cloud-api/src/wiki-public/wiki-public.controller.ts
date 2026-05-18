import { existsSync } from "node:fs";
import * as path from "node:path";
import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Res,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Response } from "express";

// wiki avatar 文件物理上只存在于 cloud-api 给"wiki owner 账号"spawn 的 world
// child 的 data/accounts/<wiki-owner>/wiki-avatars/ 目录里。原 WikiAvatarController
// 的 GET 路由挂在 child world api 上，要走 /cloud/world-api 反代——而反代会按
// 请求者 cloud token 路由到他自己的 world child，那个 child 上没有 wiki-avatars/
// 目录，所有非 wiki-owner 用户请求 wiki 头像必然 404（实测 24h 650+ 次 resource_error）。
//
// 这个 controller 直接在 cloud-api 进程内服务这些文件，不挂任何 guard——wiki 头像
// 本来就是公共资源（原 WikiAvatarController.@Get 也没挂 guard，靠"任何人都能读"
// 这个约定），把它从 per-user-world-proxy 路径迁出到公共路径就修好了。
const REPO_ROOT_ENV = "YINJIE_REPO_ROOT";
const WIKI_OWNER_ACCOUNT_ENV = "YINJIE_WIKI_OWNER_ACCOUNT_ID";
const DEFAULT_WIKI_OWNER_ACCOUNT_ID = "91173587559732";

const FILENAME_PATTERN = /^[A-Za-z0-9._-]+$/;
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function findRepoRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 12; i += 1) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

@Controller("cloud/public/wiki-avatars")
export class WikiPublicAvatarController {
  private readonly avatarsDir: string;

  constructor(private readonly config: ConfigService) {
    const repoRoot =
      process.env[REPO_ROOT_ENV]?.trim() || findRepoRoot(__dirname);
    const ownerId =
      this.config.get<string>(WIKI_OWNER_ACCOUNT_ENV)?.trim() ||
      DEFAULT_WIKI_OWNER_ACCOUNT_ID;
    this.avatarsDir = path.join(
      repoRoot,
      "data",
      "accounts",
      ownerId,
      "wiki-avatars",
    );
  }

  @Get(":fileName")
  serve(@Param("fileName") fileName: string, @Res() res: Response) {
    if (!FILENAME_PATTERN.test(fileName)) {
      throw new BadRequestException("Invalid wiki avatar filename.");
    }
    const fullPath = path.join(this.avatarsDir, fileName);
    if (!fullPath.startsWith(`${this.avatarsDir}${path.sep}`)) {
      throw new BadRequestException("Invalid wiki avatar path.");
    }
    if (!existsSync(fullPath)) {
      throw new NotFoundException("Wiki avatar not found.");
    }
    res.sendFile(fullPath, {
      maxAge: ONE_YEAR_MS,
      immutable: true,
      headers: { "X-Content-Type-Options": "nosniff" },
    });
  }
}
