// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "NotchDesk",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(
            name: "NotchDesk",
            path: "Sources/NotchDesk",
            swiftSettings: [.swiftLanguageMode(.v5)]
        ),
    ]
)
