import Foundation
import WidgetKit

/// One row shown in the widget. Matches the shape of the objects
/// src/lib/schedule-widget.ts serializes on the JS side (title/time/
/// location), sent over as a single JSON string by ScheduleWidgetPlugin.
struct ScheduleWidgetEvent: Codable, Identifiable {
    var id: String { title + time }
    let title: String
    let time: String
    let location: String?
}

/// Reads what ScheduleWidgetPlugin (see
/// ios/ios/App/App/ScheduleWidgetPlugin.swift) last wrote to the shared
/// App Group storage. This extension and the main app both need the
/// "App Groups" capability enabled in Xcode, sharing this same group id,
/// or this will always read nothing (loadEvents returns [] rather than
/// crashing if that's not set up yet).
enum ScheduleWidgetStore {
    static let appGroupId = "group.ca.luminclearpath.ios"
    static let storageKey = "todayEventsJson"

    static func loadEvents() -> [ScheduleWidgetEvent] {
        guard let defaults = UserDefaults(suiteName: appGroupId),
              let jsonString = defaults.string(forKey: storageKey),
              let data = jsonString.data(using: .utf8),
              let events = try? JSONDecoder().decode([ScheduleWidgetEvent].self, from: data) else {
            return []
        }
        return Array(events.prefix(5))
    }
}

struct ScheduleEntry: TimelineEntry {
    let date: Date
    let events: [ScheduleWidgetEvent]
}

struct ScheduleTimelineProvider: TimelineProvider {
    func placeholder(in context: Context) -> ScheduleEntry {
        ScheduleEntry(
            date: Date(),
            events: [
                ScheduleWidgetEvent(title: "Math", time: "9:00 AM – 10:00 AM", location: "Room 204"),
                ScheduleWidgetEvent(title: "English", time: "10:15 AM – 11:15 AM", location: nil),
            ]
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (ScheduleEntry) -> Void) {
        completion(ScheduleEntry(date: Date(), events: ScheduleWidgetStore.loadEvents()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<ScheduleEntry>) -> Void) {
        let entry = ScheduleEntry(date: Date(), events: ScheduleWidgetStore.loadEvents())
        // The app pushes a fresh update on every load/schedule change (see
        // ScheduleWidgetPlugin + syncScheduleWidget), so this hourly
        // refresh is just a fallback -- it mainly matters for rolling over
        // to a new day if the app hasn't been opened since midnight.
        let nextRefresh = Calendar.current.date(byAdding: .hour, value: 1, to: Date()) ?? Date().addingTimeInterval(3600)
        completion(Timeline(entries: [entry], policy: .after(nextRefresh)))
    }
}
