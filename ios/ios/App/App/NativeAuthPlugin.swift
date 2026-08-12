import Foundation
import Capacitor
import AuthenticationServices
import UIKit

/**
 * A small local Capacitor plugin (not an npm package -- just a Swift file
 * dropped directly into the App target, which Capacitor auto-discovers the
 * same way it discovers any other plugin) that runs Google sign-in as a
 * fully native OAuth flow, talking to Google directly rather than routing
 * through Supabase's server-side redirect.
 *
 * Why: Supabase's signInWithOAuth() redirect flow necessarily bounces
 * through https://<project>.supabase.co/auth/v1/callback before coming back
 * to the app (Supabase's server has to receive the authorization code
 * first). Because Google's consent screen can only show verified-domain
 * branding, and nobody can verify ownership of supabase.co except Supabase,
 * the consent screen shows the raw supabase.co domain instead of the app's
 * real branding. Talking to Google directly (same idea as the web/GIS flow)
 * avoids that hop entirely, so the consent screen shows the app's actual
 * verified domain, matching the web experience. The resulting ID token is
 * then handed to supabase.auth.signInWithIdToken() on the JS side to
 * actually create the Supabase session.
 *
 * `authenticate` opens any URL via ASWebAuthenticationSession and resolves
 * with the callback URL once redirected to the given custom scheme -- used
 * here to run Google's OAuth 2.0 authorization-code-with-PKCE flow for
 * native/installed apps. ASWebAuthenticationSession is Apple's purpose-built
 * API for this "open a URL, wait for a redirect to a custom scheme" pattern:
 * it intercepts the callback directly via a completion handler, so the
 * browser never actually attempts to *navigate* to the non-http(s) scheme
 * (which is what caused "Safari cannot open the page" errors with the old
 * SFSafariViewController + appUrlOpen approach). It also shares Safari's
 * cookies/session by default (prefersEphemeralWebBrowserSession = false), so
 * a signed-in Google account in Safari shows up as a one-tap account picker
 * here too, and `prompt=select_account` (set on the JS side) surfaces
 * Safari's other signed-in accounts for the user to pick between.
 *
 * `exchangeGoogleCode` finishes the PKCE flow: it POSTs the authorization
 * code (plus the original code_verifier) to Google's token endpoint and
 * returns the resulting ID token. This runs natively (URLSession) rather
 * than via a JS fetch() specifically to avoid any WKWebView CORS
 * uncertainty around calling Google's token endpoint directly from the page.
 */
@objc(NativeAuthPlugin)
public class NativeAuthPlugin: CAPPlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {
    public let identifier = "NativeAuthPlugin"
    public let jsName = "NativeAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "exchangeGoogleCode", returnType: CAPPluginReturnPromise)
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

    @objc func exchangeGoogleCode(_ call: CAPPluginCall) {
        guard let code = call.getString("code"),
              let codeVerifier = call.getString("codeVerifier"),
              let clientId = call.getString("clientId"),
              let redirectUri = call.getString("redirectUri") else {
            call.reject("Missing required parameters (code, codeVerifier, clientId, redirectUri)")
            return
        }

        var request = URLRequest(url: URL(string: "https://oauth2.googleapis.com/token")!)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")

        var components = URLComponents()
        components.queryItems = [
            URLQueryItem(name: "code", value: code),
            URLQueryItem(name: "client_id", value: clientId),
            URLQueryItem(name: "redirect_uri", value: redirectUri),
            URLQueryItem(name: "grant_type", value: "authorization_code"),
            URLQueryItem(name: "code_verifier", value: codeVerifier)
        ]
        request.httpBody = components.percentEncodedQuery?.data(using: .utf8)

        let task = URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                call.reject(error.localizedDescription)
                return
            }
            guard let data = data,
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                call.reject("Invalid response from Google")
                return
            }
            if let errorDescription = json["error_description"] as? String {
                call.reject(errorDescription)
                return
            }
            if let errorStr = json["error"] as? String {
                call.reject(errorStr)
                return
            }
            guard let idToken = json["id_token"] as? String else {
                call.reject("No id_token in Google's token response")
                return
            }
            call.resolve(["idToken": idToken])
        }
        task.resume()
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
