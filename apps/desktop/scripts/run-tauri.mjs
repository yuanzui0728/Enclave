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
  CARGO_BUILD_JOBS: process.env.CARGO_BUILD_JOBS ?? "1",
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

const maxAttempts = mode === "build" ? 6 : 1;

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  const result = spawnSync("pnpm", ["exec", "tauri", mode], {
    stdio: "pipe",
    shell: true,
    env,
    encoding: "utf8",
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  if ((result.status ?? 1) === 0) {
    process.exit(0);
  }

  const combinedOutput = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const isRetryableBuildScriptError =
    mode === "build" &&
    attempt < maxAttempts &&
    /build-script-build/i.test(combinedOutput) &&
    /os error 5/i.test(combinedOutput);
  const isRetryableWixToolError =
    mode === "build" &&
    attempt < maxAttempts &&
    /failed to run .*?(light|candle)\.exe/i.test(combinedOutput);

  if (!isRetryableBuildScriptError && !isRetryableWixToolError) {
    process.exit(result.status ?? 1);
  }

  console.error(
    `Detected transient Windows desktop build failure (attempt ${attempt}/${maxAttempts}). Retrying with serialized cargo jobs...`,
  );
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3000);
}

process.exit(1);
