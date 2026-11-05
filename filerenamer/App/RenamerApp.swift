import SwiftUI
import UniformTypeIdentifiers

@main
struct RenamerApp: App {
    var body: some Scene { WindowGroup { ContentView() } }
}

enum Source { case folder(URL), files([URL]) }

struct ContentView: View {
    @State private var source: Source?
    @State private var held: [URL] = []          // URLs we hold security-scoped access to
    @State private var ext = ""
    @State private var pickFolder = false
    @State private var pickFiles = false
    @State private var info = ""
    @State private var log: [String] = []
    @State private var confirm = false

    private var cleanExt: String {
        ext.trimmingCharacters(in: .whitespaces).trimmingCharacters(in: CharacterSet(charactersIn: ".")).lowercased()
    }
    private var sourceName: String {
        switch source {
        case .folder(let u): return u.lastPathComponent
        case .files(let f): return "\(f.count) file(s) chosen"
        case nil: return "Nothing chosen"
        }
    }

    var body: some View {
        NavigationView {
            Form {
                Section("1. Choose") {
                    Button("Choose a folder…") { pickFolder = true }
                    Button("Or choose files…") { pickFiles = true }
                    Button("Use this app's Documents folder") {
                        if let d = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first {
                            choose(folder: d)
                        }
                    }
                    Text(sourceName).foregroundColor(.secondary)
                    if !info.isEmpty { Text(info).font(.footnote).foregroundColor(.secondary) }
                }
                Section("2. File extension") {
                    TextField("e.g. jpg", text: $ext)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
                Section {
                    Button("Add random number prefix") { confirm = true }
                        .disabled(source == nil || cleanExt.isEmpty)
                } footer: {
                    Text("Files ending in .\(cleanExt.isEmpty ? "ext" : cleanExt) become e.g. 483920_name.\(cleanExt.isEmpty ? "ext" : cleanExt). Folders: subfolders are not touched.")
                }
                if !log.isEmpty {
                    Section("Result") { ForEach(log, id: \.self) { Text($0).font(.footnote) } }
                }
            }
            .navigationTitle("Prefix Renamer")
        }
        .navigationViewStyle(.stack)
        .sheet(isPresented: $pickFolder) {
            DocPicker(types: [.folder], multiple: false) { urls in
                if let u = urls.first { choose(folder: u) }
            }.ignoresSafeArea()
        }
        .sheet(isPresented: $pickFiles) {
            DocPicker(types: [.item], multiple: true) { urls in choose(files: urls) }.ignoresSafeArea()
        }
        .alert("Rename files?", isPresented: $confirm) {
            Button("Rename", role: .destructive) { run() }
            Button("Cancel", role: .cancel) {}
        } message: { Text("This renames files on disk and can't be undone automatically.") }
    }

    private func release() {
        held.forEach { $0.stopAccessingSecurityScopedResource() }
        held = []
    }

    private func choose(folder: URL) {
        release(); log = []
        let ok = folder.startAccessingSecurityScopedResource()
        if ok { held = [folder] }
        source = .folder(folder)
        switch listFolder(folder) {
        case .success(let names): info = "Access \(ok ? "granted" : "not reported"); \(names.count) item(s) in this folder."
        case .failure(let e): info = "Chosen, but can't read it (\(ok ? "access granted" : "no access")): \(e.localizedDescription)"
        }
    }

    private func choose(files: [URL]) {
        release(); log = []
        held = files.filter { $0.startAccessingSecurityScopedResource() }
        source = .files(files)
        info = "Access granted to \(held.count) of \(files.count) file(s)."
    }

    private func listFolder(_ folder: URL) -> Result<[String], Error> {
        var coordErr: NSError?
        var result: Result<[String], Error> = .success([])
        NSFileCoordinator().coordinate(readingItemAt: folder, options: [], error: &coordErr) { url in
            do { result = .success(try FileManager.default.contentsOfDirectory(atPath: url.path)) }
            catch { result = .failure(error) }
        }
        if let e = coordErr { return .failure(e) }
        return result
    }

    private func move(_ from: URL, _ to: URL) throws {
        var coordErr: NSError?
        var inner: Error?
        NSFileCoordinator().coordinate(writingItemAt: from, options: .forMoving,
                                       writingItemAt: to, options: .forReplacing, error: &coordErr) { s, d in
            do { try FileManager.default.moveItem(at: s, to: d) } catch { inner = error }
        }
        if let e = coordErr { throw e }
        if let e = inner { throw e }
    }

    private func run() {
        var targets: [URL] = []
        var taken = Set<String>()
        var out: [String] = []
        switch source {
        case .folder(let f):
            switch listFolder(f) {
            case .success(let names):
                taken = Set(names)
                targets = names.filter { ($0 as NSString).pathExtension.lowercased() == cleanExt }
                    .map { f.appendingPathComponent($0) }
            case .failure(let e):
                log = ["Couldn't read the folder: \(e.localizedDescription)"]; return
            }
        case .files(let fs):
            targets = fs.filter { $0.pathExtension.lowercased() == cleanExt }
        case nil: return
        }
        var done = 0
        for url in targets {
            let dir = url.deletingLastPathComponent()
            var newName = ""
            repeat { newName = "\(Int.random(in: 100_000...999_999))_\(url.lastPathComponent)" } while taken.contains(newName)
            do {
                try move(url, dir.appendingPathComponent(newName))
                taken.insert(newName); done += 1
            } catch { out.append("Failed \(url.lastPathComponent): \(error.localizedDescription)") }
        }
        log = ["Renamed \(done) of \(targets.count) file(s)."] + out
    }
}

struct DocPicker: UIViewControllerRepresentable {
    let types: [UTType]
    let multiple: Bool
    let onPick: ([URL]) -> Void

    func makeUIViewController(context: Context) -> UIDocumentPickerViewController {
        let p = UIDocumentPickerViewController(forOpeningContentTypes: types, asCopy: false)
        p.allowsMultipleSelection = multiple
        p.delegate = context.coordinator
        return p
    }
    func updateUIViewController(_ vc: UIDocumentPickerViewController, context: Context) {}
    func makeCoordinator() -> Coord { Coord(onPick) }

    final class Coord: NSObject, UIDocumentPickerDelegate {
        let onPick: ([URL]) -> Void
        init(_ f: @escaping ([URL]) -> Void) { onPick = f }
        func documentPicker(_ c: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) { onPick(urls) }
    }
}
