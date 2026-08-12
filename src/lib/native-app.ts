declare global {
  interface Window {
    Capacitor?: {
      isNativePlatform?: () => boolean;
      getPlatform?: () => string;
    };
  }
}

/**
 * True when running inside the Capacitor-wrapped iOS app (a real WKWebView
 * native shell, not a browser tab) -- Capacitor injects this global into any
 * page it loads, so this works without the web app itself depending on
 * @capacitor/core just to detect the context.
 */
export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(window.Capacitor?.isNativePlatform?.());
}

/**
 * True when running inside the installed Android app (a Trusted Web
 * Activity) -- Chrome sets this referrer scheme specifically for TWA
 * launches, distinguishing it from a normal browser tab.
 */
export function isAndroidTwa(): boolean {
  if (typeof document === "undefined") return false;
  return document.referrer.startsWith("android-app://");
}

/** True for either installed-app context (iOS Capacitor shell or Android
 * TWA), as opposed to a regular browser tab. */
export function isInstalledApp(): boolean {
  return isNativeApp() || isAndroidTwa();
}
