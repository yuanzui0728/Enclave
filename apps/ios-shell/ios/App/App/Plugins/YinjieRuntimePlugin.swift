import Foundation
import Capacitor

@objc(YinjieRuntimePlugin)
public class YinjieRuntimePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "YinjieRuntimePlugin"
    public let jsName = "YinjieRuntime"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getConfig", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getLocale", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setLocale", returnType: CAPPluginReturnPromise)
    ]

    private static let defaultLocale = "zh-CN"
    private static let localeStorageKey = "YinjieAppLocale"
    private static let localeSourceApp = "app"
    private static let localeSourceSystem = "system"
    private static let localeSourceDefault = "default"

    @objc func getConfig(_ call: CAPPluginCall) {
        let info = Bundle.main.infoDictionary ?? [:]
        let bundledConfig = readBundledRuntimeConfig()

        let apiBaseUrl =
            nonEmptyString(bundledConfig["apiBaseUrl"] as? String) ??
            nonEmptyString(info["YinjieApiBaseUrl"] as? String)
        let socketBaseUrl =
            nonEmptyString(bundledConfig["socketBaseUrl"] as? String) ??
            nonEmptyString(info["YinjieSocketBaseUrl"] as? String) ??
            apiBaseUrl
        let cloudApiBaseUrl =
            nonEmptyString(bundledConfig["cloudApiBaseUrl"] as? String) ??
            nonEmptyString(info["YinjieCloudApiBaseUrl"] as? String)
        let environment =
            nonEmptyString(bundledConfig["environment"] as? String) ??
            nonEmptyString(info["YinjieEnvironment"] as? String) ??
            "production"
        let publicAppName =
            nonEmptyString(Bundle.main.object(forInfoDictionaryKey: "YinjiePublicAppName") as? String) ??
            nonEmptyString(bundledConfig["publicAppName"] as? String) ??
            (Bundle.main.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String) ??
            (Bundle.main.object(forInfoDictionaryKey: "CFBundleName") as? String) ??
            "Yinjie"

        var result: [String: Any] = [
            "appPlatform": "ios",
            "environment": environment,
            "publicAppName": publicAppName,
            "applicationId": Bundle.main.bundleIdentifier ?? "com.yinjie.ios",
            "preferredLocales": preferredLocales()
        ]

        if let apiBaseUrl {
            result["apiBaseUrl"] = apiBaseUrl
            result["worldAccessMode"] = "local"
            result["configStatus"] = "configured"
        }

        if let socketBaseUrl {
            result["socketBaseUrl"] = socketBaseUrl
        }

        if let cloudApiBaseUrl {
            result["cloudApiBaseUrl"] = cloudApiBaseUrl
        }

        if let versionName = nonEmptyString(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String) {
            result["appVersionName"] = versionName
        }

        if let versionCodeString = nonEmptyString(Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String),
           let versionCode = Int(versionCodeString) {
            result["appVersionCode"] = versionCode
        }

        call.resolve(result)
    }

    @objc func getLocale(_ call: CAPPluginCall) {
        call.resolve(readLocalePayload())
    }

    @objc func setLocale(_ call: CAPPluginCall) {
        guard let locale = resolveSupportedLocale(call.getString("locale")) else {
            call.reject("unsupported locale")
            return
        }

        UserDefaults.standard.set(locale, forKey: Self.localeStorageKey)
        UserDefaults.standard.set([locale], forKey: "AppleLanguages")

        call.resolve([
            "locale": locale,
            "source": Self.localeSourceApp
        ])
    }

    private func readBundledRuntimeConfig() -> [String: Any] {
        // Capacitor 把 webDir 整体作为 folder reference 同步到 ios/App/App/public/，
        // 进 .app 后会保留目录层级；Bundle.main.url 不会递归搜子目录，必须显式
        // 指 subdirectory:"public"，否则永远拿不到 bundled runtime-config.json，
        // 业务侧只能靠 WebView fetch 兜底，这条 native 路径就成了死代码。
        let bundleUrl =
            Bundle.main.url(forResource: "runtime-config", withExtension: "json", subdirectory: "public") ??
            Bundle.main.url(forResource: "runtime-config", withExtension: "json")

        guard let url = bundleUrl,
              let data = try? Data(contentsOf: url),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return [:]
        }

        return json
    }

    private func nonEmptyString(_ value: String?) -> String? {
        guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty else {
            return nil
        }

        return value
    }

    private func preferredLocales() -> [String] {
        return Locale.preferredLanguages.compactMap { value in
            let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines)
            return normalized.isEmpty ? nil : normalized
        }
    }

    private func readLocalePayload() -> [String: Any] {
        if let stored = nonEmptyString(UserDefaults.standard.string(forKey: Self.localeStorageKey)),
           let resolved = resolveSupportedLocale(stored) {
            return [
                "locale": resolved,
                "source": Self.localeSourceApp
            ]
        }

        for candidate in Locale.preferredLanguages {
            if let resolved = resolveSupportedLocale(candidate) {
                return [
                    "locale": resolved,
                    "source": Self.localeSourceSystem
                ]
            }
        }

        return [
            "locale": Self.defaultLocale,
            "source": Self.localeSourceDefault
        ]
    }

    private func resolveSupportedLocale(_ value: String?) -> String? {
        guard let raw = value?.trimmingCharacters(in: .whitespacesAndNewlines), !raw.isEmpty else {
            return nil
        }

        let normalized = raw.replacingOccurrences(of: "_", with: "-").lowercased()

        if normalized == "zh" ||
            normalized == "zh-cn" ||
            normalized == "zh-hans" ||
            normalized.hasPrefix("zh-hans-") ||
            normalized.hasPrefix("zh-cn-") {
            return "zh-CN"
        }

        // 真机走查 R1：仅支持 zh-CN 一个 Chinese variant 时，Traditional Chinese
        // 读者 (zh-Hant / zh-Hant-TW / zh-HK / zh-MO / zh-TW 等 Apple BCP-47
        // 列出的所有繁体变体) 拿不到 zh- 的匹配，会顺着 preferredLanguages 往下
        // 找次选：
        //   - 台湾读者常加日语作次选 (历史/文化原因) → 现状直接拿到 ja-JP UI，
        //     繁体读者看日语介面明显不对；
        //   - 香港读者常加英语作次选 → 拿到 en-US，对汉字依赖大的读者难读。
        // 简体跟繁体至少同语系，绝大多数繁体读者「猜」简体远比「读」日语或
        // 英语来得轻松。把所有 Traditional 变体收到 zh-CN，繁体读者打开 app
        // 直接是中文 UI；如果他们更想要英文，去「设置 → 语言」手动改一下，
        // setLocale 会持久化到 UserDefaults，下次启动还原。
        if normalized == "zh-hant" ||
            normalized.hasPrefix("zh-hant-") ||
            normalized == "zh-tw" ||
            normalized.hasPrefix("zh-tw-") ||
            normalized == "zh-hk" ||
            normalized.hasPrefix("zh-hk-") ||
            normalized == "zh-mo" ||
            normalized.hasPrefix("zh-mo-") {
            return "zh-CN"
        }

        if normalized == "en" || normalized.hasPrefix("en-") {
            return "en-US"
        }

        if normalized == "ja" || normalized.hasPrefix("ja-") {
            return "ja-JP"
        }

        if normalized == "ko" || normalized.hasPrefix("ko-") {
            return "ko-KR"
        }

        return nil
    }
}
