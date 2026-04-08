import Foundation
import Capacitor

@objc(YinjieMobileBridgePlugin)
public class YinjieMobileBridgePlugin: CAPPlugin {
    @objc func openExternalUrl(_ call: CAPPluginCall) {
        call.resolve()
    }

    @objc func share(_ call: CAPPluginCall) {
        call.resolve()
    }

    @objc func pickImages(_ call: CAPPluginCall) {
        call.resolve([
            "assets": []
        ])
    }

    @objc func getPushToken(_ call: CAPPluginCall) {
        call.resolve([
            "token": NSNull()
        ])
    }
}
