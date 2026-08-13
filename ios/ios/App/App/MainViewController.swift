import Capacitor
import UIKit
import WebKit

/// Resumes whatever page the user was last on instead of always restarting
/// at capacitor.config.json's hardcoded server.url.
///
/// iOS can (and does) fully terminate a backgrounded app under memory
/// pressure or after enough time away -- what feels to the user like
/// "reloading" is often actually the OS relaunching the whole app from
/// scratch. Capacitor's CAPBridgeViewController.loadWebView() is `final`
/// and always loads the app's one configured start URL on every fresh
/// launch, with no per-launch override point, so this subclass just lets
/// that default load happen once in viewDidLoad(), then immediately
/// redirects to the remembered page if there is one -- the same page
/// resumes instead of the whole app "reloading" back to the start screen.
///
/// See SceneDelegate.sceneDidEnterBackground for where the URL gets saved.
class MainViewController: CAPBridgeViewController {
    static let lastURLDefaultsKey = "clearpath.lastVisitedURL"

    override func viewDidLoad() {
        super.viewDidLoad()

        guard
            let saved = UserDefaults.standard.string(forKey: Self.lastURLDefaultsKey),
            let url = URL(string: saved),
            let host = url.host
        else { return }

        // Only ever resume a URL on our own domain -- never follow a
        // persisted URL that happened to point somewhere else (e.g. an
        // OAuth provider's domain, if the app was backgrounded mid sign-in).
        guard host == "luminclearpath.ca" || host.hasSuffix(".luminclearpath.ca") else { return }

        _ = webView?.load(URLRequest(url: url))
    }
}
