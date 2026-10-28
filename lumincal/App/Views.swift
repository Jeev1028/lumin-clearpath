import EventKit
import SwiftUI

@main
struct LuminCalendarApp: App {
    @StateObject private var store = CalendarStore()
    @Environment(\.scenePhase) private var phase

    init() {
        let bar = UITabBarAppearance()
        bar.configureWithOpaqueBackground()
        bar.backgroundColor = UIColor(Theme.background)
        bar.shadowColor = UIColor(Theme.border)
        UITabBar.appearance().standardAppearance = bar
        UITabBar.appearance().scrollEdgeAppearance = bar
        UISegmentedControl.appearance().selectedSegmentTintColor = UIColor(Theme.primary)
        UISegmentedControl.appearance().backgroundColor = UIColor(Theme.card)
        UISegmentedControl.appearance().setTitleTextAttributes([.foregroundColor: UIColor(Theme.background)], for: .selected)
        UISegmentedControl.appearance().setTitleTextAttributes([.foregroundColor: UIColor(Theme.muted)], for: .normal)
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
    // An explicit selection keeps you on the Calendar tab while its view switches modes.
    @State private var tab = 0

    var body: some View {
        TabView(selection: $tab) {
            TodayView().tabItem { Label("Today", systemImage: "checklist") }.tag(0)
            PlannerView().tabItem { Label("Plan", systemImage: "sparkles") }.tag(1)
            CalendarRoot().tabItem { Label("Calendar", systemImage: "calendar") }.tag(2)
            SettingsView().tabItem { Label("Settings", systemImage: "gearshape") }.tag(3)
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
                .lineLimit(1).minimumScaleFactor(0.6)
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
    @Environment(\.openURL) private var openURL
    let item: AgendaItem

    private var isDone: Bool { store.done.contains(item.id) }
    private var isNow: Bool {
        !item.allDay && item.start <= Date() && Date() < item.end
            && Calendar.current.isDateInToday(item.start)
    }
    private var tint: Color {
        if let hex = item.colorHex, let c = Color(hex: hex) { return c }
        switch item.source {
        case .lumin: return Theme.primary
        case .plan: return Theme.accent
        case .apple: return Theme.muted
        }
    }

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            if item.checkable {
                Button {
                    UIImpactFeedbackGenerator(style: .light).impactOccurred()
                    withAnimation(.snappy) { store.toggle(item) }
                } label: {
                    Image(systemName: isDone ? "checkmark.circle.fill" : "circle")
                        .font(.title2)
                        .foregroundStyle(isDone ? Theme.accent : Theme.muted.opacity(0.7))
                        .symbolEffect(.bounce, value: isDone)
                }
                .buttonStyle(.plain)
            } else {
                timeColumn
                RoundedRectangle(cornerRadius: 2).fill(tint).frame(width: 4, height: 40)
            }
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(item.title)
                        .font(.body.weight(.medium))
                        .strikethrough(isDone)
                        .foregroundStyle(isDone ? Theme.muted : .white)
                        .lineLimit(3)
                    if isNow {
                        Text("NOW").font(.system(size: 10, weight: .bold)).tracking(0.6)
                            .padding(.horizontal, 6).padding(.vertical, 2)
                            .background(Theme.accent, in: Capsule())
                            .foregroundStyle(Theme.background)
                    }
                }
                if let sub = subtitle {
                    Text(sub).font(.caption).foregroundStyle(Theme.muted).lineLimit(1)
                }
            }
            Spacer(minLength: 0)
            if item.checkable, let url = askURL {
                Button {
                    openURL(url)
                } label: {
                    Image(systemName: "bubble.left.and.text.bubble.right")
                        .font(.system(size: 15))
                        .foregroundStyle(Theme.accent)
                        .frame(width: 34, height: 34)
                        .background(Theme.accent.opacity(0.12), in: Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Talk to Lumin about this")
            }
        }
        .padding(.vertical, 8)
        .opacity(isDone ? 0.65 : 1)
        .contentShape(Rectangle())
    }

    /// Opens the Lumin chat on the website with this task already described.
    private var askURL: URL? {
        let cal = Calendar.current
        let day = item.start.formatted(.dateTime.weekday(.wide).month().day())
        let when = item.allDay
            ? day
            : "\(day), \(item.start.formatted(date: .omitted, time: .shortened)) – \(item.end.formatted(date: .omitted, time: .shortened))"
        var lines: [String] = []
        let sameDay = store.items.filter { cal.isDate($0.start, inSameDayAs: item.start) && $0.id != item.id }
        if !sameDay.isEmpty {
            lines.append("Everything else I have that day:")
            lines += sameDay.prefix(12).map {
                "- \($0.allDay ? "All day" : $0.start.formatted(date: .omitted, time: .shortened)): \($0.title)"
            }
        }
        let horizon = cal.date(byAdding: .day, value: 14, to: Date()) ?? Date()
        let due = store.items.filter {
            $0.id.hasPrefix("task-") && $0.id != item.id && $0.start >= cal.startOfDay(for: Date()) && $0.start < horizon
        }
        if !due.isEmpty {
            lines.append("Deadlines coming up in the next two weeks:")
            lines += due.prefix(10).map { "- \($0.start.formatted(.dateTime.month().day())): \($0.title)" }
        }
        return luminAskURL(when: when, task: item.title, context: lines.joined(separator: "\n"))
    }

    private var timeColumn: some View {
        VStack(alignment: .trailing, spacing: 2) {
            if item.allDay {
                Text("All day").font(.caption.weight(.semibold)).foregroundStyle(.white)
            } else {
                Text(item.start.formatted(date: .omitted, time: .shortened))
                    .font(.caption.weight(.semibold)).foregroundStyle(.white)
                Text(item.end.formatted(date: .omitted, time: .shortened))
                    .font(.caption2).foregroundStyle(Theme.muted)
            }
        }
        .lineLimit(1)
        .minimumScaleFactor(0.8)
        .frame(width: 64, alignment: .trailing)
    }

    /// Checklist rows show their time; event rows already have a time column.
    private var subtitle: String? {
        var parts: [String] = []
        if item.checkable {
            if item.allDay {
                parts.append("All day")
            } else {
                parts.append(
                    "\(item.start.formatted(date: .omitted, time: .shortened)) – \(item.end.formatted(date: .omitted, time: .shortened))")
            }
        }
        if let l = item.location, !l.isEmpty { parts.append(l) }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
}

/// Morning / afternoon / evening grouping for the checklist.
enum Daypart: CaseIterable, Identifiable {
    case morning, afternoon, evening
    var id: Self { self }
    var title: String {
        switch self {
        case .morning: return "Morning"
        case .afternoon: return "Afternoon"
        case .evening: return "Evening"
        }
    }
    init(_ date: Date) {
        let h = Calendar.current.component(.hour, from: date)
        self = h < 12 ? .morning : (h < 17 ? .afternoon : .evening)
    }
}

struct ProgressCard: View {
    let done: Int
    let total: Int

    var body: some View {
        let frac = total == 0 ? 0.0 : Double(done) / Double(total)
        HStack(spacing: 16) {
            ZStack {
                Circle().stroke(Theme.border, lineWidth: 8)
                Circle().trim(from: 0, to: frac)
                    .stroke(
                        LinearGradient(colors: [Theme.primary, Theme.accent], startPoint: .topLeading, endPoint: .bottomTrailing),
                        style: StrokeStyle(lineWidth: 8, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                Text("\(Int(frac * 100))%").font(.caption.weight(.bold)).foregroundStyle(.white)
            }
            .frame(width: 58, height: 58)
            VStack(alignment: .leading, spacing: 3) {
                Text(done == total ? "All done. Nice work!" : "\(done) of \(total) done")
                    .font(.headline).foregroundStyle(.white)
                Text(done == total ? "Enjoy the rest of your day." : "\(total - done) left today")
                    .font(.footnote).foregroundStyle(Theme.muted)
            }
            Spacer(minLength: 0)
        }
        .card()
        .animation(.snappy, value: done)
    }
}

struct UpNextCard: View {
    let item: AgendaItem
    private var live: Bool { item.start <= Date() }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Circle().fill(Theme.accent).frame(width: 7, height: 7)
                Text(live ? "HAPPENING NOW" : "UP NEXT")
                    .font(.caption2.weight(.bold)).tracking(1).foregroundStyle(Theme.accent)
                Spacer()
                if !live {
                    Text("in \(item.start, style: .relative)").font(.caption).foregroundStyle(Theme.muted)
                }
            }
            Text(item.title).font(.title3.weight(.semibold)).foregroundStyle(.white).lineLimit(3)
            Text(detail).font(.subheadline).foregroundStyle(Theme.muted)
        }
        .card()
        .overlay(
            LinearGradient(colors: [Theme.primary.opacity(0.20), .clear], startPoint: .topLeading, endPoint: .bottomTrailing)
                .clipShape(RoundedRectangle(cornerRadius: 20))
                .allowsHitTesting(false)
        )
    }

    private var detail: String {
        var s = "\(item.start.formatted(date: .omitted, time: .shortened)) – \(item.end.formatted(date: .omitted, time: .shortened))"
        if let l = item.location, !l.isEmpty { s += " · \(l)" }
        return s
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

    private var upNext: AgendaItem? {
        let now = Date()
        return today.first { !$0.allDay && $0.end > now && !store.done.contains($0.id) }
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

                    if let n = upNext { UpNextCard(item: n) }

                    let checks = today.filter { $0.checkable }
                    if !checks.isEmpty {
                        ProgressCard(done: checks.filter { store.done.contains($0.id) }.count, total: checks.count)
                        ForEach(Daypart.allCases) { part in
                            let group = checks.filter { Daypart($0.start) == part }
                            if !group.isEmpty {
                                SectionTitle(text: part.title)
                                ItemCard(items: group)
                            }
                        }
                    }
                    let schedule = today.filter { !$0.checkable }
                    SectionTitle(text: "Schedule", trailing: schedule.isEmpty ? nil : "\(schedule.count)")
                    ItemCard(items: schedule) { if $0.source == .apple { editing = $0 } }
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
    @Binding var selected: Date
    @Binding var mode: CalMode
    @State private var editing: AgendaItem?
    @State private var adding = false

    private var cal: Calendar { Calendar.current }

    private func items(on day: Date) -> [AgendaItem] {
        store.items.filter { cal.isDate($0.start, inSameDayAs: day) }
    }

    /// One dot per kind of thing on that day: classes, study plan, Apple Calendar.
    private func dotColors(on day: Date) -> [Color] {
        let sources = Set(items(on: day).map { $0.source })
        var out: [Color] = []
        if sources.contains(.lumin) { out.append(Theme.primary) }
        if sources.contains(.plan) { out.append(Theme.accent) }
        if sources.contains(.apple) { out.append(Color(rgb: 0xB794F6)) }
        return out
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
                    ModePicker(mode: $mode)
                    MonthGrid(selected: $selected, dots: { dotColors(on: $0) }).card()
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
    let dots: (Date) -> [Color]
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
                                    .shadow(color: isSel ? Theme.primary.opacity(0.6) : .clear, radius: 8)
                                HStack(spacing: 3) {
                                    ForEach(Array(dots(day).enumerated()), id: \.offset) { _, c in
                                        Circle().fill(c).frame(width: 4, height: 4)
                                    }
                                }
                                .frame(height: 4)
                            }
                        }
                        .buttonStyle(.plain)
                    } else {
                        Color.clear.frame(height: 40)
                    }
                }
            }
            HStack(spacing: 14) {
                legend(Theme.primary, "Classes")
                legend(Theme.accent, "Study plan")
                legend(Color(rgb: 0xB794F6), "Calendar")
            }
            .padding(.top, 4)
        }
    }

    private func legend(_ c: Color, _ t: String) -> some View {
        HStack(spacing: 5) {
            Circle().fill(c).frame(width: 6, height: 6)
            Text(t).font(.caption2).foregroundStyle(Theme.muted)
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

                    VStack(alignment: .leading, spacing: 8) {
                        SectionTitle(text: "Widget")
                        Label(
                            Shared.hasGroup ? "Shared storage with the widget is working." : "The widget can't open the app's shared storage, so it can't show your day.",
                            systemImage: Shared.hasGroup ? "checkmark.circle.fill" : "exclamationmark.triangle.fill"
                        )
                        .font(.subheadline).foregroundStyle(.white)
                        if let t = AgendaCache.savedAt {
                            Text("Last sent to the widget \(t.formatted(.relative(presentation: .named))). Today has \(AgendaCache.load().filter { Calendar.current.isDateInToday($0.start) }.count) items.")
                                .font(.footnote).foregroundStyle(Theme.muted)
                        } else {
                            Text("Nothing has been sent to the widget yet.").font(.footnote).foregroundStyle(Theme.muted)
                        }
                        Text("Storage: \(Shared.groupId)").font(.caption2).foregroundStyle(Theme.muted)
                    }
                    .card()

                    VStack(alignment: .leading, spacing: 12) {
                        SectionTitle(text: "Apple Calendar")
                        Label(
                            store.accessGranted
                                ? "Connected. Events can be read and edited."
                                : "No access. Allow calendar access in Settings > Lumin Cal.",
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
