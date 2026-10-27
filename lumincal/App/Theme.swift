import SwiftUI

/// The ClearPath night-blue palette, matched to the website.
enum Theme {
    static let background = Color(rgb: 0x0A1128)
    static let card = Color(rgb: 0x111D3C)
    static let border = Color(rgb: 0x24325A)
    static let primary = Color(rgb: 0x4EA1F0)
    static let accent = Color(rgb: 0x5CD3E6)
    static let muted = Color(rgb: 0x9FB0CC)
}

extension Color {
    init(rgb: UInt32) {
        self.init(
            red: Double((rgb >> 16) & 0xFF) / 255,
            green: Double((rgb >> 8) & 0xFF) / 255,
            blue: Double(rgb & 0xFF) / 255
        )
    }
}

/// Deep blue with a soft glow at the top, like the site's background.
struct NightBackground: View {
    var body: some View {
        ZStack {
            Theme.background
            RadialGradient(
                colors: [Theme.primary.opacity(0.28), .clear],
                center: .top, startRadius: 0, endRadius: 420
            )
        }
        .ignoresSafeArea()
    }
}

struct CardStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.card.opacity(0.85), in: RoundedRectangle(cornerRadius: 20))
            .overlay(RoundedRectangle(cornerRadius: 20).stroke(Theme.border, lineWidth: 1))
    }
}

extension View {
    func card() -> some View { modifier(CardStyle()) }
}
