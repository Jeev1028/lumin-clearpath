import SwiftUI

enum CalMode: String, CaseIterable, Identifiable {
    case week = "Week", month = "Month", year = "Year"
    var id: String { rawValue }
}

extension AgendaItem {
    /// Accent colour for this item: its Apple calendar colour, or one per source.
    var tint: Color {
        if let hex = colorHex, let c = Color(hex: hex) { return c }
        switch source {
        case .lumin: return Theme.primary
        case .plan: return Theme.accent
        case .apple: return Theme.muted
        }
    }
}

struct ModePicker: View {
    @Binding var mode: CalMode
    var body: some View {
        Picker("View", selection: $mode) {
            ForEach(CalMode.allCases) { Text($0.rawValue).tag($0) }
        }
        .pickerStyle(.segmented)
    }
}

/// Title row with Today and + buttons, shared by the week and year views.
struct CalHeader: View {
    let title: String
    let subtitle: String
    let onToday: () -> Void
    let onAdd: () -> Void

    var body: some View {
        HStack(alignment: .top) {
            ScreenHeader(title: title, subtitle: subtitle)
            Button("Today", action: onToday)
                .font(.subheadline.weight(.semibold))
                .padding(.horizontal, 14).frame(height: 40)
                .background(Theme.card, in: Capsule()).overlay(Capsule().stroke(Theme.border))
            Button(action: onAdd) {
                Image(systemName: "plus").font(.title3.weight(.semibold))
                    .frame(width: 40, height: 40)
                    .background(Theme.card, in: Circle()).overlay(Circle().stroke(Theme.border))
            }
        }
    }
}

/// The Calendar tab: week, month and year share one selected date.
struct CalendarRoot: View {
    @State private var mode: CalMode = .month
    @State private var selected = Date()

    var body: some View {
        ZStack {
            switch mode {
            case .week: WeekView(selected: $selected, mode: $mode)
            case .month: MonthView(selected: $selected, mode: $mode)
            case .year: YearView(selected: $selected, mode: $mode)
            }
        }
    }
}

// MARK: - Week

/// Side-by-side packing for events that overlap in time.
enum WeekLayout {
    struct Placed {
        let item: AgendaItem
        let lane: Int
        let lanes: Int
    }

    static func place(_ items: [AgendaItem]) -> [Placed] {
        var out: [Placed] = []
        var cluster: [(AgendaItem, Int)] = []
        var laneEnds: [Date] = []
        var clusterEnd = Date.distantPast

        func flush() {
            let n = max(laneEnds.count, 1)
            out += cluster.map { Placed(item: $0.0, lane: $0.1, lanes: n) }
            cluster = []
            laneEnds = []
        }

        for it in items.sorted(by: { $0.start < $1.start }) {
            if !cluster.isEmpty && it.start >= clusterEnd {
                flush()
                clusterEnd = .distantPast
            }
            let lane = laneEnds.firstIndex(where: { $0 <= it.start }) ?? laneEnds.count
            if lane == laneEnds.count { laneEnds.append(it.end) } else { laneEnds[lane] = it.end }
            cluster.append((it, lane))
            clusterEnd = max(clusterEnd, it.end)
        }
        flush()
        return out
    }
}

struct WeekView: View {
    @EnvironmentObject var store: CalendarStore
    @Binding var selected: Date
    @Binding var mode: CalMode
    @State private var editing: AgendaItem?
    @State private var adding = false

    private var cal: Calendar { Calendar.current }
    private let hourH: CGFloat = 54
    private let gutter: CGFloat = 38

    private var days: [Date] {
        let start = cal.dateInterval(of: .weekOfYear, for: selected)?.start ?? selected
        return (0..<7).compactMap { cal.date(byAdding: .day, value: $0, to: start) }
    }

    private func items(on day: Date) -> [AgendaItem] {
        store.items.filter { cal.isDate($0.start, inSameDayAs: day) }
    }

    private var rangeTitle: String {
        guard let f = days.first, let l = days.last else { return "" }
        let a = f.formatted(.dateTime.month(.abbreviated).day())
        let b = cal.isDate(f, equalTo: l, toGranularity: .month)
            ? l.formatted(.dateTime.day())
            : l.formatted(.dateTime.month(.abbreviated).day())
        return "\(a) – \(b)"
    }

    private var startHour: Int {
        let weekHasToday = days.contains { cal.isDateInToday($0) }
        return weekHasToday ? max(0, cal.component(.hour, from: Date()) - 1) : 7
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 10) {
                CalHeader(
                    title: rangeTitle,
                    subtitle: selected.formatted(.dateTime.year()),
                    onToday: { selected = Date() },
                    onAdd: { adding = true }
                )
                .padding(.horizontal, 18)
                HStack {
                    Button { shift(-7) } label: { Image(systemName: "chevron.left") }
                    ModePicker(mode: $mode)
                    Button { shift(7) } label: { Image(systemName: "chevron.right") }
                }
                .foregroundStyle(Theme.muted)
                .padding(.horizontal, 18)
                dayStrip
                allDayRow
                grid
            }
            .background(NightBackground())
            .toolbar(.hidden, for: .navigationBar)
            .sheet(isPresented: $adding) { EventEditor(item: nil, day: selected) }
            .sheet(item: $editing) { EventEditor(item: $0, day: $0.start) }
        }
    }

    private func shift(_ days: Int) {
        selected = cal.date(byAdding: .day, value: days, to: selected) ?? selected
    }

    // Weekday letters and numbers across the top.
    private var dayStrip: some View {
        HStack(spacing: 0) {
            Color.clear.frame(width: gutter, height: 1)
            ForEach(days, id: \.self) { day in
                let isSel = cal.isDate(day, inSameDayAs: selected)
                Button { selected = day } label: {
                    VStack(spacing: 3) {
                        Text(day.formatted(.dateTime.weekday(.narrow)))
                            .font(.caption2.weight(.semibold)).foregroundStyle(Theme.muted)
                        Text("\(cal.component(.day, from: day))")
                            .font(.callout.weight(.semibold))
                            .frame(width: 30, height: 30)
                            .background(
                                Circle().fill(
                                    isSel ? Theme.primary
                                        : cal.isDateInToday(day) ? Theme.primary.opacity(0.25) : .clear))
                            .foregroundStyle(isSel ? Theme.background : .white)
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.trailing, 6)
    }

    @ViewBuilder private var allDayRow: some View {
        if days.contains(where: { d in items(on: d).contains { $0.allDay } }) {
            HStack(alignment: .top, spacing: 0) {
                Text("all-day").font(.system(size: 9)).foregroundStyle(Theme.muted)
                    .padding(.trailing, 4).frame(width: gutter, alignment: .trailing)
                ForEach(days, id: \.self) { day in
                    VStack(spacing: 2) {
                        ForEach(Array(items(on: day).filter { $0.allDay }.prefix(2).enumerated()), id: \.offset) { _, it in
                            Text(it.title).font(.system(size: 9, weight: .medium)).lineLimit(1)
                                .padding(.horizontal, 3).frame(maxWidth: .infinity)
                                .background(it.tint.opacity(0.35), in: RoundedRectangle(cornerRadius: 4))
                        }
                    }
                    .frame(maxWidth: .infinity)
                }
            }
            .foregroundStyle(.white)
            .padding(.trailing, 6)
        }
    }

    private func hourLabel(_ h: Int) -> String {
        let hr = h % 12 == 0 ? 12 : h % 12
        return h == 0 ? "" : "\(hr)\(h < 12 ? "a" : "p")"
    }

    private var grid: some View {
        ScrollViewReader { proxy in
            ScrollView {
                ZStack(alignment: .topLeading) {
                    VStack(spacing: 0) {
                        ForEach(0..<24, id: \.self) { h in
                            HStack(alignment: .top, spacing: 0) {
                                Text(hourLabel(h)).font(.system(size: 9)).foregroundStyle(Theme.muted)
                                    .padding(.trailing, 4).frame(width: gutter, alignment: .trailing)
                                    .offset(y: -5)
                                Rectangle().fill(Theme.border.opacity(0.6)).frame(height: 0.5)
                            }
                            .frame(height: hourH, alignment: .top)
                            .id(h)
                        }
                    }
                    GeometryReader { geo in
                        let colW = (geo.size.width - gutter) / 7
                        ForEach(Array(days.enumerated()), id: \.offset) { i, day in
                            dayColumn(day: day, index: i, colW: colW)
                        }
                    }
                }
                .frame(height: hourH * 24)
                .padding(.trailing, 6)
                .padding(.bottom, 12)
            }
            .onAppear { proxy.scrollTo(startHour, anchor: .top) }
        }
    }

    @ViewBuilder
    private func dayColumn(day: Date, index i: Int, colW: CGFloat) -> some View {
        let placed = WeekLayout.place(items(on: day).filter { !$0.allDay })
        ForEach(Array(placed.enumerated()), id: \.offset) { _, p in
            block(p, colW: colW)
                .offset(
                    x: gutter + colW * CGFloat(i) + colW * CGFloat(p.lane) / CGFloat(p.lanes),
                    y: yPos(p.item.start))
        }
        if cal.isDateInToday(day) {
            HStack(spacing: 0) {
                Circle().fill(Theme.accent).frame(width: 6, height: 6)
                Rectangle().fill(Theme.accent).frame(height: 1)
            }
            .frame(width: colW, height: 6)
            .offset(x: gutter + colW * CGFloat(i) - 3, y: yPos(Date()) - 3)
        }
    }

    private func yPos(_ date: Date) -> CGFloat {
        let c = cal.dateComponents([.hour, .minute], from: date)
        return CGFloat((c.hour ?? 0) * 60 + (c.minute ?? 0)) / 60 * hourH
    }

    private func blockHeight(_ it: AgendaItem) -> CGFloat {
        let dayEnd = cal.startOfDay(for: it.start).addingTimeInterval(86_400)
        let end = min(it.end, dayEnd)
        return max(CGFloat(end.timeIntervalSince(it.start) / 3600) * hourH, 16)
    }

    private func block(_ p: WeekLayout.Placed, colW: CGFloat) -> some View {
        let it = p.item
        let h = blockHeight(it)
        let w = max(colW / CGFloat(p.lanes) - 1.5, 8)
        let done = store.done.contains(it.id)
        return Text(it.title)
            .font(.system(size: 9, weight: .semibold))
            .lineLimit(max(1, Int(h / 11)))
            .multilineTextAlignment(.leading)
            .strikethrough(done)
            .padding(.horizontal, 3).padding(.vertical, 2)
            .frame(width: w, height: h, alignment: .topLeading)
            .background(it.tint.opacity(done ? 0.15 : 0.35), in: RoundedRectangle(cornerRadius: 5))
            .overlay(RoundedRectangle(cornerRadius: 5).stroke(it.tint.opacity(0.7), lineWidth: 0.8))
            .foregroundStyle(.white)
            .onTapGesture { if it.source == .apple { editing = it } }
    }
}

// MARK: - Year

struct YearView: View {
    @EnvironmentObject var store: CalendarStore
    @Binding var selected: Date
    @Binding var mode: CalMode
    @State private var adding = false

    private var cal: Calendar { Calendar.current }
    private var year: Int { cal.component(.year, from: selected) }

    private var months: [Date] {
        (1...12).compactMap { cal.date(from: DateComponents(year: year, month: $0, day: 1)) }
    }

    var body: some View {
        let counts = Dictionary(grouping: store.items, by: { cal.startOfDay(for: $0.start) })
            .mapValues { $0.count }
        NavigationStack {
            ScrollView {
                VStack(spacing: 14) {
                    CalHeader(
                        title: String(year),
                        subtitle: "Year overview",
                        onToday: { selected = Date() },
                        onAdd: { adding = true }
                    )
                    HStack {
                        Button { shiftYear(-1) } label: { Image(systemName: "chevron.left") }
                        ModePicker(mode: $mode)
                        Button { shiftYear(1) } label: { Image(systemName: "chevron.right") }
                    }
                    .foregroundStyle(Theme.muted)
                    LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible(), spacing: 12)], spacing: 12) {
                        ForEach(months, id: \.self) { m in
                            MiniMonth(month: m, counts: counts)
                                .onTapGesture {
                                    selected = cal.isDate(m, equalTo: Date(), toGranularity: .month) ? Date() : m
                                    mode = .month
                                }
                        }
                    }
                }
                .padding(.horizontal, 18)
                .padding(.bottom, 24)
            }
            .refreshable { await store.reload() }
            .background(NightBackground())
            .toolbar(.hidden, for: .navigationBar)
            .sheet(isPresented: $adding) { EventEditor(item: nil, day: selected) }
        }
    }

    private func shiftYear(_ n: Int) {
        selected = cal.date(byAdding: .year, value: n, to: selected) ?? selected
    }
}

struct MiniMonth: View {
    let month: Date
    let counts: [Date: Int]

    private var cal: Calendar { Calendar.current }
    private var isCurrent: Bool { cal.isDate(month, equalTo: Date(), toGranularity: .month) }

    private var cells: [Date?] {
        guard let interval = cal.dateInterval(of: .month, for: month) else { return [] }
        let firstWeekday = cal.component(.weekday, from: interval.start)
        let lead = (firstWeekday - cal.firstWeekday + 7) % 7
        let count = cal.range(of: .day, in: .month, for: month)?.count ?? 30
        return Array(repeating: nil, count: lead)
            + (0..<count).map { cal.date(byAdding: .day, value: $0, to: interval.start) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(month.formatted(.dateTime.month(.wide)))
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(isCurrent ? Theme.accent : .white)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 0), count: 7), spacing: 3) {
                ForEach(Array(cells.enumerated()), id: \.offset) { _, d in
                    if let d {
                        let n = counts[cal.startOfDay(for: d)] ?? 0
                        let today = cal.isDateInToday(d)
                        Text("\(cal.component(.day, from: d))")
                            .font(.system(size: 9, weight: today ? .bold : .regular))
                            .frame(maxWidth: .infinity)
                            .frame(height: 15)
                            .background(
                                RoundedRectangle(cornerRadius: 4).fill(
                                    today ? Theme.primary : Theme.accent.opacity(min(0.55, 0.12 * Double(n)))))
                            .foregroundStyle(today ? Theme.background : .white)
                    } else {
                        Color.clear.frame(height: 15)
                    }
                }
            }
        }
        .padding(10)
        .background(Theme.card.opacity(0.85), in: RoundedRectangle(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(isCurrent ? Theme.accent.opacity(0.6) : Theme.border, lineWidth: 1))
        .contentShape(Rectangle())
    }
}
