import SwiftUI
import WidgetKit

struct ScheduleWidgetView: View {
    var entry: ScheduleEntry

    // Matches ClearPath's dark navy brand background (#0A1128) so the
    // widget reads as part of the same product on the home screen.
    private let background = Color(red: 0.039, green: 0.067, blue: 0.157)

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text("TODAY")
                .font(.caption2)
                .fontWeight(.bold)
                .tracking(1.2)
                .foregroundColor(.secondary)

            if entry.events.isEmpty {
                Spacer()
                Text("Nothing scheduled today")
                    .font(.footnote)
                    .foregroundColor(.secondary)
                Spacer()
            } else {
                ForEach(entry.events.prefix(5)) { event in
                    HStack(alignment: .top, spacing: 7) {
                        Circle()
                            .fill(Color.accentColor)
                            .frame(width: 6, height: 6)
                            .padding(.top, 5)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(event.title)
                                .font(.footnote)
                                .fontWeight(.medium)
                                .foregroundColor(.white)
                                .lineLimit(1)
                            Text([event.time, event.location].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                                .font(.caption2)
                                .foregroundColor(.secondary)
                                .lineLimit(1)
                        }
                        Spacer(minLength: 0)
                    }
                }
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(background)
    }
}

struct ScheduleWidget: Widget {
    let kind: String = "ScheduleWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: ScheduleTimelineProvider()) { entry in
            ScheduleWidgetView(entry: entry)
        }
        .configurationDisplayName("Today's Schedule")
        .description("Shows up to 5 of today's classes and events from ClearPath.")
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}
