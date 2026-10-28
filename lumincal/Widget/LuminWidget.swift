import AppIntents
import EventKit
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
    /// Overrides the empty text, e.g. when the pasted link failed.
    var note: String? = nil
}

/// The widget can load your day straight from the Lumin link, so it works even when the
/// app cannot share storage with it (some install methods do not grant App Groups).
struct LinkIntent: WidgetConfigurationIntent {
    static var title: LocalizedStringResource = "Lumin link"
    static var description = IntentDescription("Paste the widget link from Lumin Cal > Settings.")

    @Parameter(title: "Link")
    var link: String?
}

/// Apple Calendar events, read by the widget itself (needs calendar access granted to the app).
enum AppleEvents {
    static func today() -> [AgendaItem] {
        guard EKEventStore.authorizationStatus(for: .event) == .fullAccess else { return [] }
        let store = EKEventStore()
        let cal = Calendar.current
        let start = cal.startOfDay(for: Date())
        guard let end = cal.date(byAdding: .day, value: 1, to: start) else { return [] }
        let pred = store.predicateForEvents(withStart: start, end: end, calendars: nil)
        return store.events(matching: pred).map { e in
            var hex: String?
            if let c = e.calendar.cgColor {
                var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
                if UIColor(cgColor: c).getRed(&r, green: &g, blue: &b, alpha: &a) {
                    hex = String(format: "%02X%02X%02X", Int(r * 255), Int(g * 255), Int(b * 255))
                }
            }
            return AgendaItem(
                id: "apple-" + (e.eventIdentifier ?? UUID().uuidString),
                title: e.title ?? "(No title)", start: e.startDate, end: e.endDate,
                allDay: e.isAllDay, location: e.location, source: .apple, colorHex: hex)
        }
    }
}

enum RemoteFeed {
    private struct Response: Decodable {
        struct Item: Decodable {
            let id: String
            let kind: String
            let title: String
            let start: String
            let end: String
            let allDay: Bool
            let location: String?
        }
        let items: [Item]
    }

    private static func parse(_ s: String) -> Date? {
        if s.hasSuffix("Z") {
            let f = ISO8601DateFormatter()
            f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            return f.date(from: s) ?? ISO8601DateFormatter().date(from: s)
        }
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = .current
        f.dateFormat = s.count > 10 ? "yyyy-MM-dd'T'HH:mm" : "yyyy-MM-dd"
        return f.date(from: s)
    }

    static func fetch(_ link: String) async throws -> [AgendaItem] {
        var raw = link
        if raw.hasPrefix("webcal://") { raw = "https://" + raw.dropFirst("webcal://".count) }
        guard var comps = URLComponents(string: raw), comps.host != nil else { throw URLError(.badURL) }
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_CA")
        f.dateFormat = "yyyy-MM-dd"
        var q = (comps.queryItems ?? []).filter { !["format", "from", "days"].contains($0.name) }
        q += [
            URLQueryItem(name: "format", value: "json"),
            URLQueryItem(name: "from", value: f.string(from: Date())),
            URLQueryItem(name: "days", value: "2"),
        ]
        comps.queryItems = q
        guard let url = comps.url else { throw URLError(.badURL) }
        let (data, resp) = try await URLSession.shared.data(for: URLRequest(url: url, timeoutInterval: 20))
        guard (resp as? HTTPURLResponse)?.statusCode == 200 else { throw URLError(.badServerResponse) }
        return try JSONDecoder().decode(Response.self, from: data).items.compactMap { it in
            guard let s = parse(it.start), let e = parse(it.end) else { return nil }
            return AgendaItem(
                id: it.id, title: it.title, start: s, end: max(e, s), allDay: it.allDay,
                location: it.location, source: it.kind == "plan" ? .plan : .lumin, colorHex: nil)
        }
    }
}

struct AgendaProvider: AppIntentTimelineProvider {
    typealias Intent = LinkIntent

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

    func snapshot(for configuration: LinkIntent, in context: Context) async -> AgendaEntry {
        await current(configuration)
    }

    func timeline(for configuration: LinkIntent, in context: Context) async -> Timeline<AgendaEntry> {
        let entry = await current(configuration)
        // Refresh at the next item boundary or in 30 minutes, whichever is sooner.
        let next = entry.items.map { $0.end }.filter { $0 > Date() }.min()
        let refresh = min(next ?? .distantFuture, Date().addingTimeInterval(1800))
        return Timeline(entries: [entry], policy: .after(refresh))
    }

    private func current(_ cfg: LinkIntent) async -> AgendaEntry {
        let cal = Calendar.current
        let now = Date()
        var all: [AgendaItem] = []
        var linked = Shared.hasGroup
        var hasData = AgendaCache.savedAt != nil
        var note: String?
        let pasted = (cfg.link ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !pasted.isEmpty {
            do {
                all = try await RemoteFeed.fetch(pasted)
                linked = true
                hasData = true
            } catch {
                all = AgendaCache.load()
                note = "Couldn't load your link. Check it in Edit Widget."
            }
        } else {
            all = AgendaCache.load()
        }
        // Add today's Apple Calendar events, skipping ones the app already put in the cache.
        var seen = Set(all.map { "\($0.title.lowercased())|\($0.start.timeIntervalSince1970)" })
        for e in AppleEvents.today() where seen.insert("\(e.title.lowercased())|\(e.start.timeIntervalSince1970)").inserted {
            all.append(e)
            hasData = true
            linked = true
        }
        let todayAll = all.filter { cal.isDateInToday($0.start) }
        let done = DoneStore.all()
        let upcoming = todayAll
            .filter { $0.allDay || $0.end >= now }
            .sorted { $0.allDay != $1.allDay ? $0.allDay : $0.start < $1.start }
        let checks = todayAll.filter { $0.checkable }
        return AgendaEntry(
            date: now, items: upcoming, done: done,
            checkTotal: checks.count, checkDone: checks.filter { done.contains($0.id) }.count,
            linked: linked, hasData: hasData, note: note)
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
        if let n = entry.note { return n }
        if !entry.linked { return "Hold this widget > Edit Widget, then paste your link from Lumin Cal > Settings." }
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
        AppIntentConfiguration(kind: "LuminAgenda", intent: LinkIntent.self, provider: AgendaProvider()) { entry in
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
