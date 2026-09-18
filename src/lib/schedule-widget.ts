import { registerPlugin } from "@capacitor/core";

import { isNativeApp } from "@/lib/native-app";

export type WidgetScheduleItem = {
  title: string;
  time: string;
  location: string | null;
};

interface ScheduleWidgetNativePlugin {
  setTodayEvents(options: { eventsJson: string }): Promise<void>;
}

// Local Swift plugin, not an npm package -- see
// ios/ios/App/App/ScheduleWidgetPlugin.swift (same "drop a Swift file in
// the App target" pattern NativeAuthPlugin.swift already uses).
const ScheduleWidget = registerPlugin<ScheduleWidgetNativePlugin>("ScheduleWidget");

/**
 * Pushes today's up-to-5 schedule items to the iOS home screen widget's
 * shared storage and asks WidgetKit to refresh it. A no-op everywhere
 * except the native iOS app (see isNativeApp) -- the widget only exists
 * there, and there's nothing for Android/web to do here.
 *
 * Deliberately swallows all errors: a stale or missing widget update is a
 * cosmetic problem, never worth surfacing as an error toast to the
 * student, and this can be called opportunistically/often (e.g. every time
 * today's schedule is recomputed) without worrying about noisy failures.
 */
export async function syncScheduleWidget(events: WidgetScheduleItem[]): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await ScheduleWidget.setTodayEvents({ eventsJson: JSON.stringify(events.slice(0, 5)) });
  } catch (err) {
    console.error("[schedule-widget] failed to sync", err);
  }
}
