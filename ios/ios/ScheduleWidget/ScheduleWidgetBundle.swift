import WidgetKit
import SwiftUI

// Entry point for the widget extension target. A WidgetBundle can list
// multiple widgets; ClearPath only ships one today's-schedule widget, so
// this just wraps it.
@main
struct ScheduleWidgetBundle: WidgetBundle {
    var body: some Widget {
        ScheduleWidget()
    }
}
