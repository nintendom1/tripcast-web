import Capacitor
import Foundation
import UIKit

@objc(AdaptiveLocationPlugin)
public final class AdaptiveLocationPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AdaptiveLocationPlugin"
    public let jsName = "AdaptiveLocation"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "configurePublishing", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "foreground", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setHighFrequencyActive", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getLocalTrailSnapshot", returnType: CAPPluginReturnPromise)
    ]

    public override func load() {
        AdaptiveLocationService.shared.eventHandler = { [weak self] event in
            self?.notifyListeners("locationUpdate", data: event, retainUntilConsumed: true)
        }
    }

    @objc func start(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            AdaptiveLocationService.shared.startLive(trigger: call.getString("trigger") ?? "javascript") { state in
                call.resolve(state)
            }
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        let preserveSamples = call.getString("pendingSamples") == "preserve"
        DispatchQueue.main.async {
            AdaptiveLocationService.shared.stopLive(
                clearCredentials: call.getBool("clearCredentials") ?? false,
                preserveSamples: preserveSamples
            ) { state in call.resolve(state) }
        }
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
        DispatchQueue.main.async {
            AdaptiveLocationService.shared.configurePublishing(
                endpoint: endpoint,
                token: token,
                liveTrailEnabled: call.getBool("liveTrailEnabled") ?? false,
                movementDetectionEnabled: call.getBool("movementDetectionEnabled") ?? false,
                emissionIntervalSeconds: call.getInt("emissionIntervalSeconds") ?? 15,
                alertThresholdSeconds: call.getDouble("alertThresholdSeconds") ?? 120,
                cloakTimeoutSeconds: call.getDouble("cloakTimeoutSeconds") ?? 300,
                cloakZones: zones
            ) { result in
                switch result {
                case .success(let state): call.resolve(state)
                case .failure(let error):
                    call.reject("Unable to configure native location publishing", nil, error)
                }
            }
        }
    }

    @objc func foreground(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            AdaptiveLocationService.shared.applicationDidBecomeActive { state in call.resolve(state) }
        }
    }

    @objc func setHighFrequencyActive(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            AdaptiveLocationService.shared.setHighFrequencyActive(call.getBool("active") ?? false)
            call.resolve(AdaptiveLocationService.shared.currentState())
        }
    }

    @objc func getState(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve(AdaptiveLocationService.shared.currentState())
        }
    }

    @objc func getLocalTrailSnapshot(_ call: CAPPluginCall) {
        guard UIApplication.shared.applicationState == .active else {
            call.reject("Local trail snapshots are foreground-only")
            return
        }
        AdaptiveLocationService.shared.localTrailSnapshot { snapshot in call.resolve(snapshot) }
    }
}
