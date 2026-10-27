import EventKit
import SwiftUI

@main
struct LuminCalendarApp: App {
    @StateObject private var store = CalendarStore()
    @Environment(\.scenePhase) private var phase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
                .task { await store.start() }
                .onChange(of: phase) { _, new in
                    if new == .active { Task { await store.reload() } }
                }
        }
    }
}

struct RootView: View {
    var body: some View {
        TabView {
            TodayView().tabItem { Label("Today", systemImage: "checklist") }
            MonthView().tabItem { Label("Calendar", systemImage: "calendar") }
            SettingsView().tabItem { Label("Settings", systemImage: "gearshape") }
        }
    }
}

// MARK: - Shared row

struct ItemRow: View {
    @EnvironmentObject var store: CalendarStore
    let item: AgendaItem

    var body: some View {
        HStack(spacing: 10) {
            if item.checkable {
                Button {
                    store.toggle(item)
                } label: {
                    Image(systemName: store.done.contains(item.id) ? "checkmark.circle.fill" : "circle")
                        .font(.title3)
                }
                .buttonStyle(.plain)
            } else {
                Circle()
                    .fill(item.colorHex.flatMap { Color(hex: $0) } ?? (item.source == .lumin ? .blue : .gray))
                    .frame(width: 10, height: 10)
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(item.title)
                    .strikethrough(store.done.contains(item.id))
                    .foregroundStyle(store.done.contains(item.id) ? .secondary : .primary)
                Text(timeText).font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private var timeText: String {
        var parts: [String] = []
        if item.allDay {
            parts.append("All day")
        } else {
            let f = DateFormatter()
            f.timeStyle = .short
            f.dateStyle = .none
            parts.append("\(f.string(from: item.start)) – \(f.string(from: item.end))")
        }
        if let l = item.location, !l.isEmpty { parts.append(l) }
        if item.source == .plan { parts.append("Study plan") }
        return parts.joined(separator: " · ")
    }
}

// MARK: - Today (checklist)

struct TodayView: View {
    @EnvironmentObject var store: CalendarStore
    @State private var editing: AgendaItem?
    @State private var adding = false

    private var today: [AgendaItem] {
        store.items.filter { Calendar.current.isDateInToday($0.start) || ($0.allDay && Calendar.current.isDateInToday($0.start)) }
    }

    var body: some View {
        NavigationStack {
            List {
                if let s = store.status { Text(s).font(.footnote).foregroundStyle(.orange) }
                let checks = today.filter { $0.checkable }
                if !checks.isEmpty {
                    Section("Checklist · \(checks.filter { store.done.contains($0.id) }.count)/\(checks.count) done") {
                        ForEach(checks) { ItemRow(item: $0) }
                    }
                }
                Section("Schedule") {
                    let rest = today.filter { !$0.checkable }
                    if rest.isEmpty { Text("Nothing scheduled.").foregroundStyle(.secondary) }
                    ForEach(rest) { item in
                        ItemRow(item: item).onTapGesture { if item.source == .apple { editing = item } }
                    }
                }
            }
            .refreshable { await store.reload() }
            .navigationTitle(Date.now.formatted(.dateTime.weekday(.wide).month().day()))
            .toolbar { Button { adding = true } label: { Image(systemName: "plus") } }
            .sheet(isPresented: $adding) { EventEditor(item: nil, day: Date()) }
            .sheet(item: $editing) { EventEditor(item: $0, day: $0.start) }
        }
    }
}

// MARK: - Month calendar

struct MonthView: View {
    @EnvironmentObject var store: CalendarStore
    @State private var selected = Date()
    @State private var editing: AgendaItem?
    @State private var adding = false

    private var cal: Calendar { Calendar.current }

    private func items(on day: Date) -> [AgendaItem] {
        store.items.filter { cal.isDate($0.start, inSameDayAs: day) }
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                MonthGrid(selected: $selected, hasItems: { !items(on: $0).isEmpty })
                    .padding(.horizontal)
                List {
                    let day = items(on: selected)
                    if day.isEmpty { Text("Nothing scheduled.").foregroundStyle(.secondary) }
                    ForEach(day) { item in
                        ItemRow(item: item).onTapGesture { if item.source == .apple { editing = item } }
                    }
                }
                .listStyle(.plain)
            }
            .navigationTitle(selected.formatted(.dateTime.month(.wide).year()))
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Today") { selected = Date() }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { adding = true } label: { Image(systemName: "plus") }
                }
            }
            .sheet(isPresented: $adding) { EventEditor(item: nil, day: selected) }
            .sheet(item: $editing) { EventEditor(item: $0, day: $0.start) }
        }
    }
}

struct MonthGrid: View {
    @Binding var selected: Date
    let hasItems: (Date) -> Bool
    private var cal: Calendar { Calendar.current }

    private var days: [Date?] {
        guard let interval = cal.dateInterval(of: .month, for: selected),
              let firstWeekday = Optional(cal.component(.weekday, from: interval.start)) else { return [] }
        let lead = (firstWeekday - cal.firstWeekday + 7) % 7
        let count = cal.range(of: .day, in: .month, for: selected)?.count ?? 30
        return Array(repeating: nil, count: lead)
            + (0..<count).map { cal.date(byAdding: .day, value: $0, to: interval.start) }
    }

    var body: some View {
        VStack {
            HStack {
                Button { shift(-1) } label: { Image(systemName: "chevron.left") }
                Spacer()
                Button { shift(1) } label: { Image(systemName: "chevron.right") }
            }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 7)) {
                ForEach(0..<7, id: \.self) { i in
                    Text(cal.veryShortWeekdaySymbols[(i + cal.firstWeekday - 1) % 7])
                        .font(.caption2).foregroundStyle(.secondary)
                }
                ForEach(Array(days.enumerated()), id: \.offset) { _, day in
                    if let day {
                        Button { selected = day } label: {
                            VStack(spacing: 2) {
                                Text("\(cal.component(.day, from: day))")
                                    .frame(width: 32, height: 32)
                                    .background(
                                        Circle().fill(
                                            cal.isDate(day, inSameDayAs: selected) ? Color.accentColor
                                                : cal.isDateInToday(day) ? Color.accentColor.opacity(0.2) : .clear)
                                    )
                                    .foregroundStyle(cal.isDate(day, inSameDayAs: selected) ? Color.white : Color.primary)
                                Circle().fill(hasItems(day) ? Color.accentColor : .clear).frame(width: 4, height: 4)
                            }
                        }
                        .buttonStyle(.plain)
                    } else {
                        Color.clear.frame(height: 38)
                    }
                }
            }
        }
    }

    private func shift(_ months: Int) {
        selected = cal.date(byAdding: .month, value: months, to: selected) ?? selected
    }
}

// MARK: - Event editor (writes to Apple Calendar)

struct EventEditor: View {
    @EnvironmentObject var store: CalendarStore
    @Environment(\.dismiss) private var dismiss

    let item: AgendaItem?
    let day: Date

    @State private var title = ""
    @State private var location = ""
    @State private var allDay = false
    @State private var start = Date()
    @State private var end = Date()
    @State private var calendarId: String?
    @State private var error: String?
    @State private var existing: EKEvent?

    var body: some View {
        NavigationStack {
            Form {
                TextField("Title", text: $title)
                TextField("Location", text: $location)
                Toggle("All day", isOn: $allDay)
                DatePicker("Starts", selection: $start, displayedComponents: allDay ? .date : [.date, .hourAndMinute])
                DatePicker("Ends", selection: $end, in: start..., displayedComponents: allDay ? .date : [.date, .hourAndMinute])
                Picker("Calendar", selection: $calendarId) {
                    ForEach(store.writableCalendars, id: \.calendarIdentifier) { c in
                        Text(c.title).tag(Optional(c.calendarIdentifier))
                    }
                }
                if let error { Text(error).foregroundStyle(.red).font(.footnote) }
                if existing != nil {
                    Button("Delete event", role: .destructive) {
                        if let e = existing {
                            do { try store.delete(e); dismiss() } catch { self.error = error.localizedDescription }
                        }
                    }
                }
            }
            .navigationTitle(item == nil ? "New event" : "Edit event")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }.disabled(title.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .onAppear(perform: load)
        }
    }

    private func load() {
        if let item, let e = store.event(for: item) {
            existing = e
            title = e.title ?? ""
            location = e.location ?? ""
            allDay = e.isAllDay
            start = e.startDate
            end = e.endDate
            calendarId = e.calendar.calendarIdentifier
        } else {
            let cal = Calendar.current
            let base = cal.isDateInToday(day) ? Date() : day
            start = cal.date(bySettingHour: max(cal.component(.hour, from: base) + 1, 9), minute: 0, second: 0, of: day) ?? day
            end = start.addingTimeInterval(3600)
            calendarId = store.defaultCalendar?.calendarIdentifier
        }
    }

    private func save() {
        let cal = store.writableCalendars.first { $0.calendarIdentifier == calendarId }
        do {
            try store.save(
                title: title.trimmingCharacters(in: .whitespaces), location: location,
                start: start, end: end, allDay: allDay, calendar: cal, editing: existing)
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - Settings

struct SettingsView: View {
    @EnvironmentObject var store: CalendarStore
    @State private var link = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Paste your Lumin calendar link", text: $link, axis: .vertical)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    Button("Save and sync") { Task { await store.setFeed(link) } }
                    if let s = store.status { Text(s).font(.footnote).foregroundStyle(.orange) }
                } header: {
                    Text("Lumin study plan")
                } footer: {
                    Text("On luminclearpath.ca open Schedule, then tap Copy subscription link, and paste it here. Your classes, due dates and study plan appear alongside your Apple Calendar.")
                }
                Section("Apple Calendar") {
                    Label(store.accessGranted ? "Connected: events can be read and edited" : "No access. Allow calendar access in Settings > Lumin Calendar.",
                          systemImage: store.accessGranted ? "checkmark.circle" : "exclamationmark.triangle")
                }
            }
            .navigationTitle("Settings")
            .onAppear { link = store.feedURL }
        }
    }
}
