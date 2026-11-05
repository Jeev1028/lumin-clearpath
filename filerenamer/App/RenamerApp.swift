import SwiftUI
import UniformTypeIdentifiers

@main
struct RenamerApp: App {
    var body: some Scene { WindowGroup { ContentView() } }
}

struct ContentView: View {
    @State private var folder: URL?
    @State private var ext = ""
    @State private var picking = false
    @State private var log: [String] = []
    @State private var confirm = false

    private var cleanExt: String {
        ext.trimmingCharacters(in: .whitespaces).trimmingCharacters(in: CharacterSet(charactersIn: ".")).lowercased()
    }

    var body: some View {
        NavigationView {
            Form {
                Section("1. Folder") {
                    Button(folder?.lastPathComponent ?? "Choose folder…") { picking = true }
                }
                Section("2. File extension") {
                    TextField("e.g. jpg", text: $ext)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
                Section {
                    Button("Add random number prefix") { confirm = true }
                        .disabled(folder == nil || cleanExt.isEmpty)
                } footer: {
                    Text("Every .\(cleanExt.isEmpty ? "ext" : cleanExt) file in the folder (not subfolders) becomes e.g. 483920_name.\(cleanExt.isEmpty ? "ext" : cleanExt).")
                }
                if !log.isEmpty {
                    Section("Result") { ForEach(log, id: \.self) { Text($0).font(.footnote) } }
                }
            }
            .navigationTitle("Prefix Renamer")
        }
        .navigationViewStyle(.stack)
        .fileImporter(isPresented: $picking, allowedContentTypes: [.folder]) { r in
            if case .success(let u) = r { folder = u; log = [] }
        }
        .alert("Rename files?", isPresented: $confirm) {
            Button("Rename", role: .destructive) { run() }
            Button("Cancel", role: .cancel) {}
        } message: { Text("This renames files on disk and can't be undone automatically.") }
    }

    private func run() {
        guard let folder else { return }
        let ok = folder.startAccessingSecurityScopedResource()
        defer { if ok { folder.stopAccessingSecurityScopedResource() } }
        let fm = FileManager.default
        guard let names = try? fm.contentsOfDirectory(atPath: folder.path) else {
            log = ["Couldn't read the folder."]; return
        }
        let targets = names.filter { ($0 as NSString).pathExtension.lowercased() == cleanExt }
        var used = Set(names)
        var done = 0
        var out: [String] = []
        for name in targets {
            var new = ""
            repeat { new = "\(Int.random(in: 100_000...999_999))_\(name)" } while used.contains(new)
            do {
                try fm.moveItem(at: folder.appendingPathComponent(name), to: folder.appendingPathComponent(new))
                used.insert(new); done += 1
            } catch { out.append("Failed: \(name)") }
        }
        log = ["Renamed \(done) of \(targets.count) file(s)."] + out
    }
}
