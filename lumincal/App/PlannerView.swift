import SwiftUI

// The study planner inside Lumin Cal. It talks to /api/app-plan on the Lumin site using the
// same private calendar link the app already holds (sent as a Bearer header, never in the URL),
// so plans made here and on the website are the same plan with the same ticked boxes.

// MARK: - Model

struct StudyPlan: Decodable {
    let horizon: String
    let preferences: String?
    let plan_markdown: String
    let generated_at: String
    let completed_blocks: [String]?
}

private struct PlanEnvelope: Decodable { let plan: StudyPlan? }

enum PlanError: LocalizedError {
    case message(String)
    var errorDescription: String? {
        switch self { case .message(let m): return m }
    }
}

struct PlanAPI {
    let url: URL
    let token: String

    /// Built from the saved calendar link: same site, same token.
    init?(feedURL: String) {
        var raw = feedURL.trimmingCharacters(in: .whitespacesAndNewlines)
        if raw.hasPrefix("webcal://") { raw = "https://" + raw.dropFirst("webcal://".count) }
        guard let c = URLComponents(string: raw),
              let host = c.host,
              let t = c.queryItems?.first(where: { $0.name == "token" })?.value, !t.isEmpty else { return nil }
        var b = URLComponents()
        b.scheme = "https"
        b.host = host
        b.port = c.port
        b.path = "/api/app-plan"
        guard let u = b.url else { return nil }
        url = u
        token = t
    }

    private func send(_ method: String, body: Data? = nil, timeout: TimeInterval = 30) async throws -> Data {
        var r = URLRequest(url: url, timeoutInterval: timeout)
        r.httpMethod = method
        r.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        if let body {
            r.httpBody = body
            r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        let (data, resp) = try await URLSession.shared.data(for: r)
        guard let http = resp as? HTTPURLResponse else { throw PlanError.message("No response from Lumin.") }
        guard http.statusCode == 200 else {
            if http.statusCode == 401 {
                throw PlanError.message("Your Lumin link expired. Sign out and sign in again in Settings.")
            }
            let text = (String(data: data, encoding: .utf8) ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            if !text.isEmpty, !text.hasPrefix("<"), text.count < 240 { throw PlanError.message(text) }
            throw PlanError.message("Lumin had a problem (\(http.statusCode)). Please try again.")
        }
        return data
    }

    func fetch() async throws -> StudyPlan? {
        try JSONDecoder().decode(PlanEnvelope.self, from: await send("GET")).plan
    }

    func generate(start: String, end: String, preferences: String) async throws -> StudyPlan {
        let payload: [String: String] = [
            "startDate": start,
            "endDate": end,
            "today": PlanDates.ymd(Date()),
            "timeZone": TimeZone.current.identifier,
            "preferences": preferences,
        ]
        let data = try await send("POST", body: JSONSerialization.data(withJSONObject: payload), timeout: 170)
        guard let plan = try JSONDecoder().decode(PlanEnvelope.self, from: data).plan else {
            throw PlanError.message("Lumin did not return a plan. Please try again.")
        }
        return plan
    }

    func saveCompleted(_ keys: [String]) async throws {
        let body = try JSONSerialization.data(withJSONObject: ["completed_blocks": keys])
        _ = try await send("PUT", body: body)
    }
}

enum PlanDates {
    private static func formatter() -> DateFormatter {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = .current
        f.dateFormat = "yyyy-MM-dd"
        return f
    }
    static func ymd(_ d: Date) -> String { formatter().string(from: d) }
    static func date(_ s: String) -> Date? { formatter().date(from: s) }
}

// MARK: - Parsing (mirrors the website so the same boxes stay ticked on both)

struct PlanDay: Identifiable {
    let id: Int
    let heading: String
    var items: [String]
}

struct ParsedPlan {
    var days: [PlanDay]
    var why: String
}

func parsePlan(_ markdown: String) -> ParsedPlan? {
    var days: [PlanDay] = []
    var whyLines: [String] = []
    var inWhy = false
    for raw in markdown.components(separatedBy: "\n") {
        let line = raw.trimmingCharacters(in: .whitespaces)
        if line.hasPrefix("### ") {
            let heading = line.dropFirst(4).trimmingCharacters(in: .whitespaces)
            if inWhy || heading.lowercased().hasPrefix("why") {
                inWhy = true
                whyLines.append(raw)
                continue
            }
            days.append(PlanDay(id: days.count, heading: heading, items: []))
            continue
        }
        if inWhy {
            whyLines.append(raw)
        } else if line.hasPrefix("- "), !days.isEmpty {
            days[days.count - 1].items.append(line.dropFirst(2).trimmingCharacters(in: .whitespaces))
        }
    }
    guard !days.isEmpty else { return nil }
    let why = whyLines.dropFirst().joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
    return ParsedPlan(days: days, why: why)
}

func planKey(_ day: String, _ item: String) -> String { "\(day)__\(item)" }

private func inlineMarkdown(_ s: String) -> AttributedString {
    let opts = AttributedString.MarkdownParsingOptions(interpretedSyntax: .inlineOnlyPreservingWhitespace)
    return (try? AttributedString(markdown: s, options: opts)) ?? AttributedString(s)
}

private func plainText(_ s: String) -> String {
    s.replacingOccurrences(of: "*", with: "").replacingOccurrences(of: "`", with: "")
        .replacingOccurrences(of: "_", with: " ")
}

/// Opens a Lumin chat on the website with this study block already described.
func luminAskURL(when: String, task: String) -> URL? {
    let prompt = [
        "I'm working on this study block from my Lumin study plan.",
        "When: \(when)",
        "Task: \(plainText(task))",
        "Can you help me with it? Ask me anything you need to know first.",
    ].joined(separator: "\n")
    var c = URLComponents(string: "https://luminclearpath.ca/chat")
    c?.queryItems = [URLQueryItem(name: "ask", value: prompt)]
    return c?.url
}

// MARK: - State

@MainActor
final class PlanStore: ObservableObject {
    @Published var plan: StudyPlan?
    @Published var completed: Set<String> = []
    @Published var loading = false
    @Published var generating = false
    @Published var error: String?
    @Published var start = Calendar.current.startOfDay(for: Date())
    @Published var end = Calendar.current.date(byAdding: .day, value: 6, to: Calendar.current.startOfDay(for: Date()))!
    @Published var prefs = ""

    var parsed: ParsedPlan? { plan.flatMap { parsePlan($0.plan_markdown) } }

    func load(_ api: PlanAPI?) async {
        guard let api else { return }
        loading = true
        defer { loading = false }
        do {
            let p = try await api.fetch()
            apply(p)
            error = nil
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func apply(_ p: StudyPlan?) {
        plan = p
        completed = Set(p?.completed_blocks ?? [])
        // Show the plan's own date range in the pickers while it is still current.
        if let p {
            let parts = p.horizon.split(separator: "/").map(String.init)
            let today = Calendar.current.startOfDay(for: Date())
            if parts.count == 2, let s = PlanDates.date(parts[0]), let e = PlanDates.date(parts[1]), e >= today {
                start = max(s, today)
                end = e
            }
        }
    }

    func setRange(days: Int) {
        let today = Calendar.current.startOfDay(for: Date())
        start = today
        end = Calendar.current.date(byAdding: .day, value: days - 1, to: today) ?? today
    }

    func generate(_ api: PlanAPI?) async {
        guard let api, !generating else { return }
        generating = true
        error = nil
        defer { generating = false }
        do {
            let p = try await api.generate(
                start: PlanDates.ymd(start), end: PlanDates.ymd(end),
                preferences: prefs.trimmingCharacters(in: .whitespacesAndNewlines))
            apply(p)
            prefs = ""
            UINotificationFeedbackGenerator().notificationOccurred(.success)
        } catch {
            self.error = error.localizedDescription
            UINotificationFeedbackGenerator().notificationOccurred(.error)
        }
    }

    func toggle(_ key: String, _ api: PlanAPI?) {
        guard let api else { return }
        let before = completed
        if completed.contains(key) { completed.remove(key) } else { completed.insert(key) }
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        let snapshot = Array(completed)
        Task {
            do { try await api.saveCompleted(snapshot) } catch {
                completed = before
                self.error = "Could not save that tick. Check your connection."
            }
        }
    }
}

// MARK: - Views

struct PlannerView: View {
    @EnvironmentObject var store: CalendarStore
    @StateObject private var planner = PlanStore()
    @Environment(\.openURL) private var openURL

    private var api: PlanAPI? { PlanAPI(feedURL: store.feedURL) }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 18) {
                    ScreenHeader(title: "Study plan", subtitle: "Lumin plans your tasks around your classes")
                    if !store.isSignedIn {
                        SignInCard()
                    } else {
                        PlanForm(planner: planner, api: api)
                        if let e = planner.error {
                            Text(e).font(.footnote).foregroundStyle(.orange)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                        if planner.generating {
                            HStack(spacing: 12) {
                                ProgressView().tint(Theme.accent)
                                Text("Lumin is building your plan. This can take up to a minute.")
                                    .font(.footnote).foregroundStyle(Theme.muted)
                            }
                            .card()
                        } else if planner.loading && planner.plan == nil {
                            ProgressView().tint(Theme.accent).padding(.top, 20)
                        }
                        if let parsed = planner.parsed {
                            PlanBody(planner: planner, parsed: parsed, api: api)
                        } else if let p = planner.plan {
                            Text(inlineMarkdown(p.plan_markdown)).font(.callout).foregroundStyle(.white)
                                .card()
                        } else if !planner.loading && !planner.generating {
                            Text("No plan yet. Pick your dates above and tap Generate.")
                                .font(.footnote).foregroundStyle(Theme.muted)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                    Button {
                        if let u = URL(string: "https://luminclearpath.ca/schedule") { openURL(u) }
                    } label: {
                        Label("Open the full planner on ClearPath", systemImage: "arrow.up.right.square")
                            .font(.subheadline.weight(.medium)).foregroundStyle(Theme.accent)
                            .frame(maxWidth: .infinity).padding(.vertical, 12)
                            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.border))
                    }
                }
                .padding(.horizontal, 18)
                .padding(.bottom, 24)
            }
            .refreshable { await planner.load(api) }
            .background(NightBackground())
            .toolbar(.hidden, for: .navigationBar)
            .task(id: store.feedURL) { await planner.load(api) }
        }
    }
}

private struct PlanForm: View {
    @ObservedObject var planner: PlanStore
    let api: PlanAPI?
    private let today = Calendar.current.startOfDay(for: Date())

    private func chip(_ title: String, days: Int) -> some View {
        Button { planner.setRange(days: days) } label: {
            Text(title).font(.footnote.weight(.semibold)).foregroundStyle(Theme.accent)
                .padding(.horizontal, 12).padding(.vertical, 7)
                .background(Theme.accent.opacity(0.12), in: Capsule())
        }
        .buttonStyle(.plain)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                chip("1 week", days: 7)
                chip("2 weeks", days: 14)
                chip("30 days", days: 30)
            }
            DatePicker("From", selection: $planner.start, in: today..., displayedComponents: .date)
                .onChange(of: planner.start) { _, s in
                    if planner.end < s { planner.end = s }
                    if let cap = Calendar.current.date(byAdding: .day, value: 59, to: s), planner.end > cap {
                        planner.end = cap
                    }
                }
            DatePicker("To", selection: $planner.end, in: planner.start..., displayedComponents: .date)
                .onChange(of: planner.end) { _, e in
                    if let cap = Calendar.current.date(byAdding: .day, value: 59, to: planner.start), e > cap {
                        planner.end = cap
                    }
                }
            TextField(
                planner.plan == nil
                    ? "Anything Lumin should know? e.g. no studying on Fridays"
                    : "Ask for changes, e.g. keep Fridays light",
                text: $planner.prefs, axis: .vertical)
                .lineLimit(2...5)
                .padding(12)
                .background(Theme.background.opacity(0.6), in: RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.border))
            Button {
                Task { await planner.generate(api) }
            } label: {
                Text(planner.generating ? "Working…" : (planner.plan == nil ? "Generate plan" : "Update plan"))
                    .font(.headline).frame(maxWidth: .infinity).padding(.vertical, 12)
                    .background(
                        LinearGradient(colors: [Theme.primary, Theme.accent], startPoint: .leading, endPoint: .trailing),
                        in: RoundedRectangle(cornerRadius: 14))
                    .foregroundStyle(Theme.background)
            }
            .disabled(planner.generating || api == nil)
            .opacity(planner.generating ? 0.6 : 1)
        }
        .card()
    }
}

private struct PlanBody: View {
    @ObservedObject var planner: PlanStore
    let parsed: ParsedPlan
    let api: PlanAPI?
    @Environment(\.openURL) private var openURL

    private var total: Int { parsed.days.reduce(0) { $0 + $1.items.count } }
    private var doneCount: Int {
        parsed.days.reduce(0) { sum, d in
            sum + d.items.filter { planner.completed.contains(planKey(d.heading, $0)) }.count
        }
    }

    var body: some View {
        VStack(spacing: 14) {
            SectionTitle(text: "Your plan", trailing: total == 0 ? nil : "\(doneCount) of \(total) done")
            ForEach(parsed.days) { day in
                VStack(alignment: .leading, spacing: 6) {
                    Text(day.heading).font(.subheadline.weight(.semibold)).foregroundStyle(.white)
                    ForEach(Array(day.items.enumerated()), id: \.offset) { _, item in
                        row(day: day.heading, item: item)
                    }
                }
                .card()
            }
            if !parsed.why.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Why this plan").font(.subheadline.weight(.semibold)).foregroundStyle(Theme.accent)
                    Text(inlineMarkdown(parsed.why)).font(.footnote).foregroundStyle(Theme.muted)
                }
                .card()
            }
        }
    }

    private func row(day: String, item: String) -> some View {
        let key = planKey(day, item)
        let isDone = planner.completed.contains(key)
        return HStack(alignment: .top, spacing: 10) {
            Button { planner.toggle(key, api) } label: {
                Image(systemName: isDone ? "checkmark.circle.fill" : "circle")
                    .font(.title3).foregroundStyle(isDone ? Theme.accent : Theme.muted)
            }
            .buttonStyle(.plain)
            Text(inlineMarkdown(item))
                .font(.callout).foregroundStyle(isDone ? Theme.muted : .white)
                .strikethrough(isDone)
                .frame(maxWidth: .infinity, alignment: .leading)
            if let url = luminAskURL(when: day, task: item) {
                Button { openURL(url) } label: {
                    Image(systemName: "bubble.left.and.text.bubble.right")
                        .font(.system(size: 14)).foregroundStyle(Theme.accent)
                        .frame(width: 32, height: 32)
                        .background(Theme.accent.opacity(0.12), in: Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Talk to Lumin about this")
            }
        }
        .padding(.vertical, 4)
        .opacity(isDone ? 0.7 : 1)
    }
}
