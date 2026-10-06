#!/usr/bin/env bash
#
# Builds the desktop app for this Mac, without an Apple Developer identity.
#
#   scripts/native-build-local.sh [arm64|x64]   (default: this Mac's architecture)
#
# Output in nativephp/electron/dist: the .app, a .dmg and a .zip.
#
# Without an identity, electron-builder signs the app ad hoc *with* the hardened
# runtime, which only loads libraries of the same Team ID. An ad hoc signature has
# none, so the app can't load its own Electron Framework and doesn't open. The app is
# signed again ad hoc, without the hardened runtime, and the .dmg/.zip rebuilt from it.
#
# The result runs on this Mac. On other Macs Gatekeeper blocks it (right-click → Open,
# or `xattr -dr com.apple.quarantine`): distribution needs the signed build.

set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
arch="${1:-$(uname -m | sed 's/x86_64/x64/')}"
dist="$root/nativephp/electron/dist"

cd "$root"

echo "→ Building the frontend"
npm run build

echo "→ Building the app ($arch)"
# Set by terminals started from VS Code / Claude Code: Electron would run as plain Node.
env -u ELECTRON_RUN_AS_NODE php artisan native:build mac "$arch" --no-interaction

app="$(find "$dist" -maxdepth 2 -name '*.app' -path "*mac*" | head -1)"
name="$(basename "$app" .app)"
version="$(grep -E '^NATIVEPHP_APP_VERSION=' .env | cut -d= -f2)"

# The bundled storage is copied into the app's data folder on first launch: anything
# else than Laravel's own folders is likely local data (dev tool captures, etc.).
storage="$app/Contents/Resources/build/app/storage"
unexpected="$(find "$storage" -mindepth 1 -maxdepth 1 ! -name app ! -name framework ! -name logs ! -name '.gitignore')"

if [[ -n "$unexpected" ]]; then
    echo "The app would ship these local folders: exclude them in config/nativephp.php (cleanup_exclude_files)." >&2
    echo "$unexpected" | sed "s|$storage/|  storage/|" >&2
    exit 1
fi

echo "→ Signing $name.app ad hoc, without the hardened runtime"
codesign --force --deep --sign - "$app"
codesign --verify --deep --strict "$app"

echo "→ Packaging"
rm -f "$dist"/*.blockmap
zip="$dist/$name-$version-$arch.zip"
dmg="$dist/$name-$version-$arch.dmg"
rm -f "$zip" "$dmg"
ditto -c -k --keepParent "$app" "$zip"

staging="$(mktemp -d)"
trap 'rm -rf "$staging"' EXIT
cp -R "$app" "$staging/"
ln -s /Applications "$staging/Applications"
hdiutil create -quiet -volname "$name" -srcfolder "$staging" -ov -format ULMO "$dmg"

echo
echo "Done:"
du -h "$dmg" "$zip"
