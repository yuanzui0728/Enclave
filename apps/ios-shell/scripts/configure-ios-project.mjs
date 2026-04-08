import fs from "node:fs";
import path from "node:path";

const cwd = process.cwd();
const iosRoot = path.join(cwd, "ios", "App");
const appRoot = path.join(iosRoot, "App");
const pluginsRoot = path.join(appRoot, "Plugins");

if (!fs.existsSync(iosRoot)) {
  console.error("Missing ios/App directory. Run `pnpm ios:sync` first.");
  process.exit(1);
}

fs.mkdirSync(appRoot, { recursive: true });
fs.mkdirSync(pluginsRoot, { recursive: true });

const copies = [
  {
    from: path.join(cwd, "xcode-template", "Info.plist.example"),
    to: path.join(appRoot, "Info.plist.example"),
  },
  {
    from: path.join(cwd, "xcode-template", "PrivacyInfo.xcprivacy.example"),
    to: path.join(appRoot, "PrivacyInfo.xcprivacy.example"),
  },
  {
    from: path.join(cwd, "xcode-template", "App.entitlements.example"),
    to: path.join(appRoot, "App.entitlements.example"),
  },
  {
    from: path.join(cwd, "xcode-template", "Podfile.example"),
    to: path.join(iosRoot, "Podfile.example"),
  },
  {
    from: path.join(cwd, "plugins", "swift-stub", "YinjieRuntimePlugin.swift"),
    to: path.join(pluginsRoot, "YinjieRuntimePlugin.swift"),
  },
  {
    from: path.join(cwd, "plugins", "swift-stub", "YinjieSecureStoragePlugin.swift"),
    to: path.join(pluginsRoot, "YinjieSecureStoragePlugin.swift"),
  },
  {
    from: path.join(cwd, "plugins", "swift-stub", "YinjieMobileBridgePlugin.swift"),
    to: path.join(pluginsRoot, "YinjieMobileBridgePlugin.swift"),
  },
];

for (const file of copies) {
  fs.mkdirSync(path.dirname(file.to), { recursive: true });
  fs.copyFileSync(file.from, file.to);
  console.log(`copied ${path.relative(cwd, file.from)} -> ${path.relative(cwd, file.to)}`);
}

const readmePath = path.join(pluginsRoot, "README.generated.txt");
fs.writeFileSync(
  readmePath,
  [
    "These files were copied from apps/ios-shell templates.",
    "Replace the Swift stubs with real plugin implementations before release.",
    "Use docs/ios-plugin-implementation-guide.md and docs/ios-xcode-integration-checklist.md as the source of truth.",
    "",
  ].join("\n"),
);

console.log("");
console.log("iOS project templates copied.");
console.log("Next:");
console.log("1. Open Xcode.");
console.log("2. Add copied files to target membership.");
console.log("3. Replace plugin stubs with real implementations.");
