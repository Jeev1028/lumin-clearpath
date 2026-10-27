import SwiftUI
import WidgetKit

struct AgendaEntry: TimelineEntry {
    let date: Date
    let items: [AgendaItem]
    let done: Set<String>
}

struct AgendaProvider: TimelineProvider {
    func placeholder(in context: Context) -> AgendaEntry {
        let now = Date()
        return AgendaEntry(date: now, items: [
            AgendaItem(id: "p1", title: "Chemistry: chapter 4", start: now, end: now.addingTimeInterval(3600),
                       allDay: false, location: nil, source: .plan, colorHex: nil),
        ], done: [])
    }

    func getSnapshot(in context: Context, completion: @escaping (AgendaEntry) -> Void) {
        completion(current())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<AgendaEntry>) -> Void) {
        let entry = current()
        // Refresh at the next item boundary or in 30 minutes, whichever is sooner.
        let next = entry.items.map { $0.end }.filter { $0 > Date() }.min()
        let refresh = min(next ?? .distantFuture, Date().addingTimeInterval(1800))
        completion(Timeline(entries: [entry], policy: .after(refresh)))
    }

    private func current() -> AgendaEntry {
        let cal = Calendar.current
        let now = Date()
        let today = AgendaCache.load()
            .filter { cal.isDateInToday($0.start) && ($0.allDay || $0.end >= now) }
            .sorted { $0.allDay != $1.allDay ? $0.allDay : $0.start < $1.start }
        return AgendaEntry(date: now, items: today, done: DoneStore.all())
    }
}

struct AgendaWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: AgendaEntry

    private var limit: Int { family == .systemSmall ? 3 : family == .systemMedium ? 4 : 9 }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(entry.date.formatted(.dateTime.weekday(.wide).day().month()))
                .font(.caption.bold()).foregroundStyle(.blue)
            if entry.items.isEmpty {
                Spacer()
                Text("Nothing left today").font(.footnote).foregroundStyle(.secondary)
                Spacer()
            }
            ForEach(entry.items.prefix(limit)) { item in
                HStack(spacing: 5) {
                    Image(systemName: item.checkable
                          ? (entry.done.contains(item.id) ? "checkmark.circle.fill" : "circle")
                          : "circle.fill")
                        .font(.system(size: item.checkable ? 11 : 6))
                        .foregroundStyle(item.colorHex.flatMap { Color(hex: $0) } ?? .blue)
                    VStack(alignment: .leading, spacing: 0) {
                        Text(item.title).font(.caption).lineLimit(1)
                            .strikethrough(entry.done.contains(item.id))
                        if !item.allDay {
                            Text(item.start.formatted(date: .omitted, time: .shortened))
                                .font(.system(size: 10)).foregroundStyle(.secondary)
                        }
                    }
                }
            }
            if entry.items.count > limit {
                Text("+\(entry.items.count - limit) more").font(.system(size: 10)).foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .containerBackground(.background, for: .widget)
    }
}

@main
struct LuminWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "LuminAgenda", provider: AgendaProvider()) { entry in
            AgendaWidgetView(entry: entry)
        }
        .configurationDisplayName("Today")
        .description("Your calendar events and study checklist for today.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

// Color(hex:) lives in the app target's CalendarStore; the widget needs its own copy.
extension Color {
    init?(hex: String) {
        var h = hex
        if h.hasPrefix("#") { h.removeFirst() }
        guard h.count == 6, let v = UInt32(h, radix: 16) else { return nil }
        self.init(red: Double((v >> 16) & 0xFF) / 255, green: Double((v >> 8) & 0xFF) / 255, blue: Double(v & 0xFF) / 255)
    }
}
