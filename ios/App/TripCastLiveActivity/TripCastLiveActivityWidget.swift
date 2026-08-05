import ActivityKit
import SwiftUI
import UIKit
import WidgetKit

@main
struct TripCastLiveActivityWidgetBundle: WidgetBundle {
    var body: some Widget {
        TripCastLiveActivityWidget()
    }
}

struct TripCastLiveActivityWidget: Widget {
    private static let iconImage: UIImage? = {
        guard let url = Bundle.main.url(forResource: "icon", withExtension: "png") else {
            return nil
        }
        return UIImage(contentsOfFile: url.path)
    }()

    var body: some WidgetConfiguration {
        ActivityConfiguration(for: TripCastLiveActivityAttributes.self) { context in
            HStack(spacing: 12) {
                brandedIcon(size: 36, health: context.state.health)
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
                    HStack(spacing: 7) {
                        brandedIcon(size: 24, health: context.state.health)
                        Text(title(context.state.mode))
                    }
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
                brandedIcon(size: 20, health: context.state.health)
            } compactTrailing: {
                compactTimer(context.state)
            } minimal: {
                brandedIcon(size: 20, health: context.state.health)
            }
        }
    }

    private func brandedIcon(size: CGFloat, health: String) -> some View {
        ZStack {
            RoundedRectangle(cornerRadius: size * 0.22, style: .continuous)
                .fill(Color(red: 0.12, green: 0.19, blue: 0.16))
            if let iconImage = Self.iconImage {
                Image(uiImage: iconImage)
                    .resizable()
                    .scaledToFit()
            } else {
                Text("TC")
                    .font(.system(size: size * 0.32, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
            }
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
            .accessibilityHidden(true)
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
