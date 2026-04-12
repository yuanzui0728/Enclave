import Foundation
import Capacitor

@objc(YinjieRuntimePlugin)
public class YinjieRuntimePlugin: CAPPlugin {
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
        let environment =
            nonEmptyString(bundledConfig["environment"] as? String) ??
            nonEmptyString(info["YinjieEnvironment"] as? String) ??
            "production"
        let publicAppName =
            nonEmptyString(info["YinjiePublicAppName"] as? String) ??
            nonEmptyString(bundledConfig["publicAppName"] as? String) ??
            (Bundle.main.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String) ??
            (Bundle.main.object(forInfoDictionaryKey: "CFBundleName") as? String) ??
            "Yinjie"

        var result: [String: Any] = [
            "appPlatform": "ios",
            "environment": environment,
            "publicAppName": publicAppName,
            "applicationId": Bundle.main.bundleIdentifier ?? "com.yinjie.ios"
        ]

        if let apiBaseUrl {
            result["apiBaseUrl"] = apiBaseUrl
            result["worldAccessMode"] = "local"
            result["configStatus"] = "configured"
        }

        if let socketBaseUrl {
            result["socketBaseUrl"] = socketBaseUrl
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

    private func readBundledRuntimeConfig() -> [String: Any] {
        guard let url = Bundle.main.url(forResource: "runtime-config", withExtension: "json"),
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
}
