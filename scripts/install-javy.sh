#!/usr/bin/env sh
# Copyright 2026 Orbinum Technologies
# SPDX-License-Identifier: Apache-2.0
#
# Installs Javy, the JS → WASI compiler `pnpm build:wasm` uses, on a Linux
# x86_64 CI runner: one pinned release of bytecodealliance/javy, refused unless
# it matches the checksum recorded here. Bump VERSION and SHA256 together, from
# the release's own `.sha256` asset.
set -eu

VERSION=v9.1.0
SHA256=a68b122d48eb3dfc1b801d4e14c39271fde3638243d3272d206e376ac9189e39
DEST=${1:-"${RUNNER_TEMP:?}/javy"}

mkdir -p "$DEST"
curl -fsSL -o "$DEST/javy.gz" \
    "https://github.com/bytecodealliance/javy/releases/download/$VERSION/javy-x86_64-linux-$VERSION.gz"
echo "$SHA256  $DEST/javy.gz" | sha256sum -c -
gunzip -f "$DEST/javy.gz"
chmod +x "$DEST/javy"
"$DEST/javy" --version
if [ -n "${GITHUB_PATH:-}" ]; then echo "$DEST" >> "$GITHUB_PATH"; fi
