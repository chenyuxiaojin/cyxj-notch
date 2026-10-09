import AppKit
import SwiftUI

/// 能停在菜单栏那一层的无边框面板
final class NotchPanel: NSPanel {
    override var canBecomeKey: Bool { false }
    override var canBecomeMain: Bool { false }

    // 默认会把窗口挤到菜单栏下面，这里原样放行
    override func constrainFrameRect(_ frameRect: NSRect, to screen: NSScreen?) -> NSRect { frameRect }
}

/// 面板没被激活时，第一下点击也直接生效（点端口号不用点两次）
final class FirstClickHostingView<Content: View>: NSHostingView<Content> {
    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    private let model = NotchModel()
    private var panel: NotchPanel!
    private var screen: NSScreen?
    private var hoverSince: Date?
    private var leaveSince: Date?

    // 鼠标停在刘海上 0.15 秒才展开，路过菜单栏不会误触；离开 0.3 秒后收起
    private let openDelay: TimeInterval = 0.15
    private let closeDelay: TimeInterval = 0.3

    func applicationDidFinishLaunching(_ notification: Notification) {
        let size = NotchModel.windowSize
        panel = NotchPanel(
            contentRect: NSRect(origin: .zero, size: size),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        panel.level = NSWindow.Level(rawValue: Int(CGWindowLevelForKey(.mainMenuWindow)) + 2)
        panel.collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary, .ignoresCycle]
        panel.backgroundColor = .clear
        panel.isOpaque = false
        panel.hasShadow = false
        panel.ignoresMouseEvents = true
        panel.contentView = FirstClickHostingView(rootView: NotchView(model: model))

        place()
        panel.orderFrontRegardless()

        NotificationCenter.default.addObserver(
            forName: NSApplication.didChangeScreenParametersNotification, object: nil, queue: .main
        ) { [weak self] _ in self?.place() }

        model.refresh()
        Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in self?.model.refresh() }
        // NOTCH_OPEN=1 启动就展开且不收起（截图检查界面用）
        if ProcessInfo.processInfo.environment["NOTCH_OPEN"] == "1" {
            setExpanded(true)
            return
        }
        // 轮询鼠标位置，不需要辅助功能权限
        Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in self?.trackMouse() }
    }

    /// 放到带刘海的屏幕顶部正中；没有刘海屏（比如只接外屏）就放主屏，按一块假刘海算
    private func place() {
        let notched = NSScreen.screens.first { $0.safeAreaInsets.top > 0 }
        guard let target = notched ?? NSScreen.main else { return }
        screen = target

        if notched != nil, let left = target.auxiliaryTopLeftArea, let right = target.auxiliaryTopRightArea {
            model.notchWidth = target.frame.width - left.width - right.width
            model.notchHeight = target.safeAreaInsets.top
        } else {
            model.notchWidth = 200
            model.notchHeight = NSStatusBar.system.thickness
        }

        let size = NotchModel.windowSize
        let frame = target.frame
        panel.setFrame(
            NSRect(x: frame.midX - size.width / 2, y: frame.maxY - size.height, width: size.width, height: size.height),
            display: true
        )
        model.objectWillChange.send()
    }

    /// 当前黑块在屏幕上的范围
    private func activeRect() -> NSRect {
        guard let frame = screen?.frame else { return .zero }
        let size = model.expanded ? model.expandedSize : model.collapsedSize
        return NSRect(x: frame.midX - size.width / 2, y: frame.maxY - size.height, width: size.width, height: size.height)
    }

    private func trackMouse() {
        let point = NSEvent.mouseLocation

        if model.expanded {
            leaveSince = activeRect().insetBy(dx: -8, dy: -8).contains(point) ? nil : (leaveSince ?? Date())
            if let since = leaveSince, Date().timeIntervalSince(since) >= closeDelay { setExpanded(false) }
        } else {
            // 刘海本身矮，往下多给几个点的判定范围
            let hot = activeRect().insetBy(dx: 0, dy: -4)
            hoverSince = hot.contains(point) ? (hoverSince ?? Date()) : nil
            if let since = hoverSince, Date().timeIntervalSince(since) >= openDelay { setExpanded(true) }
        }
    }

    private func setExpanded(_ value: Bool) {
        hoverSince = nil
        leaveSince = nil
        guard model.expanded != value else { return }
        if value { model.refresh() }
        model.expanded = value
        // 收起时让点击穿透到菜单栏
        panel.ignoresMouseEvents = !value
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
