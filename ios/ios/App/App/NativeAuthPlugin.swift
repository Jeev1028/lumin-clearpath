import Foundation
import Capacitor
import AuthenticationServices
import UIKit

/**
 * A small local Capacitor plugin (not an npm package -- just a Swift file
 * dropped directly into the App target, which Capacitor auto-discovers the
 * same way it discovers any other plugin) that runs an OAuth flow through
 * ASWebAuthenticationSession instead of a plain in-app browser.
 *
 * This exists specifically because @capacitor/browser's
 * SFSafariViewController, combined with catching the redirect via
 * @capacitor/app's appUrlOpen, proved unreliable in practice for the
 * custom-URL-scheme OAuth callback pattern (inconsistent "Safari cannot
 * open the page" errors across devices). ASWebAuthenticationSession is
 * Apple's purpose-built API for exactly this scenario: it watches for the
 * callback URL scheme itself and hands it back directly via a completion
 * handler, so the browser never actually attempts to "navigate" to the
 * custom-scheme URL at all -- there's no page-load step to fail.
 *
 * It also shares Safari's cookies/session by default
 * (prefersEphemeralWebBrowserSession = false), so a signed-in Google
 * account in Safari shows up as a one-tap account picker here too.
 */
@objc(NativeAuthPlugin)
public class NativeAuthPlugin: CAPPlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {
    public let identifier = "NativeAuthPlugin"
    public let jsName = "NativeAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise)
    ]

    // Held onto for the duration of the flow so ARC doesn't deallocate it
    // mid-session.
    private var session: ASWebAuthenticationSession?

    @objc func authenticate(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"), let url = URL(string: urlString) else {
            call.reject("Missing or invalid 'url'")
            return
        }
        guard let callbackScheme = call.getString("callbackScheme") else {
            call.reject("Missing 'callbackScheme'")
            return
        }

        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }

            let session = ASWebAuthenticationSession(
                url: url,
                callbackURLScheme: callbackScheme
            ) { callbackURL, error in
                if let error = error {
                    let nsError = error as NSError
                    // Code 1 on ASWebAuthenticationSessionError is the user
                    // dismissing it themselves -- not a real failure.
                    if nsError.domain == ASWebAuthenticationSessionErrorDomain && nsError.code == 1 {
                        call.reject("cancelled")
                    } else {
                        call.reject(error.localizedDescription)
                    }
                    return
                }
                guard let callbackURL = callbackURL else {
                    call.reject("No callback URL received")
                    return
                }
                call.resolve(["url": callbackURL.absoluteString])
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            self.session = session
            session.start()
        }
    }

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        if let window = self.bridge?.viewController?.view.window {
            return window
        }
        if let window = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .flatMap({ $0.windows })
            .first(where: { $0.isKeyWindow }) {
            return window
        }
        return ASPresentationAnchor()
    }
}
