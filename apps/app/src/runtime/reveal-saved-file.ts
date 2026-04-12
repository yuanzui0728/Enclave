import { isDesktopRuntimeAvailable } from "@yinjie/ui";

export async function revealSavedFile(path: string) {
  const normalizedPath = path.trim();
  if (!normalizedPath || !isDesktopRuntimeAvailable()) {
    return false;
  }

  try {
    const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
    await revealItemInDir(normalizedPath);
    return true;
  } catch {
    return false;
  }
}
