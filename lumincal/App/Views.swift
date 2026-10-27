import EventKit
import SwiftUI

@main
struct LuminCalendarApp: App {
    @StateObject private var store = CalendarStore()
    @Environment(\.scenePhase) private var phase

    init() {
        let bar = UITabBarAppearance()
        bar.configureWithTransparentBackground()
        bar.backgroundColor = UIColor(Theme.background.opacity(0.92))
        UITabBar.appearance().standardAppearance = bar
        UITabBar.appearance().scrollEdgeAppearance = bar
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
                .tint(Theme.primary)
                .preferredColorScheme(.dark)
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

// MARK: - Shared pieces

struct ScreenHeader: View {
    let title: String
    var subtitle: String?
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).font(.system(size: 30, weight: .bold)).foregroundStyle(.white)
            if let subtitle { Text(subtitle).font(.subheadline).foregroundStyle(Theme.muted) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct SectionTitle: View {
    let text: String
    var trailing: String?
    var body: some View {
        HStack {
            Text(text).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.accent)
            Spacer()
            if let trailing { Text(trailing).font(.caption).foregroundStyle(Theme.muted) }
        }
    }
}

struct ItemRow: View {
    @EnvironmentObject var store: CalendarStore
    let item: AgendaItem

    private var isDone: Bool { store.done.contains(item.id) }

    var body: some View {
        HStack(spacing: 12) {
            if item.checkable {
                Button {
                    store.toggle(item)
                } label: {
                    Image(systemName: isDone ? "checkmark.circle.fill" : "circle")
                        .font(.title2)
                        .foregroundStyle(isDone ? Theme.accent : Theme.muted)
                }
                .buttonStyle(.plain)
            } else {
                RoundedRectangle(cornerRadius: 2)
                    .fill(item.colorHex.flatMap { Color(hex: $0) } ?? (item.source == .lumin ? Theme.primary : Theme.muted))
                    .frame(width: 4, height: 34)
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(item.title)
                    .font(.body.weight(.medium))
                    .strikethrough(isDone)
                    .foregroundStyle(isDone ? Theme.muted : .white)
                    .lineLimit(2)
                Text(timeText).font(.caption).foregroundStyle(Theme.muted).lineLimit(1)
            }
            Spacer(minLength: 0)
        }
        .padding(.vertical, 6)
        .contentShape(Rectangle())
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
        return parts.joined(separator: " · ")
    }
}

/// A card listing rows with thin dividers.
struct ItemCard: View {
    let items: [AgendaItem]
    var empty = "Nothing scheduled."
    var onTap: (AgendaItem) -> Void = { _ in }

    var body: some View {
        VStack(spacing: 0) {
            if items.isEmpty {
                Text(empty).font(.subheadline).foregroundStyle(Theme.muted)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                ItemRow(item: item).onTapGesture { onTap(item) }
                if index < items.count - 1 { Divider().overlay(Theme.border) }
            }
        }
        .card()
    }
}

struct SignInCard: View {
    @EnvironmentObject var store: CalendarStore
    @State private var busy = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Image("Logo").resizable().frame(width: 44, height: 44)
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                VStack(alignment: .leading, spacing: 2) {
                    Text("Add your study plan").font(.headline).foregroundStyle(.white)
                    Text("Sign in with your Lumin account to bring in your classes, due dates and AI study plan.")
                        .font(.footnote).foregroundStyle(Theme.muted)
                }
            }
            Button {
                busy = true
                Task { await store.signIn(); busy = false }
            } label: {
                Text(busy ? "Signing in…" : "Sign in to Lumin")
                    .font(.headline).frame(maxWidth: .infinity).padding(.vertical, 12)
                    .background(
                        LinearGradient(colors: [Theme.primary, Theme.accent], startPoint: .leading, endPoint: .trailing),
                        in: RoundedRectangle(cornerRadius: 14))
                    .foregroundStyle(Theme.background)
            }
            .disabled(busy)
        }
        .card()
    }
}

// MARK: - Today (checklist)

struct TodayView: View {
    @EnvironmentObject var store: CalendarStore
    @State private var editing: AgendaItem?
    @State private var adding = false

    private var today: [AgendaItem] {
        store.items.filter { Calendar.current.isDateInToday($0.start) }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    HStack(alignment: .top) {
                        ScreenHeader(
                            title: Date.now.formatted(.dateTime.weekday(.wide)),
                            subtitle: Date.now.formatted(.dateTime.month(.wide).day().year()))
                        Button { adding = true } label: {
                            Image(systemName: "plus").font(.title3.weight(.semibold))
                                .frame(width: 40, height: 40)
                                .background(Theme.card, in: Circle())
                                .overlay(Circle().stroke(Theme.border))
                        }
                    }
                    if let s = store.status {
                        Text(s).font(.footnote).foregroundStyle(.orange).frame(maxWidth: .infinity, alignment: .leading)
                    }
                    if !store.isSignedIn { SignInCard() }

                    let checks = today.filter { $0.checkable }
                    if !checks.isEmpty {
                        SectionTitle(
                            text: "Checklist",
                            trailing: "\(checks.filter { store.done.contains($0.id) }.count) of \(checks.count) done")
                        ItemCard(items: checks)
                    }
                    SectionTitle(text: "Schedule")
                    ItemCard(items: today.filter { !$0.checkable }) { if $0.source == .apple { editing = $0 } }
                }
                .padding(.horizontal, 18)
                .padding(.bottom, 24)
            }
            .refreshable { await store.reload() }
            .background(NightBackground())
            .toolbar(.hidden, for: .navigationBar)
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
            ScrollView {
                VStack(spacing: 16) {
                    HStack(alignment: .top) {
                        ScreenHeader(title: selected.formatted(.dateTime.month(.wide)), subtitle: selected.formatted(.dateTime.year()))
                        Button("Today") { selected = Date() }
                            .font(.subheadline.weight(.semibold))
                            .padding(.horizontal, 14).frame(height: 40)
                            .background(Theme.card, in: Capsule()).overlay(Capsule().stroke(Theme.border))
                        Button { adding = true } label: {
                            Image(systemName: "plus").font(.title3.weight(.semibold))
                                .frame(width: 40, height: 40)
                                .background(Theme.card, in: Circle()).overlay(Circle().stroke(Theme.border))
                        }
                    }
                    MonthGrid(selected: $selected, hasItems: { !items(on: $0).isEmpty }).card()
                    SectionTitle(text: selected.formatted(.dateTime.weekday(.wide).month().day()))
                    ItemCard(items: items(on: selected)) { if $0.source == .apple { editing = $0 } }
                }
                .padding(.horizontal, 18)
                .padding(.bottom, 24)
            }
            .refreshable { await store.reload() }
            .background(NightBackground())
            .toolbar(.hidden, for: .navigationBar)
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
        guard let interval = cal.dateInterval(of: .month, for: selected) else { return [] }
        let firstWeekday = cal.component(.weekday, from: interval.start)
        let lead = (firstWeekday - cal.firstWeekday + 7) % 7
        let count = cal.range(of: .day, in: .month, for: selected)?.count ?? 30
        return Array(repeating: nil, count: lead)
            + (0..<count).map { cal.date(byAdding: .day, value: $0, to: interval.start) }
    }

    var body: some View {
        VStack(spacing: 8) {
            HStack {
                Button { shift(-1) } label: { Image(systemName: "chevron.left") }
                Spacer()
                Button { shift(1) } label: { Image(systemName: "chevron.right") }
            }
            .foregroundStyle(Theme.muted)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible()), count: 7), spacing: 4) {
                ForEach(0..<7, id: \.self) { i in
                    Text(cal.veryShortWeekdaySymbols[(i + cal.firstWeekday - 1) % 7])
                        .font(.caption2.weight(.semibold)).foregroundStyle(Theme.muted)
                }
                ForEach(Array(days.enumerated()), id: \.offset) { _, day in
                    if let day {
                        let isSel = cal.isDate(day, inSameDayAs: selected)
                        Button { selected = day } label: {
                            VStack(spacing: 2) {
                                Text("\(cal.component(.day, from: day))")
                                    .font(.callout)
                                    .frame(width: 34, height: 34)
                                    .background(
                                        Circle().fill(
                                            isSel ? Theme.primary
                                                : cal.isDateInToday(day) ? Theme.primary.opacity(0.25) : .clear))
                                    .foregroundStyle(isSel ? Theme.background : .white)
                                Circle().fill(hasItems(day) ? Theme.accent : .clear).frame(width: 4, height: 4)
                            }
                        }
                        .buttonStyle(.plain)
                    } else {
                        Color.clear.frame(height: 40)
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
                Section {
                    TextField("Title", text: $title)
                    TextField("Location", text: $location)
                }
                Section {
                    Toggle("All day", isOn: $allDay)
                    DatePicker("Starts", selection: $start, displayedComponents: allDay ? .date : [.date, .hourAndMinute])
                    DatePicker("Ends", selection: $end, in: start..., displayedComponents: allDay ? .date : [.date, .hourAndMinute])
                    Picker("Calendar", selection: $calendarId) {
                        ForEach(store.writableCalendars, id: \.calendarIdentifier) { c in
                            Text(c.title).tag(Optional(c.calendarIdentifier))
                        }
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
            .scrollContentBackground(.hidden)
            .background(NightBackground())
            .navigationTitle(item == nil ? "New event" : "Edit event")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }.disabled(title.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .onAppear(perform: load)
        }
        .preferredColorScheme(.dark)
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
    @State private var busy = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    ScreenHeader(title: "Settings")
                    VStack(alignment: .leading, spacing: 12) {
                        SectionTitle(text: "Lumin account")
                        if store.isSignedIn {
                            Label("Signed in. Your classes, due dates and study plan sync automatically.",
                                  systemImage: "checkmark.circle.fill")
                                .font(.subheadline).foregroundStyle(.white)
                            Button("Sign out", role: .destructive) { Task { await store.signOut() } }
                        } else {
                            Text("Sign in to see your study plan next to your Apple Calendar.")
                                .font(.subheadline).foregroundStyle(Theme.muted)
                            Button(busy ? "Signing in…" : "Sign in to Lumin") {
                                busy = true
                                Task { await store.signIn(); busy = false }
                            }
                            .disabled(busy)
                        }
                        if let s = store.status { Text(s).font(.footnote).foregroundStyle(.orange) }
                    }
                    .card()

                    VStack(alignment: .leading, spacing: 12) {
                        SectionTitle(text: "Apple Calendar")
                        Label(
                            store.accessGranted
                                ? "Connected. Events can be read and edited."
                                : "No access. Allow calendar access in Settings > Lumin Calendar.",
                            systemImage: store.accessGranted ? "checkmark.circle.fill" : "exclamationmark.triangle.fill"
                        )
                        .font(.subheadline).foregroundStyle(.white)
                    }
                    .card()
                }
                .padding(.horizontal, 18)
            }
            .background(NightBackground())
            .toolbar(.hidden, for: .navigationBar)
        }
    }
}
