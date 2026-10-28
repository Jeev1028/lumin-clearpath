import Foundation

/// Storage shared between the app and the widget (needs the App Group).
enum Shared {
    static let fallbackGroup = "group.ca.luminclearpath.calendar"

    /// SideStore and AltStore re-sign the app for your own team and rename the App Group
    /// (the team id gets appended). They record the real ids in the ALTAppGroups Info.plist
    /// key, so use whichever group the system actually lets us open.
    static let groupId: String = {
        let injected = Bundle.main.object(forInfoDictionaryKey: "ALTAppGroups") as? [String] ?? []
        for id in injected + [fallbackGroup] {
            if FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: id) != nil { return id }
        }
        return injected.first ?? fallbackGroup
    }()
    static var defaults: UserDefaults { UserDefaults(suiteName: groupId) ?? .standard }
    /// True when the app and widget really share storage (the App Group was granted).
    static var hasGroup: Bool {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: groupId) != nil
    }
    static let savedAtKey = "agendaSavedAt"
    static let feedKey = "feedURL"
    static let doneKey = "doneIds"
    static let agendaKey = "agendaJson"
}

enum ItemSource: String, Codable {
    case apple   // from the iPhone calendar (EventKit)
    case lumin   // classes, due dates and one-off events from Lumin
    case plan    // study-plan blocks (checklist items)
}

/// One thing on the calendar, from any source.
struct AgendaItem: Codable, Identifiable, Hashable {
    var id: String
    var title: String
    var start: Date
    var end: Date
    var allDay: Bool
    var location: String?
    var source: ItemSource
    /// Hex color of the Apple calendar it belongs to, if any.
    var colorHex: String?

    /// Study blocks and due dates can be ticked off.
    var checkable: Bool { source == .plan || id.hasPrefix("task-") }
}

enum DoneStore {
    static func all() -> Set<String> {
        Set(Shared.defaults.stringArray(forKey: Shared.doneKey) ?? [])
    }
    static func set(_ id: String, done: Bool) {
        var s = all()
        if done { s.insert(id) } else { s.remove(id) }
        Shared.defaults.set(Array(s), forKey: Shared.doneKey)
    }
}

enum AgendaCache {
    static func save(_ items: [AgendaItem]) {
        let enc = JSONEncoder()
        if let data = try? enc.encode(items) { Shared.defaults.set(data, forKey: Shared.agendaKey) }
        Shared.defaults.set(Date().timeIntervalSince1970, forKey: Shared.savedAtKey)
    }
    static var savedAt: Date? {
        let t = Shared.defaults.double(forKey: Shared.savedAtKey)
        return t > 0 ? Date(timeIntervalSince1970: t) : nil
    }
    static func load() -> [AgendaItem] {
        guard let data = Shared.defaults.data(forKey: Shared.agendaKey) else { return [] }
        return (try? JSONDecoder().decode([AgendaItem].self, from: data)) ?? []
    }
}
