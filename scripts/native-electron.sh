#!/usr/bin/env bash
#
# Makes sure NativePHP's Electron binary is installed.
#
# The project's .npmrc sets ignore-scripts=true, so Electron's postinstall (which
# downloads the binary) never runs. Its extractor (extract-zip) also stops after the
# first entry on recent Node versions, so the zip is downloaded with @electron/get and
# extracted with `ditto`, which keeps the framework symlinks of Electron.app intact.

set -euo pipefail

electron_dir="$(cd "$(dirname "$0")/.." && pwd)/vendor/nativephp/desktop/resources/electron/node_modules/electron"

if [[ ! -d "$electron_dir" ]]; then
    echo "Electron package not found. Run: php artisan native:install" >&2
    exit 1
fi

cd "$electron_dir"

if [[ -x dist/Electron.app/Contents/MacOS/Electron && -f path.txt ]]; then
    exit 0
fi

zip=$(node --input-type=module -e "
import { downloadArtifact } from '@electron/get';
import { createRequire } from 'node:module';
const { version } = createRequire(import.meta.url)('./package.json');
console.log(await downloadArtifact({ version, artifactName: 'electron', platform: process.platform, arch: process.arch }));
")

rm -rf dist
ditto -x -k "$zip" dist
printf 'Electron.app/Contents/MacOS/Electron' > path.txt

echo "Electron installed: $(cat version 2>/dev/null || cat dist/version)"
