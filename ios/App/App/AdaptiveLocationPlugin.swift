import Capacitor
import Foundation

@objc(AdaptiveLocationPlugin)
public final class AdaptiveLocationPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AdaptiveLocationPlugin"
    public let jsName = "AdaptiveLocation"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "configurePublishing", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "foreground", returnType: CAPPluginReturnPromise),
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
        let preserveSamples = call.getString("pendingSamples") == "preserve"
        AdaptiveLocationService.shared.stopLive(
            clearCredentials: call.getBool("clearCredentials") ?? false,
            preserveSamples: preserveSamples
        )
        call.resolve(AdaptiveLocationService.shared.currentState())
    }

    @objc func configurePublishing(_ call: CAPPluginCall) {
        guard
            let endpoint = call.getString("endpoint"),
            let token = call.getString("token")
        else {
            call.reject("endpoint and token are required")
            return
        }
        let zones = (call.getArray("cloakZones", JSObject.self) ?? []).compactMap { zone -> NativeLocationPublisher.CloakZone? in
            guard
                let lat = zone["lat"] as? Double,
                let lon = zone["lon"] as? Double,
                let radiusMeters = zone["radiusMeters"] as? Double
            else { return nil }
            return .init(lat: lat, lon: lon, radiusMeters: radiusMeters)
        }
        do {
            try NativeLocationPublisher.shared.configure(
                endpoint: endpoint,
                token: token,
                liveTrailEnabled: call.getBool("liveTrailEnabled") ?? false,
                alertThresholdSeconds: call.getDouble("alertThresholdSeconds") ?? 120,
                cloakTimeoutSeconds: call.getDouble("cloakTimeoutSeconds") ?? 300,
                cloakZones: zones
            )
            call.resolve(AdaptiveLocationService.shared.currentState())
        } catch {
            call.reject("Unable to configure native location publishing", nil, error)
        }
    }

    @objc func foreground(_ call: CAPPluginCall) {
        AdaptiveLocationService.shared.applicationDidBecomeActive()
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
