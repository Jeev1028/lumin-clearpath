import Foundation
import Capacitor
import WidgetKit

/**
 * Local Capacitor plugin (same "drop a Swift file directly into the App
 * target" pattern as NativeAuthPlugin.swift -- Capacitor auto-discovers it,
 * no separate npm package needed) that hands the web app's "today's
 * schedule" (computed in src/routes/home.tsx, sent via
 * src/lib/schedule-widget.ts) to the ScheduleWidget home screen widget.
 *
 * Widgets run in a separate process from the app and can't reach into the
 * app's WKWebView storage directly, so this writes the events (as a JSON
 * string -- kept as a single string rather than a structured array purely
 * to keep the plugin's argument-parsing surface small and unambiguous)
 * into an App Group-shared UserDefaults suite that both the app and the
 * widget extension can read, then asks WidgetKit to reload the widget's
 * timeline so it picks up the new data right away instead of waiting for
 * its next scheduled refresh.
 *
 * Requires the "App Groups" capability enabled on both this app target and
 * the ScheduleWidget extension target, sharing the same group id (see
 * appGroupId below) -- done via Xcode's Signing & Capabilities tab, not
 * from code. See ios/ios/ScheduleWidget/ScheduleWidgetModel.swift for the
 * widget-side reader.
 */
@objc(ScheduleWidgetPlugin)
public class ScheduleWidgetPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ScheduleWidgetPlugin"
    public let jsName = "ScheduleWidget"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setTodayEvents", returnType: CAPPluginReturnPromise)
    ]

    static let appGroupId = "group.ca.luminclearpath.ios"
    static let storageKey = "todayEventsJson"

    @objc func setTodayEvents(_ call: CAPPluginCall) {
        guard let eventsJson = call.getString("eventsJson") else {
            call.reject("Missing 'eventsJson'")
            return
        }

        guard let defaults = UserDefaults(suiteName: Self.appGroupId) else {
            call.reject("App Group '\(Self.appGroupId)' is not configured -- enable the App Groups capability in Xcode")
            return
        }
        defaults.set(eventsJson, forKey: Self.storageKey)

        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
        }

        call.resolve()
    }
}
