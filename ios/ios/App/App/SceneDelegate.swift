import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = MainViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }

    // Remember the current page whenever the app is about to leave the
    // foreground, so a later cold launch (see MainViewController) can
    // resume there instead of resetting to the configured start URL. This
    // is what makes "reload" (which on iOS often really means the OS
    // killed the backgrounded app and relaunched it fresh) behave like
    // refreshing the current browser tab instead of restarting the whole
    // app back at the beginning.
    func sceneDidEnterBackground(_ scene: UIScene) {
        if let url = (window?.rootViewController as? MainViewController)?.webView?.url {
            UserDefaults.standard.set(url.absoluteString, forKey: MainViewController.lastURLDefaultsKey)
        }
    }
}
