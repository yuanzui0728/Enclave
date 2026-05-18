import Foundation
import Capacitor
import Security

// OSStatus 是 Int32 的 typealias，Swift 标准库里不 conform Error；
// 直接写 Result<X, OSStatus> 或 call.reject(_:_:_:error:OSStatus) 都过不了
// 编译（Result.Failure 必须 : Error，call.reject 第 3 参也是 Error?）。
// 包一层 KeychainError 让它带着 status 走 Error 通道。
private struct KeychainError: Error, CustomNSError {
    let status: OSStatus

    static var errorDomain: String { "YinjieSecureStorage" }
    var errorCode: Int { Int(status) }
    var errorUserInfo: [String: Any] {
        ["NSDebugDescription": "Keychain operation failed with OSStatus \(status)"]
    }
}

@objc(YinjieSecureStoragePlugin)
public class YinjieSecureStoragePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "YinjieSecureStoragePlugin"
    public let jsName = "YinjieSecureStorage"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise)
    ]

    private let serviceName = "com.yinjie.session"

    @objc func get(_ call: CAPPluginCall) {
        guard let key = normalizedKey(from: call) else {
            call.resolve(["value": NSNull()])
            return
        }

        switch readValue(for: key) {
        case .success(let value):
            call.resolve([
                "value": value ?? NSNull()
            ])
        case .failure(let error):
            call.reject("failed to read secure storage value", nil, error)
        }
    }

    @objc func set(_ call: CAPPluginCall) {
        guard let key = normalizedKey(from: call), let value = call.getString("value") else {
            call.reject("key and value are required")
            return
        }

        switch writeValue(value, for: key) {
        case .success:
            call.resolve()
        case .failure(let error):
            call.reject("failed to write secure storage value", nil, error)
        }
    }

    @objc func remove(_ call: CAPPluginCall) {
        guard let key = normalizedKey(from: call) else {
            call.resolve()
            return
        }

        switch deleteValue(for: key) {
        case .success:
            call.resolve()
        case .failure(let error):
            call.reject("failed to remove secure storage value", nil, error)
        }
    }

    private func normalizedKey(from call: CAPPluginCall) -> String? {
        guard let rawKey = call.getString("key")?.trimmingCharacters(in: .whitespacesAndNewlines), !rawKey.isEmpty else {
            return nil
        }

        return rawKey
    }

    private func query(for key: String) -> [String: Any] {
        return [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName,
            kSecAttrAccount as String: key,
        ]
    }

    private func readValue(for key: String) -> Result<String?, KeychainError> {
        var item: CFTypeRef?
        var lookup = query(for: key)
        lookup[kSecReturnData as String] = kCFBooleanTrue
        lookup[kSecMatchLimit as String] = kSecMatchLimitOne

        let status = SecItemCopyMatching(lookup as CFDictionary, &item)
        if status == errSecItemNotFound {
            return .success(nil)
        }

        guard status == errSecSuccess else {
            return .failure(KeychainError(status: status))
        }

        guard let data = item as? Data else {
            return .success(nil)
        }

        return .success(String(data: data, encoding: .utf8))
    }

    private func writeValue(_ value: String, for key: String) -> Result<Void, KeychainError> {
        let encodedValue = Data(value.utf8)
        let lookup = query(for: key)

        // 老实现 SecItemAdd 没指定 kSecAttrAccessible，默认走 kSecAttrAccessibleWhenUnlocked。
        // 后果两条：
        //   1. 设备锁屏后 keychain item 读不到（我们暂时只在前台读，不暴雷）；
        //   2. **item 跟着加密 iCloud 备份/iTunes 备份走** —— 用户把旧 iPhone
        //      backup-restore 到新 iPhone 时，session 凭据被一并复制过去。
        //      新机开 app 直接 auto-login，server 端会突然冒出一台不认识的
        //      设备拿着同一份 token 在发请求。把 token 设备绑定的安全设计直接
        //      破掉，Apple 也明确建议 auth 凭据用 *ThisDeviceOnly 系列。
        //
        // 改成 SecItemAdd 显式带 kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly：
        //   - AfterFirstUnlock：首次解锁后可读，cover 推送回调 / background
        //     fetch 这种锁屏后台读场景（未来加这条路径不用回头改 keychain 配置）；
        //   - ThisDeviceOnly：不进 iCloud backup / iTunes 加密备份，restore
        //     到新设备时 keychain 不带 token 过去，强制重新登录。
        //
        // 迁移：keychain 不允许直接改已有 item 的 kSecAttrAccessible，必须
        // 「先删后加」。SecItemDelete 用 query(for: key)（只含 Service +
        // Account，不带 accessibility 过滤），命中老 WhenUnlocked item 一并
        // 干掉；接下来 SecItemAdd 一律带 *ThisDeviceOnly。下一次 token
        // refresh 自动完成 in-place 迁移；从没刷过 token 的老用户 keychain
        // item 行为不变（直到他们下次登录 / refresh）。SecItemUpdate 路径
        // 干掉，因为它没法改 accessibility 的 case 会留旧策略。
        SecItemDelete(lookup as CFDictionary)

        var insert = lookup
        insert[kSecValueData as String] = encodedValue
        insert[kSecAttrAccessible as String] =
            kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let insertStatus = SecItemAdd(insert as CFDictionary, nil)
        return insertStatus == errSecSuccess
            ? .success(())
            : .failure(KeychainError(status: insertStatus))
    }

    private func deleteValue(for key: String) -> Result<Void, KeychainError> {
        let status = SecItemDelete(query(for: key) as CFDictionary)
        if status == errSecSuccess || status == errSecItemNotFound {
            return .success(())
        }
        return .failure(KeychainError(status: status))
    }
}
