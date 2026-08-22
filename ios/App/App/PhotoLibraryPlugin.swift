import Capacitor
import Photos
import PhotosUI
import UIKit

@objc(PhotoLibraryPlugin)
public final class PhotoLibraryPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PhotoLibraryPlugin"
    public let jsName = "PhotoLibrary"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getAuthorizationStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "manageLimitedAccess", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openSettings", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getAssets", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getAssetIndex", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getThumbnails", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "prepareAsset", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelPrepare", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "endSession", returnType: CAPPluginReturnPromise)
    ]

    private let imageManager = PHCachingImageManager()
    private var fetchResult: PHFetchResult<PHAsset>?
    private var sessionId: String?
    private var prepareRequests: [String: PHImageRequestID] = [:]

    private func statusName(_ status: PHAuthorizationStatus) -> String {
        switch status {
        case .authorized: return "authorized"
        case .limited: return "limited"
        case .denied: return "denied"
        case .restricted: return "restricted"
        case .notDetermined: return "notDetermined"
        @unknown default: return "restricted"
        }
    }

    private func currentStatus() -> PHAuthorizationStatus {
        PHPhotoLibrary.authorizationStatus(for: .readWrite)
    }

    private func hasReadAccess() -> Bool {
        let status = currentStatus()
        return status == .authorized || status == .limited
    }

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["value": true])
    }

    @objc func getAuthorizationStatus(_ call: CAPPluginCall) {
        call.resolve(["status": statusName(currentStatus())])
    }

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        PHPhotoLibrary.requestAuthorization(for: .readWrite) { [weak self] status in
            guard let self else { return }
            call.resolve(["status": self.statusName(status)])
        }
    }

    @objc func manageLimitedAccess(_ call: CAPPluginCall) {
        guard currentStatus() == .limited else {
            call.resolve()
            return
        }
        DispatchQueue.main.async { [weak self] in
            guard let controller = self?.bridge?.viewController else {
                call.reject("Unable to present limited Photos access.")
                return
            }
            PHPhotoLibrary.shared().presentLimitedLibraryPicker(from: controller) { _ in
                call.resolve()
            }
        }
    }

    @objc func openSettings(_ call: CAPPluginCall) {
        guard let url = URL(string: UIApplication.openSettingsURLString) else {
            call.reject("Unable to open Settings.")
            return
        }
        DispatchQueue.main.async {
            UIApplication.shared.open(url) { opened in
                opened ? call.resolve() : call.reject("Unable to open Settings.")
            }
        }
    }

    @objc func startSession(_ call: CAPPluginCall) {
        guard hasReadAccess() else {
            call.reject("Photos access is required.")
            return
        }
        let options = PHFetchOptions()
        options.sortDescriptors = [NSSortDescriptor(key: "creationDate", ascending: false)]
        if let cutoffAtMs = call.getDouble("cutoffAtMs"), cutoffAtMs.isFinite {
            let cutoffDate = Date(timeIntervalSince1970: cutoffAtMs / 1000)
            options.predicate = NSPredicate(format: "creationDate >= %@", cutoffDate as NSDate)
        }
        let result = PHAsset.fetchAssets(with: .image, options: options)
        let nextSessionId = UUID().uuidString
        fetchResult = result
        sessionId = nextSessionId
        call.resolve(["sessionId": nextSessionId, "total": result.count])
    }

    @objc func getAssets(_ call: CAPPluginCall) {
        guard
            let expectedSessionId = sessionId,
            call.getString("sessionId") == expectedSessionId,
            let result = fetchResult
        else {
            call.reject("Photo session is not active.")
            return
        }
        let offset = max(0, call.getInt("offset") ?? 0)
        let limit = min(24, max(1, call.getInt("limit") ?? 24))
        guard offset < result.count else {
            call.resolve(["assets": [], "nextOffset": NSNull()])
            return
        }
        let end = min(result.count, offset + limit)
        var assets: [JSObject] = []
        for index in offset..<end {
            let asset = result.object(at: index)
            var item: JSObject = [
                "id": asset.localIdentifier,
                "pixelWidth": asset.pixelWidth,
                "pixelHeight": asset.pixelHeight
            ]
            if let date = asset.creationDate {
                item["capturedAt"] = date.timeIntervalSince1970 * 1000
            } else {
                item["capturedAt"] = NSNull()
            }
            if let location = asset.location {
                item["lat"] = location.coordinate.latitude
                item["lon"] = location.coordinate.longitude
            } else {
                item["lat"] = NSNull()
                item["lon"] = NSNull()
            }
            assets.append(item)
        }
        call.resolve([
            "assets": assets,
            "nextOffset": end < result.count ? end : NSNull()
        ])
    }

    @objc func getAssetIndex(_ call: CAPPluginCall) {
        guard
            let expectedSessionId = sessionId,
            call.getString("sessionId") == expectedSessionId,
            let result = fetchResult,
            let assetId = call.getString("assetId")
        else {
            call.reject("Photo session is not active or assetId is missing.")
            return
        }
        let matches = PHAsset.fetchAssets(withLocalIdentifiers: [assetId], options: nil)
        guard let asset = matches.firstObject else {
            call.resolve(["index": NSNull()])
            return
        }
        let index = result.index(of: asset)
        call.resolve(["index": index == NSNotFound ? NSNull() : index])
    }

    @objc func getThumbnails(_ call: CAPPluginCall) {
        let assetIds = call.getArray("assetIds", String.self) ?? []
        guard !assetIds.isEmpty && assetIds.count <= 5 else {
            call.reject("Request between 1 and 5 thumbnails.")
            return
        }
        let width = min(1200, max(120, call.getInt("pixelWidth") ?? 720))
        let height = min(1200, max(120, call.getInt("pixelHeight") ?? 540))
        let assets = PHAsset.fetchAssets(withLocalIdentifiers: assetIds, options: nil)
        let byId = Dictionary(uniqueKeysWithValues: (0..<assets.count).map {
            let asset = assets.object(at: $0)
            return (asset.localIdentifier, asset)
        })
        let group = DispatchGroup()
        let lock = NSLock()
        var output: [String: JSObject] = [:]
        for assetId in assetIds {
            guard let asset = byId[assetId] else {
                output[assetId] = ["id": assetId, "data": NSNull(), "isInCloud": false]
                continue
            }
            group.enter()
            let options = PHImageRequestOptions()
            options.deliveryMode = .fastFormat
            options.resizeMode = .fast
            options.isNetworkAccessAllowed = false
            imageManager.requestImage(
                for: asset,
                targetSize: CGSize(width: width, height: height),
                contentMode: .aspectFit,
                options: options
            ) { image, info in
                let degraded = info?[PHImageResultIsDegradedKey] as? Bool ?? false
                if degraded { return }
                let isInCloud = info?[PHImageResultIsInCloudKey] as? Bool ?? false
                let data = image?.jpegData(compressionQuality: 0.68)?.base64EncodedString()
                lock.lock()
                if output[assetId] != nil {
                    lock.unlock()
                    return
                }
                output[assetId] = [
                    "id": assetId,
                    "data": data ?? NSNull(),
                    "isInCloud": isInCloud
                ]
                lock.unlock()
                group.leave()
            }
        }
        group.notify(queue: .main) {
            call.resolve(["thumbnails": assetIds.compactMap { output[$0] }])
        }
    }

    @objc func prepareAsset(_ call: CAPPluginCall) {
        guard let assetId = call.getString("assetId") else {
            call.reject("assetId is required.")
            return
        }
        let assets = PHAsset.fetchAssets(withLocalIdentifiers: [assetId], options: nil)
        guard let asset = assets.firstObject else {
            call.reject("Photo is no longer available.")
            return
        }
        let networkAllowed = call.getBool("networkAccessAllowed") ?? false
        let options = PHImageRequestOptions()
        options.deliveryMode = .highQualityFormat
        options.resizeMode = .exact
        options.isNetworkAccessAllowed = networkAllowed
        options.progressHandler = { [weak self] progress, _, _, _ in
            self?.notifyListeners("downloadProgress", data: [
                "assetId": assetId,
                "progress": progress
            ])
        }
        let requestId = imageManager.requestImage(
            for: asset,
            targetSize: CGSize(width: 1280, height: 1280),
            contentMode: .aspectFit,
            options: options
        ) { [weak self] image, info in
            let degraded = info?[PHImageResultIsDegradedKey] as? Bool ?? false
            if degraded { return }
            self?.prepareRequests.removeValue(forKey: assetId)
            if let cancelled = info?[PHImageCancelledKey] as? Bool, cancelled {
                call.reject("Photo preparation was cancelled.")
                return
            }
            guard let image else {
                let isInCloud = info?[PHImageResultIsInCloudKey] as? Bool ?? false
                if isInCloud && !networkAllowed {
                    call.resolve(["status": "requiresDownload"])
                } else {
                    call.reject("Unable to prepare this photo.")
                }
                return
            }
            guard let data = image.jpegData(compressionQuality: 0.72) else {
                call.reject("Unable to encode this photo.")
                return
            }
            call.resolve([
                "status": "ready",
                "data": data.base64EncodedString(),
                "mimeType": "image/jpeg",
                "bytes": data.count,
                "width": Int(image.size.width * image.scale),
                "height": Int(image.size.height * image.scale)
            ])
        }
        prepareRequests[assetId] = requestId
    }

    @objc func cancelPrepare(_ call: CAPPluginCall) {
        guard let assetId = call.getString("assetId") else {
            call.reject("assetId is required.")
            return
        }
        if let requestId = prepareRequests.removeValue(forKey: assetId) {
            imageManager.cancelImageRequest(requestId)
        }
        call.resolve()
    }

    @objc func endSession(_ call: CAPPluginCall) {
        for requestId in prepareRequests.values {
            imageManager.cancelImageRequest(requestId)
        }
        prepareRequests.removeAll()
        imageManager.stopCachingImagesForAllAssets()
        fetchResult = nil
        sessionId = nil
        call.resolve()
    }
}
