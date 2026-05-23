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

// 2026-05-20 wiki 拆库改造后，wiki 头像存到独立 data/wiki/wiki-avatars/ 目录。
// 历史上 wiki 寄生在 91173587559732 这个普通账户的 world child 里，头像走 child world api
// 反代会按请求者 cloud token 路由到他自己的 world child，那个 child 上没有 wiki-avatars/
// 目录，所有非 wiki-owner 用户请求 wiki 头像必然 404（实测 24h 650+ 次 resource_error）。
// 拆库后 wiki 不再寄生，头像目录改成 data/wiki/wiki-avatars/，cloud-api 直接从这个
// 公共目录服务，所有用户都能命中。env 覆盖：YINJIE_WIKI_AVATARS_DIR（相对 repoRoot 或绝对路径）。
const REPO_ROOT_ENV = "YINJIE_REPO_ROOT";
const WIKI_AVATARS_DIR_ENV = "YINJIE_WIKI_AVATARS_DIR";
const DEFAULT_WIKI_AVATARS_DIR = "data/wiki/wiki-avatars";

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
    const configured =
      this.config.get<string>(WIKI_AVATARS_DIR_ENV)?.trim() ||
      DEFAULT_WIKI_AVATARS_DIR;
    this.avatarsDir = path.isAbsolute(configured)
      ? configured
      : path.join(repoRoot, configured);
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
