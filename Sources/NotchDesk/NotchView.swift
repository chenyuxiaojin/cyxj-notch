import AppKit
import SwiftUI

final class NotchModel: ObservableObject {
    @Published var snap = Snapshot()
    @Published var expanded = false
    /// 刚跑完的对话（id → 跑完的时刻），刘海亮一下绿勾
    @Published var finished: [String: Date] = [:]
    /// 展开后面板按内容量自动长高，这里记最近一次量到的高度
    @Published var panelHeight: CGFloat = 360

    var notchWidth: CGFloat = 200
    var notchHeight: CGFloat = 32

    static let flashSeconds: TimeInterval = 10
    static let panelWidth: CGFloat = 480
    /// 窗口按最大尺寸开，面板在里面按内容伸缩
    static let windowSize = CGSize(width: panelWidth, height: 820)

    private var wasWorking: [String: Bool] = [:]

    func refresh() {
        let next = Feed.load()

        for row in next.sessions {
            if wasWorking[row.id] == true && !row.working { finished[row.id] = Date() }
            wasWorking[row.id] = row.working
        }
        finished = finished.filter { Date().timeIntervalSince($0.value) < Self.flashSeconds }
        snap = next
    }

    /// 收起时跟硬件刘海一样大，藏在刘海里看不出来
    var collapsedSize: CGSize {
        CGSize(width: notchWidth, height: notchHeight)
    }

    var expandedSize: CGSize {
        CGSize(width: Self.panelWidth, height: min(panelHeight, Self.windowSize.height))
    }
}

/// 下面两个角圆、上面贴屏幕顶的黑块，跟刘海连成一体
struct NotchShape: Shape {
    var radius: CGFloat

    var animatableData: CGFloat {
        get { radius }
        set { radius = newValue }
    }

    func path(in rect: CGRect) -> Path {
        Path(roundedRect: rect, cornerRadii: .init(bottomLeading: radius, bottomTrailing: radius))
    }
}

/// 透出窗口后面内容的系统毛玻璃
struct Glass: NSViewRepresentable {
    func makeNSView(context: Context) -> NSVisualEffectView {
        let view = NSVisualEffectView()
        view.material = .hudWindow
        view.blendingMode = .behindWindow
        view.state = .active
        return view
    }

    func updateNSView(_ view: NSVisualEffectView, context: Context) {}
}

/// 贴刘海那一截纯黑，往下一路渐变、越往下越透；收起时整块都在黑的范围里，就是一块刘海
struct NotchBackground: View {
    let notchHeight: CGFloat
    let height: CGFloat

    var body: some View {
        let h = max(height, 1)
        // 每个位置都不小于上一个，收起时（高度 = 刘海高）全部挤到 1，整块纯黑
        var at: CGFloat = min(notchHeight / h, 1)
        let solid = at
        func next(_ y: CGFloat) -> CGFloat { at = min(max(at, y), 1); return at }

        return ZStack {
            Glass()
            LinearGradient(
                stops: [
                    .init(color: .black, location: 0),
                    .init(color: .black, location: solid),
                    .init(color: .black.opacity(0.82), location: next(solid + 30 / h)),
                    .init(color: .black.opacity(0.58), location: next(0.45)),
                    .init(color: .black.opacity(0.38), location: next(0.8)),
                    .init(color: .black.opacity(0.3), location: 1),
                ],
                startPoint: .top,
                endPoint: .bottom
            )
            // 底部一层很淡的亮光，玻璃更有厚度
            LinearGradient(colors: [.clear, .white.opacity(0.05)], startPoint: .center, endPoint: .bottom)
        }
    }
}

private struct HeightKey: PreferenceKey {
    static var defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = max(value, nextValue()) }
}

struct NotchView: View {
    @ObservedObject var model: NotchModel

    var body: some View {
        let size = model.expanded ? model.expandedSize : model.collapsedSize
        let shape = NotchShape(radius: model.expanded ? 24 : 10)

        ZStack(alignment: .top) {
            NotchBackground(notchHeight: model.notchHeight, height: size.height)
                .frame(width: size.width, height: size.height)
                .clipShape(shape)
                .overlay(shape.stroke(.white.opacity(model.expanded ? 0.1 : 0), lineWidth: 0.5))

            if model.expanded {
                Panel(model: model)
                    .frame(width: NotchModel.panelWidth)
                    .fixedSize(horizontal: false, vertical: true)
                    .background(GeometryReader { Color.clear.preference(key: HeightKey.self, value: $0.size.height) })
                    // 出场：内容先快速淡掉，外壳再收回去
                    .transition(.asymmetric(insertion: .identity, removal: .opacity.animation(.easeOut(duration: 0.1))))
            }
        }
        .onPreferenceChange(HeightKey.self) { h in
            if h > 0 { model.panelHeight = h }
        }
        .frame(width: NotchModel.windowSize.width, height: NotchModel.windowSize.height, alignment: .top)
        // 进场用带一点回弹的弹簧，慢一些显得从容；出场更快、不回弹，干脆利落
        .animation(model.expanded ? Motion.open : Motion.close, value: model.expanded)
        .animation(.easeInOut(duration: 0.2), value: model.panelHeight)
        .preferredColorScheme(.dark)
    }
}

// MARK: - 动效

enum Motion {
    static let open = Animation.spring(response: 0.42, dampingFraction: 0.78)
    static let close = Animation.spring(response: 0.26, dampingFraction: 1)
}

/// 内容依次浮现：从上方 8 点、带一点虚化和缩小，跟在外壳后面一块接一块出来
struct Reveal: ViewModifier {
    let index: Int
    let shown: Bool

    func body(content: Content) -> some View {
        content
            .opacity(shown ? 1 : 0)
            .offset(y: shown ? 0 : -8)
            .scaleEffect(shown ? 1 : 0.97, anchor: .top)
            .blur(radius: shown ? 0 : 6)
            .animation(
                shown ? .spring(response: 0.4, dampingFraction: 0.86).delay(0.08 + Double(index) * 0.045) : nil,
                value: shown
            )
    }
}

extension View {
    func reveal(_ index: Int, _ shown: Bool) -> some View { modifier(Reveal(index: index, shown: shown)) }
}

// MARK: - 配色

enum Palette {
    static let card = Color.white.opacity(0.08)
    static let label = Color.white.opacity(0.5)
    static let dim = Color.white.opacity(0.68)
    static let working = Color(red: 1.0, green: 0.62, blue: 0.25)
    static let done = Color(red: 0.35, green: 0.85, blue: 0.5)
    static let idle = Color.white.opacity(0.3)
}

struct PulseDot: View {
    var size: CGFloat = 7
    @State private var on = false

    var body: some View {
        Circle()
            .fill(Palette.working)
            .frame(width: size, height: size)
            .opacity(on ? 1 : 0.3)
            .onAppear {
                withAnimation(.easeInOut(duration: 0.8).repeatForever()) { on = true }
            }
    }
}

// MARK: - 展开后的面板

struct Panel: View {
    @ObservedObject var model: NotchModel
    @State private var shown = false

    var body: some View {
        let snap = model.snap

        VStack(alignment: .leading, spacing: 16) {
            Color.clear.frame(height: model.notchHeight - 8)

            QuotaCards(limits: snap.limits, sessions: snap.sessions).reveal(0, shown)

            Block(title: "Claude Code 对话", count: snap.sessions.count) {
                if snap.sessions.isEmpty {
                    Text("现在没开着的对话").foregroundStyle(Palette.dim)
                }
                ForEach(snap.sessions) { row in
                    SessionCard(row: row, justFinished: model.finished[row.id] != nil)
                }
            }
            .reveal(1, shown)

            if !snap.versions.isEmpty {
                Block(title: "版本预览", count: snap.versions.count) {
                    ForEach(snap.versions, id: \.self) { VersionLine(row: $0) }
                }
                .reveal(2, shown)
            }

            if let todo = snap.todo, !todo.busy.isEmpty || !todo.wrapUp.isEmpty {
                TodoBlock(todo: todo).reveal(3, shown)
            }

            if let pulse = snap.pulse {
                PulseBar(text: pulse.text).reveal(4, shown)
            }
        }
        .font(.system(size: 13))
        .foregroundStyle(.white)
        .padding(.horizontal, 20)
        .padding(.bottom, 18)
        // 先按「没出现」画一帧，下一帧再切成出现，动画才会跑
        .onAppear { DispatchQueue.main.async { shown = true } }
    }
}

/// 一块内容：小标题 + 内容
struct Block<Content: View>: View {
    let title: String
    let count: Int?
    @ViewBuilder var content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Text(title)
                if let count { Text("\(count)").monospacedDigit().opacity(0.7) }
            }
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(Palette.label)
            .padding(.leading, 2)

            content
        }
    }
}

// MARK: - 额度 + 缓存最快凉的对话

struct QuotaCards: View {
    let limits: [Limit]
    let sessions: [SessionRow]

    var body: some View {
        let five = limits.first { $0.kind == "five_hour" }
        let week = limits.first { $0.kind == "seven_day" }

        HStack(spacing: 10) {
            quota("5 小时额度", five, resetTime)
            quota("本周额度", week, resetWeekday)
            // 只在有对话停着、缓存还热时出现；都在干活就不占位置
            if let (row, minutes) = coolestSession {
                StatCard(
                    label: "缓存最快凉",
                    number: "\(minutes)",
                    unit: "分钟",
                    fraction: Double(minutes) / 60,
                    color: cacheColor(minutes),
                    note: row.project
                )
                .transition(.opacity.combined(with: .scale(scale: 0.95)))
            }
        }
        .animation(Motion.open, value: coolestSession?.0.id)
    }

    /// 停着的对话里，缓存剩得最少的那个（已经凉了的不算，救不回来）
    private var coolestSession: (SessionRow, Int)? {
        sessions
            .filter { !$0.working }
            .compactMap { row in row.cache.flatMap(cacheMinutes).map { (row, $0) } }
            .min { $0.1 < $1.1 }
    }

    private func quota(_ label: String, _ limit: Limit?, _ reset: (Date) -> String) -> StatCard {
        let value = limit?.percentUsed
        return StatCard(
            label: label,
            number: value.map { "\(Int($0.rounded()))" } ?? "—",
            unit: value == nil ? nil : "%",
            fraction: (value ?? 0) / 100,
            color: limitColor(value),
            note: limit?.resetsAt.flatMap(parseISO).map(reset)
        )
    }

    private func resetTime(_ date: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "HH:mm"
        return "\(f.string(from: date)) 重置"
    }

    private func resetWeekday(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "zh_CN")
        f.dateFormat = "EEE"
        return "\(f.string(from: date))重置"
    }
}

/// 顶部一张小卡：标题、大数字、进度条、底下一行小字
struct StatCard: View {
    let label: String
    let number: String
    let unit: String?
    let fraction: Double
    let color: Color
    let note: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.system(size: 11, weight: .medium)).foregroundStyle(Palette.label)
            HStack(alignment: .firstTextBaseline, spacing: 2) {
                Text(number).font(.system(size: 24, weight: .semibold, design: .rounded).monospacedDigit())
                if let unit {
                    Text(unit).font(.system(size: 12, weight: .semibold, design: .rounded)).foregroundStyle(Palette.dim)
                }
            }
            .foregroundStyle(color)
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(.white.opacity(0.1))
                    Capsule().fill(color).frame(width: max(4, geo.size.width * min(max(fraction, 0), 1)))
                }
            }
            .frame(height: 4)
            Text(note ?? " ").font(.system(size: 10.5)).foregroundStyle(Palette.label).lineLimit(1)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Palette.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

// MARK: - 对话

struct SessionCard: View {
    let row: SessionRow
    let justFinished: Bool
    @State private var hovering = false

    private var status: (String, Color) {
        if justFinished { return ("刚跑完", Palette.done) }
        if row.working { return ("运行中", Palette.working) }
        return ("空闲", Palette.idle)
    }

    var body: some View {
        let (label, color) = status

        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Group {
                    if justFinished {
                        Image(systemName: "checkmark.circle.fill").font(.system(size: 11)).foregroundStyle(color)
                    } else if row.working {
                        PulseDot(size: 8)
                    } else {
                        Circle().fill(color).frame(width: 8, height: 8)
                    }
                }
                .frame(width: 12)

                Text(row.project).font(.system(size: 13, weight: .medium)).lineLimit(1)
                Spacer(minLength: 8)
                Text(label)
                    .font(.system(size: 10.5, weight: .semibold))
                    .foregroundStyle(color)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 2)
                    .background(color.opacity(0.15), in: Capsule())
            }

            if let detail {
                Text(detail)
                    .font(.system(size: 11.5))
                    .foregroundStyle(Palette.dim)
                    .lineLimit(1)
                    .padding(.leading, 20)
            }

            if let p = row.progress, p.total > 0, p.done < p.total {
                ProgressLine(done: p.done, total: p.total).padding(.leading, 20)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .background(hovering ? Color.white.opacity(0.13) : Palette.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .contentShape(Rectangle())
        .onHover { hovering = $0 && row.tty != nil }
        .onTapGesture { if let tty = row.tty { Terminal.focus(tty) } }
    }

    /// 第二行：有进度看进度；停下了看缓存还热多久（干活时缓存一直是满的，不显示）
    private var detail: String? {
        if let p = row.progress, p.done < p.total {
            return "第 \(p.done + 1)/\(p.total) 步 · \(p.now)"
        }
        if !row.working, let cache = row.cache {
            return plainCache(cache)
        }
        return nil
    }
}

/// 让系统「终端」切到某个标签页并提到最前（第一次会弹窗问能不能控制终端）
enum Terminal {
    private static let script = """
    on run argv
        set target to item 1 of argv
        tell application "Terminal"
            repeat with w in windows
                repeat with t in tabs of w
                    if tty of t is target then
                        set selected of t to true
                        set index of w to 1
                        activate
                        return
                    end if
                end repeat
            end repeat
        end tell
    end run
    """

    static func focus(_ tty: String) {
        let task = Process()
        task.executableURL = URL(fileURLWithPath: "/usr/bin/osascript")
        task.arguments = ["-e", script, tty]
        try? task.run()
    }
}

struct ProgressLine: View {
    let done: Int
    let total: Int

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(.white.opacity(0.1))
                Capsule().fill(Palette.working).frame(width: geo.size.width * CGFloat(done) / CGFloat(total))
            }
        }
        .frame(height: 3)
    }
}

struct VersionLine: View {
    let row: VersionRow

    var body: some View {
        HStack(spacing: 8) {
            Circle().fill(row.isRunning ? Color.yellow : Palette.done).frame(width: 7, height: 7)
            Text(row.label).font(.system(size: 13, weight: .medium)).lineLimit(1)
            Text(row.effort).font(.system(size: 11)).foregroundStyle(Palette.working)
            Text(row.state).font(.system(size: 11.5)).foregroundStyle(Palette.dim).lineLimit(1)
            Spacer(minLength: 4)
            if let port = row.port {
                Button {
                    if let url = URL(string: "http://localhost:\(port)") { NSWorkspace.shared.open(url) }
                } label: {
                    Text(verbatim: "打开 :\(port)").font(.system(size: 11, weight: .medium))
                }
                .buttonStyle(.plain)
                .foregroundStyle(.cyan)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Palette.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

// MARK: - 内容待办（todo-pane 从 NOTCH_TODO_LOG 指的 Markdown 里读）

/// 「下一步」开头写着轮到谁：我: / AI: / 等 10-13 14:59:
/// 「我」可以换成自己的名字：defaults write com.xiaochen.notchdesk ownerName 你的名字
struct NextStep {
    enum Owner: Int { case me, ai, unknown, wait }

    static let me = UserDefaults.standard.string(forKey: "ownerName") ?? "我"

    let owner: Owner
    let time: String?
    let text: String

    init(_ raw: String) {
        let pattern = "^(\(NSRegularExpression.escapedPattern(for: Self.me))|AI|等 ([^:：]+))[:：]\\s*"
        if let r = raw.range(of: pattern, options: .regularExpression) {
            let head = String(raw[r])
            text = String(raw[r.upperBound...])
            if head.hasPrefix(Self.me) {
                (owner, time) = (.me, nil)
            } else if head.hasPrefix("AI") {
                (owner, time) = (.ai, nil)
            } else {
                let t = head.dropFirst(2).trimmingCharacters(in: CharacterSet(charactersIn: ":： "))
                (owner, time) = (.wait, t)
            }
        } else {
            // 没按格式写：截到第一步为止，开头是自己名字的也算轮到你
            let cut = raw.firstIndex { "→;；。".contains($0) } ?? raw.endIndex
            text = raw[..<cut].trimmingCharacters(in: .whitespaces)
            (owner, time) = (raw.hasPrefix(Self.me) ? .me : .unknown, nil)
        }
    }
}

struct TodoBlock: View {
    let todo: TodoFeed
    private let shown = 3

    /// 轮到你的排最前，其次 AI 能接的，等时间点的最后；同一类保持 log 里的顺序
    private var rows: [(TodoItem, NextStep?)] {
        todo.busy.enumerated()
            .map { (offset: $0.offset, item: $0.element, step: $0.element.next.map(NextStep.init)) }
            .sorted {
                let a = $0.step?.owner.rawValue ?? NextStep.Owner.unknown.rawValue
                let b = $1.step?.owner.rawValue ?? NextStep.Owner.unknown.rawValue
                return a != b ? a < b : $0.offset < $1.offset
            }
            .map { ($0.item, $0.step) }
    }

    var body: some View {
        Block(title: "正在推进的内容", count: todo.busy.count) {
            VStack(alignment: .leading, spacing: 0) {
                ForEach(Array(rows.prefix(shown).enumerated()), id: \.offset) { i, row in
                    if i > 0 { Divider().overlay(.white.opacity(0.06)).padding(.leading, 12) }
                    TodoRow(item: row.0, step: row.1)
                }

                if todo.busy.count > shown || !todo.wrapUp.isEmpty {
                    Divider().overlay(.white.opacity(0.06))
                    HStack(spacing: 6) {
                        if todo.busy.count > shown {
                            Text("还有 \(todo.busy.count - shown) 项")
                        }
                        Spacer(minLength: 0)
                        if !todo.wrapUp.isEmpty {
                            Text("已发布、等收尾 \(todo.wrapUp.count) 条")
                                .padding(.horizontal, 7)
                                .padding(.vertical, 2)
                                .background(.white.opacity(0.08), in: Capsule())
                        }
                    }
                    .font(.system(size: 11))
                    .foregroundStyle(Palette.dim)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 7)
                }
            }
            .background(Palette.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
    }
}

struct TodoRow: View {
    let item: TodoItem
    let step: NextStep?

    var body: some View {
        let mine = step?.owner == .me

        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 6) {
                Text(item.title).font(.system(size: 13, weight: .medium)).lineLimit(1)
                Spacer(minLength: 4)
                if mine {
                    Chip(text: "等你", color: Palette.working)
                } else if let time = step?.time {
                    Chip(text: time, color: .white)
                } else if step?.owner == .ai {
                    Chip(text: "AI 接手", color: .white)
                }
            }
            if let step, !step.text.isEmpty {
                Text(step.text).font(.system(size: 11.5)).foregroundStyle(Palette.dim).lineLimit(2)
            }
        }
        // 不用你动手的那几条压暗一点
        .opacity(mine ? 1 : 0.72)
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct Chip: View {
    let text: String
    let color: Color

    var body: some View {
        Text(text)
            .font(.system(size: 10.5, weight: .semibold).monospacedDigit())
            .foregroundStyle(color)
            .padding(.horizontal, 7)
            .padding(.vertical, 2)
            .background(color.opacity(0.15), in: Capsule())
    }
}

// MARK: - 发片节奏

struct PulseBar: View {
    let text: String

    var body: some View {
        let (color, body) = splitPulse(text)

        HStack(spacing: 8) {
            Image(systemName: "paperplane.fill").font(.system(size: 11)).foregroundStyle(color)
            Text(body).font(.system(size: 12)).lineLimit(1)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .background(color.opacity(0.12), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

// MARK: - 小工具

func percent(_ limits: [Limit], _ kind: String) -> Double? {
    limits.first { $0.kind == kind }?.percentUsed
}

/// 缓存剩不到 5 分钟标红，不到 15 分钟标黄
func cacheColor(_ minutes: Int) -> Color {
    minutes <= 5 ? .red : minutes <= 15 ? .yellow : .white
}

/// 从「🔥 缓存 43 分钟」里取出 43；已凉的返回 nil
func cacheMinutes(_ s: String) -> Int? {
    guard let r = s.range(of: #"缓存 (\d+) 分钟"#, options: .regularExpression) else { return nil }
    return Int(s[r].filter(\.isNumber))
}

func limitColor(_ value: Double?) -> Color {
    guard let value else { return .white.opacity(0.6) }
    return value >= 90 ? .red : value >= 70 ? .yellow : .white
}

func parseISO(_ s: String) -> Date? {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f.date(from: s) ?? ISO8601DateFormatter().date(from: s)
}

/// 「🔥 缓存 43 分钟」→「缓存还热 43 分钟」；「🧊 缓存已凉 · …」去掉表情
func plainCache(_ s: String) -> String {
    let t = s.replacingOccurrences(of: "🔥", with: "").replacingOccurrences(of: "🧊", with: "")
        .trimmingCharacters(in: .whitespaces)
    return t.hasPrefix("缓存 ") ? "缓存还热" + t.dropFirst(2) : t
}

/// 发片节奏开头的 🟢🟡🔴 换成颜色，正文去掉表情
func splitPulse(_ s: String) -> (Color, String) {
    let marks: [(String, Color)] = [("🟢", Palette.done), ("🟡", .yellow), ("🔴", .red)]
    for (mark, color) in marks where s.hasPrefix(mark) {
        return (color, String(s.dropFirst(mark.count)).trimmingCharacters(in: .whitespaces))
    }
    return (Palette.dim, s)
}
