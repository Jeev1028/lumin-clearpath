import EventKit
import SwiftUI
import WidgetKit

@MainActor
final class CalendarStore: ObservableObject {
    let ekStore = EKEventStore()

    @Published var items: [AgendaItem] = []
    @Published var done: Set<String> = DoneStore.all()
    @Published var accessGranted = false
    @Published var status: String?
    private var ekIds: [String: String] = [:]
    @Published var feedURL: String = Shared.defaults.string(forKey: Shared.feedKey) ?? ""

    /// How far around today to load.
    private let daysBack = 31
    private let daysForward = 90

    init() {
        NotificationCenter.default.addObserver(
            forName: .EKEventStoreChanged, object: ekStore, queue: .main
        ) { [weak self] _ in Task { @MainActor in await self?.reload() } }
    }

    func start() async {
        do {
            accessGranted = try await ekStore.requestFullAccessToEvents()
        } catch {
            accessGranted = false
        }
        await reload()
    }

    // MARK: Loading

    func reload() async {
        let cal = Calendar.current
        let from = cal.date(byAdding: .day, value: -daysBack, to: cal.startOfDay(for: Date()))!
        let to = cal.date(byAdding: .day, value: daysForward, to: cal.startOfDay(for: Date()))!

        var all: [AgendaItem] = []
        ekIds = [:]
        if accessGranted {
            let pred = ekStore.predicateForEvents(withStart: from, end: to, calendars: nil)
            for e in ekStore.events(matching: pred) {
                let itemId = "apple-" + (e.eventIdentifier ?? UUID().uuidString) + "@" + String(Int(e.startDate.timeIntervalSince1970))
                if let eid = e.eventIdentifier { ekIds[itemId] = eid }
                all.append(AgendaItem(
                    id: itemId,
                    title: e.title ?? "(No title)",
                    start: e.startDate, end: e.endDate, allDay: e.isAllDay,
                    location: e.location, source: .apple,
                    colorHex: e.calendar.cgColor.flatMap { Color(cgColor: $0).hex }
                ))
            }
        }
        all.append(contentsOf: await fetchLumin())

        // The same event can exist in Apple Calendar and Lumin (Google sync).
        var seen = Set<String>()
        items = all
            .sorted { $0.start < $1.start }
            .filter { seen.insert("\($0.title.lowercased())|\($0.start.timeIntervalSince1970)").inserted }

        AgendaCache.save(items.filter { $0.end >= from })
        WidgetCenter.shared.reloadAllTimelines()
    }

    private struct FeedResponse: Decodable {
        struct Item: Decodable {
            let id: String
            let kind: String
            let title: String
            let start: String
            let end: String
            let allDay: Bool
            let floating: Bool
            let location: String?
        }
        let items: [Item]
    }

    private func fetchLumin() async -> [AgendaItem] {
        var raw = feedURL.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !raw.isEmpty else { return [] }
        if raw.hasPrefix("webcal://") { raw = "https://" + raw.dropFirst("webcal://".count) }
        guard var comps = URLComponents(string: raw) else { return [] }
        let fmt = DateFormatter()
        fmt.dateFormat = "yyyy-MM-dd"
        fmt.locale = Locale(identifier: "en_CA")
        let start = Calendar.current.date(byAdding: .day, value: -7, to: Date())!
        var q = (comps.queryItems ?? []).filter { !["format", "from", "days"].contains($0.name) }
        q += [
            URLQueryItem(name: "format", value: "json"),
            URLQueryItem(name: "from", value: fmt.string(from: start)),
            URLQueryItem(name: "days", value: "60"),
        ]
        comps.queryItems = q
        guard let url = comps.url else { return [] }
        do {
            let (data, resp) = try await URLSession.shared.data(from: url)
            guard (resp as? HTTPURLResponse)?.statusCode == 200 else {
                status = "Lumin link was rejected. Copy a fresh one from the website."
                return []
            }
            let decoded = try JSONDecoder().decode(FeedResponse.self, from: data)
            status = nil
            return decoded.items.compactMap { it in
                guard let s = Self.parse(it.start, allDay: it.allDay, floating: it.floating),
                      var e = Self.parse(it.end, allDay: it.allDay, floating: it.floating) else { return nil }
                if it.allDay && e <= s { e = Calendar.current.date(byAdding: .day, value: 1, to: s) ?? s }
                return AgendaItem(
                    id: it.id, title: it.title, start: s, end: e, allDay: it.allDay,
                    location: it.location, source: it.kind == "plan" ? .plan : .lumin, colorHex: nil
                )
            }
        } catch {
            status = "Could not reach Lumin (offline?). Showing your calendar only."
            return []
        }
    }

    /// "2026-10-27T17:00" (local wall clock), "...Z" (UTC instant) or "2026-10-27".
    static func parse(_ s: String, allDay: Bool, floating: Bool) -> Date? {
        if s.hasSuffix("Z") {
            return ISO8601DateFormatter.withFraction.date(from: s) ?? ISO8601DateFormatter().date(from: s)
        }
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = .current
        f.dateFormat = s.count > 10 ? "yyyy-MM-dd'T'HH:mm" : "yyyy-MM-dd"
        return f.date(from: s)
    }

    // MARK: Checklist

    func toggle(_ item: AgendaItem) {
        let nowDone = !done.contains(item.id)
        DoneStore.set(item.id, done: nowDone)
        done = DoneStore.all()
        WidgetCenter.shared.reloadAllTimelines()
    }

    func setFeed(_ url: String) async {
        feedURL = url
        Shared.defaults.set(url, forKey: Shared.feedKey)
        await reload()
    }

    // MARK: Editing Apple Calendar events

    var writableCalendars: [EKCalendar] {
        ekStore.calendars(for: .event).filter { $0.allowsContentModifications }
    }

    var defaultCalendar: EKCalendar? { ekStore.defaultCalendarForNewEvents }

    func event(for item: AgendaItem) -> EKEvent? {
        guard item.source == .apple, let eid = ekIds[item.id] else { return nil }
        return ekStore.event(withIdentifier: eid)
    }

    func save(title: String, location: String, start: Date, end: Date, allDay: Bool,
              calendar: EKCalendar?, editing: EKEvent?) throws {
        let e = editing ?? EKEvent(eventStore: ekStore)
        e.title = title
        e.location = location.isEmpty ? nil : location
        e.isAllDay = allDay
        e.startDate = start
        e.endDate = max(end, start)
        if editing == nil { e.calendar = calendar ?? ekStore.defaultCalendarForNewEvents }
        else if let calendar { e.calendar = calendar }
        try ekStore.save(e, span: .thisEvent, commit: true)
    }

    func delete(_ event: EKEvent) throws {
        try ekStore.remove(event, span: .thisEvent, commit: true)
    }
}

extension ISO8601DateFormatter {
    static let withFraction: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
}

extension Color {
    init?(hex: String) {
        var h = hex
        if h.hasPrefix("#") { h.removeFirst() }
        guard h.count == 6, let v = UInt32(h, radix: 16) else { return nil }
        self.init(
            red: Double((v >> 16) & 0xFF) / 255,
            green: Double((v >> 8) & 0xFF) / 255,
            blue: Double(v & 0xFF) / 255
        )
    }

    var hex: String? {
        guard let c = UIColor(self).cgColor.components, c.count >= 3 else { return nil }
        return String(format: "%02X%02X%02X", Int(c[0] * 255), Int(c[1] * 255), Int(c[2] * 255))
    }
}
