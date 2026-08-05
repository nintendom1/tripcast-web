import Capacitor
import Foundation

@objc(AdaptiveLocationPlugin)
public final class AdaptiveLocationPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AdaptiveLocationPlugin"
    public let jsName = "AdaptiveLocation"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setCalibrationActive", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getState", returnType: CAPPluginReturnPromise)
    ]

    public override func load() {
        AdaptiveLocationService.shared.eventHandler = { [weak self] event in
            self?.notifyListeners("locationUpdate", data: event, retainUntilConsumed: true)
        }
    }

    @objc func start(_ call: CAPPluginCall) {
        AdaptiveLocationService.shared.startLive()
        call.resolve(AdaptiveLocationService.shared.currentState())
    }

    @objc func stop(_ call: CAPPluginCall) {
        AdaptiveLocationService.shared.stopLive()
        call.resolve(AdaptiveLocationService.shared.currentState())
    }

    @objc func setCalibrationActive(_ call: CAPPluginCall) {
        AdaptiveLocationService.shared.setCalibrationActive(call.getBool("active") ?? false)
        call.resolve(AdaptiveLocationService.shared.currentState())
    }

    @objc func getState(_ call: CAPPluginCall) {
        call.resolve(AdaptiveLocationService.shared.currentState())
    }
}
