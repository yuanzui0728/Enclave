These files were copied from apps/ios-shell templates.
Plugin files are only seeded when missing so existing implementations are not overwritten.
PrivacyInfo.xcprivacy and App.entitlements are also seeded when missing so the Xcode project has usable defaults.
configure-ios-project.mjs also ensures the Swift plugin files are referenced by App.xcodeproj and included in target membership.
Use docs/ios-plugin-implementation-guide.md and docs/ios-xcode-integration-checklist.md as the source of truth.
