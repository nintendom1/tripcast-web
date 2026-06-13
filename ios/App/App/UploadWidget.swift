import ActivityKit
import WidgetKit
import SwiftUI

struct UploadAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var status: String
        var progress: Double // 0.0 to 1.0
    }
    var name: String
}

@main
struct UploadWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: UploadAttributes.self) { context in
            // Lock screen / Notification UI
            VStack(alignment: .leading) {
                HStack {
                    Text("TripCast Pin")
                        .font(.caption)
                        .fontWeight(.bold)
                        .foregroundColor(.secondary)
                    Spacer()
                    Text("\(Int(context.state.progress * 100))%")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                Text(context.attributes.name)
                    .font(.headline)
                Text(context.state.status)
                    .font(.subheadline)
                    .foregroundColor(.secondary)

                ProgressView(value: context.state.progress)
                    .progressViewStyle(.linear)
                    .tint(.blue)
            }
            .padding()

        } dynamicIsland: { context in
            DynamicIsland {
                // Expanded UI
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: "mappin.circle.fill")
                        .foregroundColor(.blue)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text("\(Int(context.state.progress * 100))%")
                        .font(.caption)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading) {
                        Text(context.attributes.name)
                            .font(.headline)
                        Text(context.state.status)
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                    }
                }
            } compactLeading: {
                Image(systemName: "mappin.circle.fill")
                    .foregroundColor(.blue)
            } compactTrailing: {
                Text("\(Int(context.state.progress * 100))%")
                    .font(.caption)
            } minimal: {
                Image(systemName: "mappin.circle.fill")
                    .foregroundColor(.blue)
            }
        }
    }
}
