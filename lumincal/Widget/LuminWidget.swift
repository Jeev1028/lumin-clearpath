import SwiftUI
import WidgetKit

struct AgendaEntry: TimelineEntry {
    let date: Date
    /// Today's remaining items (all-day first, then by start time).
    let items: [AgendaItem]
    let done: Set<String>
    /// Checklist progress across the whole day, including blocks already finished.
    let checkTotal: Int
    let checkDone: Int
    /// False when the widget cannot open the app's shared storage.
    var linked = true
    /// False until the app has saved a day's agenda at least once.
    var hasData = true
}

struct AgendaProvider: TimelineProvider {
    func placeholder(in context: Context) -> AgendaEntry {
        let now = Date()
        return AgendaEntry(
            date: now,
            items: [
                AgendaItem(id: "p1", title: "Chemistry: chapter 4", start: now, end: now.addingTimeInterval(3600),
                           allDay: false, location: nil, source: .plan, colorHex: nil),
            ],
            done: [], checkTotal: 4, checkDone: 1)
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
        let todayAll = AgendaCache.load().filter { cal.isDateInToday($0.start) }
        let done = DoneStore.all()
        let upcoming = todayAll
            .filter { $0.allDay || $0.end >= now }
            .sorted { $0.allDay != $1.allDay ? $0.allDay : $0.start < $1.start }
        let checks = todayAll.filter { $0.checkable }
        return AgendaEntry(
            date: now, items: upcoming, done: done,
            checkTotal: checks.count, checkDone: checks.filter { done.contains($0.id) }.count,
            linked: Shared.hasGroup, hasData: AgendaCache.savedAt != nil)
    }
}

struct AgendaWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: AgendaEntry

    private var limit: Int { family == .systemSmall ? 3 : family == .systemMedium ? 4 : 9 }

    /// The next thing that still needs attention.
    private var next: AgendaItem? {
        entry.items.first { !$0.allDay && !entry.done.contains($0.id) }
            ?? entry.items.first { !entry.done.contains($0.id) }
    }

    private func time(_ d: Date) -> String { d.formatted(date: .omitted, time: .shortened) }

    /// What to show when there is nothing to list, and the real reason if the data is missing.
    private var emptyText: String {
        if !entry.linked { return "Can't reach the app's data. Open Lumin Cal > Settings." }
        if !entry.hasData { return "Open Lumin Cal once to load your day." }
        if entry.checkTotal > 0 && entry.checkDone == entry.checkTotal { return "All done. Nice work!" }
        return "Nothing left today"
    }

    var body: some View {
        switch family {
        case .accessoryInline: inline
        case .accessoryCircular: circular
        case .accessoryRectangular: rectangular
        default: home
        }
    }

    // MARK: Lock screen

    private var inline: some View {
        Group {
            if let n = next {
                Text("\(n.title) · \(time(n.start))")
            } else {
                Text(entry.linked && entry.hasData ? "Nothing left today" : "Open Lumin Cal")
            }
        }
        .containerBackground(.fill.tertiary, for: .widget)
    }

    private var circular: some View {
        Gauge(value: Double(entry.checkDone), in: 0...Double(max(entry.checkTotal, 1))) {
            Image(systemName: "checklist")
        } currentValueLabel: {
            Text("\(entry.checkDone)")
        }
        .gaugeStyle(.accessoryCircularCapacity)
        .containerBackground(.fill.tertiary, for: .widget)
    }

    private var rectangular: some View {
        VStack(alignment: .leading, spacing: 2) {
            if let n = next {
                Text(n.title).font(.headline).lineLimit(2).widgetAccentable()
                Text(n.allDay ? "All day" : "\(time(n.start)) – \(time(n.end))").font(.caption)
            } else {
                Text(emptyText).font(.caption).widgetAccentable()
            }
            if entry.checkTotal > 0 {
                Text("\(entry.checkDone) of \(entry.checkTotal) done").font(.caption2).foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .containerBackground(.fill.tertiary, for: .widget)
    }

    // MARK: Home screen

    private var home: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack {
                Text(entry.date.formatted(.dateTime.weekday(.wide).day().month()))
                    .font(.caption.bold()).foregroundStyle(Color(red: 0.36, green: 0.83, blue: 0.9))
                Spacer(minLength: 4)
                if entry.checkTotal > 0 {
                    Text("\(entry.checkDone)/\(entry.checkTotal)")
                        .font(.system(size: 10, weight: .bold))
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(Color.white.opacity(0.12), in: Capsule())
                }
            }
            if entry.items.isEmpty {
                Spacer()
                Text(emptyText)
                    .font(.footnote).foregroundStyle(.secondary)
                Spacer()
            }
            ForEach(entry.items.prefix(limit)) { item in
                HStack(spacing: 6) {
                    if item.checkable {
                        Image(systemName: entry.done.contains(item.id) ? "checkmark.circle.fill" : "circle")
                            .font(.system(size: 12))
                            .foregroundStyle(entry.done.contains(item.id) ? Color(red: 0.36, green: 0.83, blue: 0.9) : .secondary)
                    } else {
                        RoundedRectangle(cornerRadius: 1.5)
                            .fill(item.colorHex.flatMap { Color(hex: $0) } ?? Color(red: 0.31, green: 0.63, blue: 0.94))
                            .frame(width: 3, height: 22)
                    }
                    VStack(alignment: .leading, spacing: 0) {
                        Text(item.title).font(.caption.weight(.medium)).lineLimit(1)
                            .strikethrough(entry.done.contains(item.id))
                        if !item.allDay {
                            Text(time(item.start))
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
        .foregroundStyle(.white)
        .containerBackground(for: .widget) {
            LinearGradient(
                colors: [Color(red: 0.075, green: 0.137, blue: 0.29), Color(red: 0.039, green: 0.067, blue: 0.157)],
                startPoint: .top, endPoint: .bottom)
        }
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
        .supportedFamilies([
            .systemSmall, .systemMedium, .systemLarge,
            .accessoryRectangular, .accessoryInline, .accessoryCircular,
        ])
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
