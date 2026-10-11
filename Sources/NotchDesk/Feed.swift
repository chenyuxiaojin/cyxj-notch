import Foundation

// 读 claude-mods 写在 ~/.claude/notch/ 的数据。刘海台只读不写。

struct Limit: Decodable {
    let kind: String
    let percentUsed: Double
    let resetsAt: String?
}

struct QuotaFeed: Decodable {
    let id: String
    let ended: Bool?
    let cwd: String?
    let at: Double?
    let working: Bool?
    let cache: String?
    /// 缓存总共能热多久（分钟）：订阅 60，按量 5
    let ttl: Int?
    let model: String?
    let effort: Effort?
    let limits: [Limit]?
    /// 对话所在的终端标签页（/dev/ttys001）和终端 App（TERM_PROGRAM）
    let tty: String?
    let app: String?
}

/// 档位：一般是 low/medium/high/xhigh/max，也可能直接是个数字
enum Effort: Decodable {
    case level(String)
    case number(Int)

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let n = try? c.decode(Int.self) { self = .number(n) } else { self = .level(try c.decode(String.self)) }
    }

    var label: String {
        switch self {
        case .number(let n): return "\(n)"
        case .level(let s): return s
        }
    }
}

struct Progress: Decodable, Equatable {
    let done: Int
    let total: Int
    let now: String
}

struct ProgressFeed: Decodable {
    let id: String
    let at: Double
    let progress: Progress?
}

struct TodoItem: Decodable, Hashable {
    let title: String
    let next: String?
}

struct TodoFeed: Decodable {
    let at: Double
    let busy: [TodoItem]
    let wrapUp: [TodoItem]
}

struct PulseFeed: Decodable {
    let at: Double
    let text: String
}

struct VersionRow: Decodable, Hashable {
    let label: String
    let port: Int?
    let effort: String
    let state: String
    let isRunning: Bool
    let isVersion: Bool
}

struct VersionsFeed: Decodable {
    let at: Double
    let rows: [VersionRow]
}

/// 一个开着的 Claude Code 对话
struct SessionRow: Identifiable, Equatable {
    let id: String
    let project: String
    let working: Bool
    let cache: String?
    let cacheTTL: Int
    /// 模型和档位，如「Opus 5.5 · 高」
    let gear: String?
    let progress: Progress?
    /// 跑在系统「终端」里才有：点对话靠它跳回对应标签页
    let tty: String?
}

struct Snapshot {
    var sessions: [SessionRow] = []
    var limits: [Limit] = []
    var todo: TodoFeed?
    var pulse: PulseFeed?
    var versions: [VersionRow] = []
}

enum Feed {
    // NOTCH_FEED 指向别的文件夹时读那里（拿样例数据调界面用）
    static let root = ProcessInfo.processInfo.environment["NOTCH_FEED"].map { URL(fileURLWithPath: $0) }
        ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".claude/notch")

    // 额度每 60 秒刷一次，超过 150 秒没动静就当对话已经关了
    static let sessionAlive: Double = 150_000
    // 版本面板每 8 秒刷一次
    static let versionsAlive: Double = 30_000

    static func load() -> Snapshot {
        let now = Date().timeIntervalSince1970 * 1000
        var snap = Snapshot()

        let dir = root.appendingPathComponent("sessions")
        let files = (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? []
        var quotas: [QuotaFeed] = []
        var progress: [String: Progress] = [:]

        for file in files {
            if file.lastPathComponent.hasSuffix(".quota.json"), let q: QuotaFeed = read(file) {
                quotas.append(q)
            } else if file.lastPathComponent.hasSuffix(".progress.json"), let p: ProgressFeed = read(file) {
                progress[p.id] = p.progress
            }
        }

        let alive = quotas
            .filter { $0.ended != true && now - ($0.at ?? 0) < sessionAlive }
            .sorted { ($0.at ?? 0) > ($1.at ?? 0) }

        // 额度是账号级的，取最新一份有数的（刚开的对话可能还没拿到）
        snap.limits = alive.first { !($0.limits ?? []).isEmpty }?.limits ?? []
        snap.sessions = alive
            .map { q in
                SessionRow(
                    id: q.id,
                    project: (q.cwd as NSString?)?.lastPathComponent ?? "?",
                    working: q.working ?? false,
                    cache: q.cache,
                    cacheTTL: q.ttl ?? 60,
                    gear: gearLabel(q.model, q.effort),
                    progress: progress[q.id],
                    tty: q.app == "Apple_Terminal" ? q.tty : nil
                )
            }
            .sorted { $0.project < $1.project }

        snap.todo = read(root.appendingPathComponent("todo.json"))
        snap.pulse = read(root.appendingPathComponent("pulse.json"))

        if let v: VersionsFeed = read(root.appendingPathComponent("versions.json")), now - v.at < versionsAlive {
            snap.versions = v.rows.filter(\.isVersion)
        }

        return snap
    }

    /// 「claude-opus-5-5[1m]」+ high →「Opus 5.5 1M · high」
    static func gearLabel(_ model: String?, _ effort: Effort?) -> String? {
        let parts = [model.map(modelName), effort?.label].compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    static func modelName(_ id: String) -> String {
        var s = id.lowercased()
        let long = s.contains("[1m]")
        if let i = s.firstIndex(of: "[") { s = String(s[..<i]) }
        if s.hasPrefix("claude-") { s = String(s.dropFirst(7)) }
        // 去掉末尾日期（-20250929）
        let words = s.split(separator: "-").map(String.init).filter { !($0.count == 8 && $0.allSatisfy(\.isNumber)) }
        guard let name = words.first else { return id }
        let version = words.dropFirst().filter { $0.allSatisfy(\.isNumber) }.joined(separator: ".")
        return [name.prefix(1).uppercased() + name.dropFirst(), version, long ? "1M" : ""]
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    private static func read<T: Decodable>(_ url: URL) -> T? {
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }
}
