import Capacitor

@objc(BridgeViewController)
class BridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(ProvisioningProfilePlugin())
        bridge?.registerPluginInstance(AdaptiveLocationPlugin())
    }
}
