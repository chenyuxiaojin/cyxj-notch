#!/bin/zsh
# 编译并打包成 刘海台.app（放在本目录 build/ 下）
set -e
cd "$(dirname "$0")"
swift build -c release
APP="build/刘海台.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
cp .build/release/NotchDesk "$APP/Contents/MacOS/NotchDesk"
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>刘海台</string>
  <key>CFBundleIdentifier</key><string>com.xiaochen.notchdesk</string>
  <key>CFBundleExecutable</key><string>NotchDesk</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>0.1.0</string>
  <key>LSMinimumSystemVersion</key><string>14.0</string>
  <key>LSUIElement</key><true/>
  <key>NSAppleEventsUsageDescription</key><string>点对话时切到它所在的终端标签页</string>
</dict>
</plist>
PLIST
codesign --force --sign - "$APP"
echo "打包好了：$APP"
