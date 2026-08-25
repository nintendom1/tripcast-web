import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

@main
struct TripCastLiveActivityWidgetBundle: WidgetBundle {
    var body: some Widget {
        TripCastLiveActivityWidget()
    }
}

struct TripCastLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: TripCastLiveActivityAttributes.self) { context in
            HStack(spacing: 12) {
                brandedIcon(size: 36, health: context.state.health)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 3) {
                    Text(title(context.state.mode))
                        .font(.headline)
                    statusLines(context.state)
                }
                Spacer()
                if #available(iOS 17.0, *), context.state.narrationAvailable {
                    mysteryAudioButton(context.state)
                }
            }
            .padding()
            .activityBackgroundTint(Color.black.opacity(0.86))
            .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 7) {
                        brandedIcon(size: 24, health: context.state.health)
                            .accessibilityHidden(true)
                        Text(title(context.state.mode))
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if #available(iOS 17.0, *), context.state.narrationAvailable {
                        mysteryAudioButton(context.state)
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    expandedStatusLines(context.state)
                }
            } compactLeading: {
                accessibleBrandedIcon(size: 20, state: context.state)
            } compactTrailing: {
                EmptyView()
            } minimal: {
                accessibleBrandedIcon(size: 20, state: context.state)
            }
        }
    }

    @available(iOS 17.0, *)
    private func mysteryAudioButton(
        _ state: TripCastLiveActivityAttributes.ContentState
    ) -> some View {
        Button(intent: SetMysteryAudioMutedIntent(muted: !state.mysteryAudioMuted)) {
            Image(systemName: state.mysteryAudioMuted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                .frame(width: 30, height: 30)
        }
        .buttonStyle(.bordered)
        .tint(.white.opacity(0.18))
        .accessibilityLabel(state.mysteryAudioMuted ? "Unmute Mystery audio" : "Mute Mystery audio")
    }

    private func accessibleBrandedIcon(
        size: CGFloat,
        state: TripCastLiveActivityAttributes.ContentState
    ) -> some View {
        brandedIcon(size: size, health: state.health)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Text(accessibilitySummary(state)))
    }

    private func brandedIcon(size: CGFloat, health: String) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.22, style: .continuous)
                .fill(Color(red: 0.05, green: 0.01, blue: 0.31))
            Image(systemName: "mappin.circle.fill")
                .resizable()
                .scaledToFit()
                .symbolRenderingMode(.palette)
                .foregroundStyle(
                    Color(red: 1.0, green: 0.09, blue: 0.03),
                    Color(red: 0.05, green: 0.01, blue: 0.31)
                )
                .padding(size * 0.12)
            Image("TripCastIcon", bundle: .main)
                .resizable()
                .renderingMode(.original)
                .scaledToFit()
        }
            .frame(width: size, height: size)
            .clipShape(RoundedRectangle(cornerRadius: size * 0.22, style: .continuous))
            .overlay(alignment: .bottomTrailing) {
                Circle()
                    .fill(statusColor(health))
                    .frame(width: max(6, size * 0.28), height: max(6, size * 0.28))
                    .overlay {
                        Circle().stroke(.black.opacity(0.65), lineWidth: 1)
                    }
            }
            .unredacted()
    }

    private func title(_ mode: String) -> String {
        switch mode {
        case "power-saving": return "Power Saving"
        case "privacy": return "Privacy pause"
        case "recovering": return "Recovering"
        case "precise": return "TripCast Live"
        default: return "TripCast"
        }
    }

    private func statusLines(_ state: TripCastLiveActivityAttributes.ContentState) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            primaryStatus(state)
                .font(.subheadline)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
            if let date = state.lastAcknowledgedAt, state.mode != "privacy" {
                (Text("Server confirmed ") + Text(date, style: .relative) + Text(" ago"))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
            }
        }
    }

    private func expandedStatusLines(
        _ state: TripCastLiveActivityAttributes.ContentState
    ) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(state.message)
                .font(.subheadline)
                .lineLimit(1)
                .minimumScaleFactor(0.75)
            if let date = state.lastAcknowledgedAt,
               state.mode == "recovering" || state.health == "stale" {
                (Text("Server confirmed ") + Text(date, style: .relative) + Text(" ago"))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
            }
        }
    }

    @ViewBuilder
    private func primaryStatus(_ state: TripCastLiveActivityAttributes.ContentState) -> some View {
        if state.mode == "privacy" {
            Text("Location hidden")
        } else if state.mode == "recovering" {
            Text(state.queueDepth > 0 ? "\(state.queueDepth) breadcrumbs queued" : "Reconnecting…")
        } else if let motionState = state.motionState,
                  let motionStartedAt = state.motionStartedAt,
                  let motionLabel = motionLabel(motionState) {
            Text("\(motionLabel) for ") + Text(motionStartedAt, style: .relative)
        } else {
            Text(state.message)
        }
    }

    private func motionLabel(_ motionState: String) -> String? {
        switch motionState {
        case "stationary": return "Stationary"
        case "walking": return "Walking"
        case "running": return "Running"
        case "cycling": return "Cycling"
        case "automotive": return "In a vehicle"
        default: return nil
        }
    }

    private func accessibilitySummary(
        _ state: TripCastLiveActivityAttributes.ContentState
    ) -> String {
        "\(title(state.mode)), \(state.message)"
    }

    private func statusColor(_ health: String) -> Color {
        switch health {
        case "healthy": return .green
        case "warning": return .orange
        case "stale": return .red
        default: return .blue
        }
    }
}
