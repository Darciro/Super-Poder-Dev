#!/usr/bin/env bash
#
# Renders the desktop app's icons from their sources in resources/icons:
#
#  - public/icon.png: the app icon (Dock, Finder), 1024×1024
#  - public/IconTemplate.png (+ @2x): the menu bar icon, a macOS template image
#
# NativePHP copies them into the app on `native:run` and `native:build`.
# Uses AppKit through Swift (Xcode Command Line Tools), which keeps the transparency.

set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"

render() {
    local source="$1" size="$2" target="$3"

    swift "$root/scripts/render-svg.swift" "$source" "$size" "$target"
    echo "$(basename "$target"): ${size}px"
}

render "$root/resources/icons/app.svg" 1024 "$root/public/icon.png"
render "$root/resources/icons/menu-bar.svg" 22 "$root/public/IconTemplate.png"
render "$root/resources/icons/menu-bar.svg" 44 "$root/public/IconTemplate@2x.png"
