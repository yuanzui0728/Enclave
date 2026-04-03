import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";

const mode = process.argv[2] ?? "dev";
const cargoBin = join(homedir(), ".cargo", "bin");
const cargoTargetDir = join(homedir(), ".cargo-target", "yinjie-desktop");
const env = {
  ...process.env,
  PATH: `${cargoBin};${process.env.PATH ?? ""}`,
  CARGO_TARGET_DIR: process.env.CARGO_TARGET_DIR ?? cargoTargetDir,
};

mkdirSync(env.CARGO_TARGET_DIR, { recursive: true });

function hasCommand(command, args = ["--version"]) {
  const result = spawnSync(command, args, {
    stdio: "ignore",
    shell: true,
    env,
  });

  return result.status === 0;
}

if (!hasCommand("rustc") || !hasCommand("cargo")) {
  console.error(
    [
      "Rust toolchain is required to run the Yinjie desktop shell.",
      "Install rustup, restart the terminal, then rerun this command.",
      "Current JS workspace has already been scaffolded and verified.",
    ].join(" "),
  );
  process.exit(1);
}

const result = spawnSync("pnpm", ["exec", "tauri", mode], {
  stdio: "inherit",
  shell: true,
  env,
});

process.exit(result.status ?? 1);
