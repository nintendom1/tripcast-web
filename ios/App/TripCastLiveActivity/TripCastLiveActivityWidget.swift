import ActivityKit
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
                Circle()
                    .fill(statusColor(context.state.health))
                    .frame(width: 12, height: 12)
                VStack(alignment: .leading, spacing: 3) {
                    Text(title(context.state.mode))
                        .font(.headline)
                    statusText(context.state)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                if context.state.queueDepth > 0 {
                    Text("\(context.state.queueDepth) queued")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .padding()
            .activityBackgroundTint(Color.black.opacity(0.86))
            .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label(title(context.state.mode), systemImage: "location.fill")
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Circle()
                        .fill(statusColor(context.state.health))
                        .frame(width: 10, height: 10)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        statusText(context.state)
                        Spacer()
                        if context.state.queueDepth > 0 {
                            Text("\(context.state.queueDepth) queued")
                        }
                    }
                    .font(.caption)
                }
            } compactLeading: {
                Image(systemName: "location.fill")
                    .foregroundStyle(statusColor(context.state.health))
            } compactTrailing: {
                compactTimer(context.state)
            } minimal: {
                Circle()
                    .fill(statusColor(context.state.health))
                    .frame(width: 10, height: 10)
            }
        }
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

    @ViewBuilder
    private func statusText(_ state: TripCastLiveActivityAttributes.ContentState) -> some View {
        if state.mode == "power-saving" || state.mode == "privacy" || state.lastAcknowledgedAt == nil {
            Text(state.message)
        } else if let date = state.lastAcknowledgedAt {
            HStack(spacing: 4) {
                Text("Shared")
                Text(date, style: .relative)
                if state.health == "stale" { Text("· Open TripCast") }
            }
        }
    }

    @ViewBuilder
    private func compactTimer(_ state: TripCastLiveActivityAttributes.ContentState) -> some View {
        if let date = state.lastAcknowledgedAt,
           state.mode != "power-saving", state.mode != "privacy" {
            Text(date, style: .relative)
                .monospacedDigit()
        } else {
            Image(systemName: state.mode == "power-saving" ? "leaf.fill" : "eye.slash.fill")
        }
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
