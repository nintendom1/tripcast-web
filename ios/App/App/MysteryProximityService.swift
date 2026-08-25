import AVFoundation
import Capacitor
import CoreLocation
import Foundation
import UIKit

final class MysteryProximityService: NSObject, AVSpeechSynthesizerDelegate, @unchecked Sendable {
    static let shared = MysteryProximityService()

    private enum SpeechStatus: String, Codable { case queued, started }
    private enum PlaybackSource: String { case arrival, manual, test }
    private struct SpeechRecord: Codable {
        let missionID: String
        let narration: String
        var status: SpeechStatus
    }
    private struct PersistedState: Codable {
        var enabled = false
        var revision: Double = 0
        var missions: [NativeMysteryMission] = []
        var triggeredIDs: Set<String> = []
        var speech: [SpeechRecord] = []
        var muted = false
    }

    private let queue = DispatchQueue(label: "com.tripcast.mystery-proximity")
    private let synthesizer = AVSpeechSynthesizer()
    private var state = PersistedState()
    private var latestLocation: CLLocation?
    private var currentSpeechMissionID: String?
    private var currentNarration: String?
    private var currentPlaybackSource: PlaybackSource?
    private var currentUtterance: AVSpeechUtterance?
    private var playbackStatus = "idle"
    private var characterOffset = 0
    private var characterLength = 0
    private var liveActive = false
    var eventHandler: ((JSObject) -> Void)?

    private override init() {
        super.init()
        synthesizer.delegate = self
        state = loadState()
        for index in state.speech.indices where state.speech[index].status == .started {
            state.speech[index].status = .queued
        }
        persistLocked()
        queue.async { [weak self] in self?.speakNextLocked() }
        updateLiveActivity()
    }

    func accept(_ location: CLLocation) {
        queue.async { [weak self] in
            guard let self else { return }
            self.refreshSharedMuteLocked()
            self.liveActive = true
            self.latestLocation = location
            self.evaluateLocked(location)
        }
    }

    func setLiveActive(_ active: Bool) {
        queue.async { [weak self] in
            guard let self else { return }
            self.liveActive = active
            if active, let latestLocation = self.latestLocation {
                self.evaluateLocked(latestLocation)
            }
        }
    }

    func apply(sync: NativeMysteryMissionSync) {
        queue.async { [weak self] in
            guard let self else { return }
            self.refreshSharedMuteLocked()
            let incomingIDs = Set(sync.missions.map(\.mysteryMissionDocumentId))
            self.state.enabled = sync.enabled
            self.state.revision = sync.revision
            self.state.missions = sync.missions
            self.state.triggeredIDs.formIntersection(incomingIDs)
            self.state.speech.removeAll { !incomingIDs.contains($0.missionID) }
            self.persistLocked()
            self.emit("mystery:native:sync", details: [
                "enabled": sync.enabled,
                "missionCount": sync.missions.count,
                "revision": sync.revision
            ])
            if self.liveActive, let latestLocation = self.latestLocation {
                self.evaluateLocked(latestLocation)
            }
            self.updateLiveActivity()
        }
    }

    func apply(syncObject: [String: Any]) {
        guard JSONSerialization.isValidJSONObject(syncObject),
              let data = try? JSONSerialization.data(withJSONObject: syncObject),
              let sync = try? JSONDecoder().decode(NativeMysteryMissionSync.self, from: data) else {
            emit("mystery:native:sync", level: "warn", details: ["failureClass": "invalid-payload"])
            return
        }
        apply(sync: sync)
    }

    func currentState(completion: @escaping (JSObject) -> Void) {
        queue.async { [weak self] in
            guard let self else { return }
            let result: JSObject = [
                "enabled": self.state.enabled,
                "revision": self.state.revision,
                "missionCount": self.state.missions.count,
                "triggeredCount": self.state.triggeredIDs.count,
                "speechQueueDepth": self.state.speech.count,
                "muted": self.state.muted,
                "playback": self.playbackStateLocked()
            ]
            DispatchQueue.main.async { completion(result) }
        }
    }

    func setMuted(_ muted: Bool, completion: ((JSObject) -> Void)? = nil) {
        queue.async { [weak self] in
            guard let self else { return }
            self.state.muted = muted
            UserDefaults.standard.set(muted, forKey: MysteryAudioPreference.mutedKey)
            if muted {
                self.state.speech.removeAll()
                if self.currentPlaybackSource == .arrival {
                    self.stopCurrentPlaybackLocked()
                }
            }
            self.persistLocked()
            self.updateLiveActivity()
            self.emit("mystery:native:audio-preference", details: ["muted": muted])
            if let completion {
                DispatchQueue.main.async { completion(["muted": muted]) }
            }
        }
    }

    func testSpeech() {
        queue.async { [weak self] in
            guard let self, !self.state.muted, !self.synthesizer.isSpeaking,
                  self.currentSpeechMissionID == nil else { return }
            self.startPlaybackLocked(
                missionID: "test",
                narration: "Mystery Mission audio reveals are ready.",
                source: .test
            )
        }
    }

    func playbackState(completion: @escaping (JSObject) -> Void) {
        queue.async { [weak self] in
            guard let self else { return }
            let result = self.playbackStateLocked()
            DispatchQueue.main.async { completion(result) }
        }
    }

    func controlPlayback(
        action: String,
        missionID: String?,
        narration: String?,
        completion: @escaping (JSObject) -> Void
    ) {
        queue.async { [weak self] in
            guard let self else { return }
            switch action {
            case "pause":
                guard self.currentSpeechMissionID == missionID else { break }
                DispatchQueue.main.async { self.synthesizer.pauseSpeaking(at: .word) }
            case "play":
                if self.currentSpeechMissionID == missionID, self.playbackStatus == "paused" {
                    DispatchQueue.main.async { self.synthesizer.continueSpeaking() }
                } else if let missionID, let narration, !narration.isEmpty {
                    self.startPlaybackLocked(missionID: missionID, narration: narration, source: .manual)
                }
            case "restart":
                if let missionID, let narration, !narration.isEmpty {
                    self.startPlaybackLocked(missionID: missionID, narration: narration, source: .manual)
                }
            default:
                break
            }
            let result = self.playbackStateLocked()
            DispatchQueue.main.async { completion(result) }
        }
    }

    func completionAcknowledged(missionID: String, outcome: String) {
        emit("mystery:native:completion-ack", details: [
            "mysteryMissionId": missionID,
            "outcome": outcome
        ])
    }

    func clearIdentity() {
        queue.async { [weak self] in
            guard let self else { return }
            self.state = PersistedState(muted: self.state.muted)
            self.latestLocation = nil
            self.liveActive = false
            self.currentSpeechMissionID = nil
            self.currentNarration = nil
            self.currentPlaybackSource = nil
            self.currentUtterance = nil
            self.playbackStatus = "idle"
            try? FileManager.default.removeItem(at: self.stateURL)
            DispatchQueue.main.async {
                self.synthesizer.stopSpeaking(at: .immediate)
                try? AVAudioSession.sharedInstance().setActive(
                    false,
                    options: .notifyOthersOnDeactivation
                )
            }
            self.updateLiveActivity()
        }
    }

    private func refreshSharedMuteLocked() {
        guard UserDefaults.standard.object(forKey: MysteryAudioPreference.mutedKey) != nil else {
            return
        }
        let muted = UserDefaults.standard.bool(forKey: MysteryAudioPreference.mutedKey)
        guard muted != state.muted else { return }
        state.muted = muted
        if muted {
            state.speech.removeAll()
            if currentPlaybackSource == .arrival {
                stopCurrentPlaybackLocked()
            }
        }
        persistLocked()
        updateLiveActivity()
    }

    private func evaluateLocked(_ location: CLLocation) {
        guard state.enabled else { return }
        let arrivals = MysteryProximityEngine.arrivals(
            missions: state.missions,
            location: location,
            triggeredIDs: state.triggeredIDs
        )
        guard !arrivals.isEmpty else {
            var details: JSObject = [
                "candidateCount": state.missions.count,
                "accuracyMeters": location.horizontalAccuracy,
                "arrivalCount": 0
            ]
            if let nearest = state.missions.min(by: {
                location.distance(from: CLLocation(latitude: $0.lat, longitude: $0.lon)) <
                    location.distance(from: CLLocation(latitude: $1.lat, longitude: $1.lon))
            }) {
                let distance = location.distance(from: CLLocation(latitude: nearest.lat, longitude: nearest.lon))
                details["nearestMissionId"] = nearest.mysteryMissionDocumentId
                details["nearestDistanceMeters"] = Int(distance.rounded())
                details["nearestRadiusMeters"] = nearest.resolveRadiusMeters
                details["nearestArrivalMarginMeters"] = nearest.resolveRadiusMeters - distance - location.horizontalAccuracy
                details["nearestDebugOnly"] = nearest.isDebugOnly
            }
            emit("mystery:native:proximity", details: details)
            return
        }
        for arrival in arrivals {
            let mission = arrival.mission
            state.triggeredIDs.insert(mission.mysteryMissionDocumentId)
            if !state.muted {
                state.speech.append(.init(
                    missionID: mission.mysteryMissionDocumentId,
                    narration: mission.narration,
                    status: .queued
                ))
            }
            persistLocked() // The trigger must be durable before speech or network work.
            emit("mystery:native:proximity-arrival", details: [
                "mysteryMissionId": mission.mysteryMissionDocumentId,
                "stablePackId": mission.stablePackId,
                "distanceMeters": Int(arrival.distanceMeters.rounded()),
                "accuracyMeters": Int(location.horizontalAccuracy.rounded()),
                "speechQueueDepth": state.speech.count,
                "debugOnly": mission.isDebugOnly
            ])
            NativeLocationPublisher.shared.enqueueMysteryCompletion(
                missionID: mission.mysteryMissionDocumentId,
                triggerID: UUID().uuidString.lowercased(),
                debugArrival: mission.isDebugOnly
            )
            if UIApplication.shared.applicationState == .active {
                emit("mystery:native:arrival", details: [
                    "mysteryMissionId": mission.mysteryMissionDocumentId,
                    "linkedMissionId": mission.linkedMissionId,
                    "debugOnly": mission.isDebugOnly
                ])
            }
        }
        speakNextLocked()
    }

    private func speakNextLocked() {
        guard !state.muted, !synthesizer.isSpeaking,
              let index = state.speech.firstIndex(where: { $0.status == .queued }) else { return }
        state.speech[index].status = .started
        let narration = state.speech[index].narration
        persistLocked()
        startPlaybackLocked(
            missionID: state.speech[index].missionID,
            narration: narration,
            source: .arrival
        )
    }

    private func startPlaybackLocked(
        missionID: String,
        narration: String,
        source: PlaybackSource
    ) {
        do {
            let previousMissionID = currentSpeechMissionID
            let previousSource = currentPlaybackSource
            if source == .manual, previousSource == .arrival, let previousMissionID {
                if previousMissionID == missionID {
                    state.speech.removeAll { $0.missionID == previousMissionID }
                } else if let index = state.speech.firstIndex(where: { $0.missionID == previousMissionID }) {
                    state.speech[index].status = .queued
                }
                persistLocked()
            }
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(
                .playback,
                mode: .spokenAudio,
                options: [.duckOthers, .interruptSpokenAudioAndMixWithOthers]
            )
            try session.setActive(true)
            let utterance = AVSpeechUtterance(string: narration)
            utterance.voice = AVSpeechSynthesisVoice(language: Locale.preferredLanguages.first ?? "en-US")
            let previousUtterance = currentUtterance
            currentSpeechMissionID = missionID
            currentNarration = narration
            currentPlaybackSource = source
            currentUtterance = utterance
            playbackStatus = "playing"
            characterOffset = 0
            characterLength = 0
            emitPlaybackStateLocked()
            DispatchQueue.main.async {
                if previousUtterance != nil { self.synthesizer.stopSpeaking(at: .immediate) }
                self.synthesizer.speak(utterance)
            }
            emit("mystery:native:tts-start", details: [
                "mysteryMissionId": missionID,
                "speechQueueDepth": state.speech.count,
                "source": source.rawValue
            ])
        } catch {
            emit("mystery:native:tts-error", level: "warn", details: [
                "mysteryMissionId": missionID,
                "failureClass": "audio-session"
            ])
            if source == .arrival {
                finishSpeechLocked(missionID: missionID, success: false)
            } else {
                clearCurrentPlaybackLocked()
                try? AVAudioSession.sharedInstance().setActive(
                    false,
                    options: .notifyOthersOnDeactivation
                )
            }
        }
    }

    private func finishSpeechLocked(missionID: String, success: Bool) {
        let source = currentPlaybackSource
        if source == .arrival {
            state.speech.removeAll { $0.missionID == missionID }
        }
        clearCurrentPlaybackLocked()
        persistLocked()
        emit(success ? "mystery:native:tts-finish" : "mystery:native:tts-error", level: success ? "info" : "warn", details: [
            "mysteryMissionId": missionID,
            "speechQueueDepth": state.speech.count
        ])
        if state.speech.isEmpty {
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        } else {
            speakNextLocked()
        }
    }

    private func stopCurrentPlaybackLocked() {
        currentUtterance = nil
        clearCurrentPlaybackLocked()
        DispatchQueue.main.async {
            self.synthesizer.stopSpeaking(at: .immediate)
            try? AVAudioSession.sharedInstance().setActive(
                false,
                options: .notifyOthersOnDeactivation
            )
        }
    }

    private func clearCurrentPlaybackLocked() {
        currentSpeechMissionID = nil
        currentNarration = nil
        currentPlaybackSource = nil
        currentUtterance = nil
        playbackStatus = "idle"
        characterOffset = 0
        characterLength = 0
        emitPlaybackStateLocked()
    }

    private func playbackStateLocked() -> JSObject {
        [
            "state": playbackStatus,
            "missionId": currentSpeechMissionID ?? NSNull(),
            "source": currentPlaybackSource?.rawValue ?? NSNull(),
            "characterOffset": characterOffset,
            "characterLength": characterLength,
            "totalCharacters": currentNarration?.utf16.count ?? 0
        ]
    }

    private func emitPlaybackStateLocked() {
        emit("mystery:native:playback-state", details: playbackStateLocked())
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        queue.async { [weak self] in
            guard let self, self.currentUtterance === utterance,
                  let id = self.currentSpeechMissionID else { return }
            self.finishSpeechLocked(missionID: id, success: true)
        }
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        queue.async { [weak self] in
            guard let self, self.currentUtterance === utterance,
                  let id = self.currentSpeechMissionID else { return }
            self.finishSpeechLocked(missionID: id, success: false)
        }
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didPause utterance: AVSpeechUtterance) {
        queue.async { [weak self] in
            guard let self, self.currentUtterance === utterance else { return }
            self.playbackStatus = "paused"
            self.emitPlaybackStateLocked()
        }
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didContinue utterance: AVSpeechUtterance) {
        queue.async { [weak self] in
            guard let self, self.currentUtterance === utterance else { return }
            self.playbackStatus = "playing"
            self.emitPlaybackStateLocked()
        }
    }

    func speechSynthesizer(
        _ synthesizer: AVSpeechSynthesizer,
        willSpeakRangeOfSpeechString characterRange: NSRange,
        utterance: AVSpeechUtterance
    ) {
        queue.async { [weak self] in
            guard let self, self.currentUtterance === utterance else { return }
            self.characterOffset = characterRange.location
            self.characterLength = characterRange.length
            self.emitPlaybackStateLocked()
        }
    }

    private func updateLiveActivity() {
        LiveActivityController.shared.setMysteryNarration(available: state.enabled, muted: state.muted)
    }

    private var stateURL: URL {
        let root = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let directory = root.appendingPathComponent("TripCastNativeLocation", isDirectory: true)
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try? FileManager.default.setAttributes(
            [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
            ofItemAtPath: directory.path
        )
        return directory.appendingPathComponent("mystery-proximity.json")
    }

    private func persistLocked() {
        guard let data = try? JSONEncoder().encode(state) else { return }
        try? data.write(to: stateURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    private func loadState() -> PersistedState {
        guard let data = try? Data(contentsOf: stateURL) else { return PersistedState() }
        return (try? JSONDecoder().decode(PersistedState.self, from: data)) ?? PersistedState()
    }

    private func emit(_ action: String, level: String = "info", details: JSObject) {
        let event: JSObject = ["action": action, "level": level, "details": details]
        DispatchQueue.main.async { [weak self] in self?.eventHandler?(event) }
    }
}
