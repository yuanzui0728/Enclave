import Foundation
import Capacitor
import Security

@objc(YinjieSecureStoragePlugin)
public class YinjieSecureStoragePlugin: CAPPlugin {
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

    private func readValue(for key: String) -> Result<String?, OSStatus> {
        var item: CFTypeRef?
        var lookup = query(for: key)
        lookup[kSecReturnData as String] = kCFBooleanTrue
        lookup[kSecMatchLimit as String] = kSecMatchLimitOne

        let status = SecItemCopyMatching(lookup as CFDictionary, &item)
        if status == errSecItemNotFound {
            return .success(nil)
        }

        guard status == errSecSuccess else {
            return .failure(status)
        }

        guard let data = item as? Data else {
            return .success(nil)
        }

        return .success(String(data: data, encoding: .utf8))
    }

    private func writeValue(_ value: String, for key: String) -> Result<Void, OSStatus> {
        let encodedValue = Data(value.utf8)
        let lookup = query(for: key)
        let attributes = [kSecValueData as String: encodedValue]

        let updateStatus = SecItemUpdate(lookup as CFDictionary, attributes as CFDictionary)
        if updateStatus == errSecSuccess {
            return .success(())
        }

        if updateStatus != errSecItemNotFound {
            return .failure(updateStatus)
        }

        var insert = lookup
        insert[kSecValueData as String] = encodedValue
        let insertStatus = SecItemAdd(insert as CFDictionary, nil)
        return insertStatus == errSecSuccess ? .success(()) : .failure(insertStatus)
    }

    private func deleteValue(for key: String) -> Result<Void, OSStatus> {
        let status = SecItemDelete(query(for: key) as CFDictionary)
        return (status == errSecSuccess || status == errSecItemNotFound) ? .success(()) : .failure(status)
    }
}
