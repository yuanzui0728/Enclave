import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import type { CloudWorldBootstrapConfig } from "@yinjie/contracts";
import type { CloudWorldEntity } from "../entities/cloud-world.entity";
import {
  resolveWorldComposeProjectName,
  resolveWorldRemoteDeployPath,
} from "../orchestration/world-bootstrap-config";

@Injectable()
export class ManualDockerRemoteExecutorService {
  constructor(private readonly configService: ConfigService) {}

  isEnabled() {
    return this.resolveExecutorMode() === "ssh";
  }

  resolveExecutorMode() {
    return this.configService.get<string>("CLOUD_MANUAL_DOCKER_EXECUTOR_MODE")?.trim() === "ssh" ? "ssh" : "package";
  }

  resolveRemoteHost() {
    return this.configService.get<string>("CLOUD_MANUAL_DOCKER_SSH_HOST")?.trim() || null;
  }

  resolveRemoteDeployPath(world: Pick<CloudWorldEntity, "id" | "slug">) {
    return resolveWorldRemoteDeployPath(world, this.configService);
  }

  resolveProjectName(world: Pick<CloudWorldEntity, "id" | "slug">) {
    return resolveWorldComposeProjectName(world);
  }

  async deployWorld(world: CloudWorldEntity, bootstrapConfig: CloudWorldBootstrapConfig) {
    if (!this.isEnabled()) {
      return;
    }

    const remoteDeployPath = this.requireRemoteDeployPath(world);
    const tempDir = await mkdtemp(join(tmpdir(), "yinjie-cloud-world-"));
    const composeFilePath = join(tempDir, "docker-compose.yml");
    const envFilePath = join(tempDir, "world.env");

    try {
      await writeFile(composeFilePath, `${bootstrapConfig.dockerComposeSnippet}\n`, "utf8");
      await writeFile(envFilePath, `${bootstrapConfig.envFileContent}\n`, "utf8");
      await this.runSshCommand(`mkdir -p ${escapeRemoteShellArg(remoteDeployPath)}`);
      await this.runScp(composeFilePath, `${remoteDeployPath}/docker-compose.yml`);
      await this.runScp(envFilePath, `${remoteDeployPath}/world.env`);
      await this.runComposeCommand(world, "up -d --remove-orphans");
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  async startWorld(world: CloudWorldEntity) {
    if (!this.isEnabled()) {
      return;
    }

    await this.runComposeCommand(world, "up -d --remove-orphans");
  }

  async stopWorld(world: CloudWorldEntity) {
    if (!this.isEnabled()) {
      return;
    }

    await this.runComposeCommand(world, "stop");
  }

  private async runComposeCommand(world: Pick<CloudWorldEntity, "id" | "slug">, action: string) {
    const remoteDeployPath = this.requireRemoteDeployPath(world);
    const projectName = this.resolveProjectName(world);
    const composeFilePath = `${remoteDeployPath}/docker-compose.yml`;
    const envFilePath = `${remoteDeployPath}/world.env`;
    await this.runSshCommand(
      [
        "docker",
        "compose",
        "--project-name",
        escapeRemoteShellArg(projectName),
        "-f",
        escapeRemoteShellArg(composeFilePath),
        "--env-file",
        escapeRemoteShellArg(envFilePath),
        action,
      ].join(" "),
    );
  }

  private requireRemoteDeployPath(world: Pick<CloudWorldEntity, "id" | "slug">) {
    const remoteDeployPath = this.resolveRemoteDeployPath(world);
    if (!remoteDeployPath) {
      throw new Error("CLOUD_MANUAL_DOCKER_REMOTE_ROOT is required when the manual-docker SSH executor is enabled.");
    }

    return remoteDeployPath;
  }

  private async runSshCommand(command: string) {
    const target = this.resolveTarget();
    const args = [...this.buildSshArgs(), target, command];
    await runProcess("ssh", args);
  }

  private async runScp(localPath: string, remotePath: string) {
    const target = this.resolveTarget();
    const args = [...this.buildScpArgs(), localPath, `${target}:${remotePath}`];
    await runProcess("scp", args);
  }

  private buildSshArgs() {
    const args = ["-o", "BatchMode=yes"];
    const strictHostKeyChecking = this.configService.get<string>("CLOUD_MANUAL_DOCKER_SSH_STRICT_HOST_KEY_CHECKING")?.trim();
    if (strictHostKeyChecking) {
      args.push("-o", `StrictHostKeyChecking=${strictHostKeyChecking}`);
    }

    const port = this.configService.get<string>("CLOUD_MANUAL_DOCKER_SSH_PORT")?.trim();
    if (port) {
      args.push("-p", port);
    }

    const privateKeyPath = this.configService.get<string>("CLOUD_MANUAL_DOCKER_SSH_PRIVATE_KEY_PATH")?.trim();
    if (privateKeyPath) {
      args.push("-i", privateKeyPath);
    }

    return args;
  }

  private buildScpArgs() {
    const args = ["-q"];
    const strictHostKeyChecking = this.configService.get<string>("CLOUD_MANUAL_DOCKER_SSH_STRICT_HOST_KEY_CHECKING")?.trim();
    if (strictHostKeyChecking) {
      args.push("-o", `StrictHostKeyChecking=${strictHostKeyChecking}`);
    }

    const port = this.configService.get<string>("CLOUD_MANUAL_DOCKER_SSH_PORT")?.trim();
    if (port) {
      args.push("-P", port);
    }

    const privateKeyPath = this.configService.get<string>("CLOUD_MANUAL_DOCKER_SSH_PRIVATE_KEY_PATH")?.trim();
    if (privateKeyPath) {
      args.push("-i", privateKeyPath);
    }

    return args;
  }

  private resolveTarget() {
    const host = this.resolveRemoteHost();
    if (!host) {
      throw new Error("CLOUD_MANUAL_DOCKER_SSH_HOST is required when the manual-docker SSH executor is enabled.");
    }

    const user = this.configService.get<string>("CLOUD_MANUAL_DOCKER_SSH_USER")?.trim();
    return user ? `${user}@${host}` : host;
  }
}

function escapeRemoteShellArg(value: string) {
  return `'${value.replace(/'/g, "'\"'\"'")}'`;
}

function runProcess(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `${command} exited with code ${code}.${stderr.trim() ? ` stderr: ${stderr.trim()}` : ""}${stdout.trim() ? ` stdout: ${stdout.trim()}` : ""}`,
        ),
      );
    });
  });
}
