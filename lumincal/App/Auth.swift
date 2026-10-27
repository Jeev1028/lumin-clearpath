import AuthenticationServices
import SwiftUI

/// Signs in through the Lumin website (so every sign-in method works, including
/// Google and two-step verification) and receives a calendar link back.
final class AuthPresenter: NSObject, ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow } ?? ASPresentationAnchor()
    }
}

extension CalendarStore {
    var isSignedIn: Bool { !feedURL.isEmpty }

    func signIn() async {
        guard let url = URL(string: "https://luminclearpath.ca/app-link") else { return }
        let presenter = AuthPresenter()
        let callback: URL? = await withCheckedContinuation { cont in
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: "lumincal") { cb, _ in
                cont.resume(returning: cb)
            }
            session.presentationContextProvider = presenter
            session.prefersEphemeralWebBrowserSession = false
            // Keep the session and presenter alive until it finishes.
            Self.activeSession = (session, presenter)
            if !session.start() { cont.resume(returning: nil) }
        }
        Self.activeSession = nil
        guard let callback,
              let comps = URLComponents(url: callback, resolvingAgainstBaseURL: false),
              let link = comps.queryItems?.first(where: { $0.name == "url" })?.value,
              !link.isEmpty else {
            status = "Sign-in was cancelled or did not finish."
            return
        }
        await setFeed(link)
    }

    func signOut() async {
        await setFeed("")
    }
}

extension CalendarStore {
    nonisolated(unsafe) static var activeSession: (ASWebAuthenticationSession, AuthPresenter)?
}
