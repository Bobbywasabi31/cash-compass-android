#!/usr/bin/env bash
# Release naming — single source of truth for the release tag, title, and APK name.
#
# The version comes ONLY from `versionName` in app/build.gradle.kts. This script
# prints KEY=VALUE lines so the release workflow (and any dry-run) derives the
# tag, title, and APK filename from one place — a tag/title mismatch like the
# v1.60.1-preview.91 tag shipped with a 1.61.0 title can no longer happen.
#
# Usage: scripts/release-naming.sh [build-gradle-kts-path] [run-number]
#   build-gradle-kts-path defaults to app/build.gradle.kts (repo-relative).
#   run-number defaults to $GITHUB_RUN_NUMBER, then 0 for local dry-runs.
#
# Example dry-run:  scripts/release-naming.sh
#                   scripts/release-naming.sh app/build.gradle.kts 123
set -euo pipefail

GRADLE_FILE="${1:-app/build.gradle.kts}"
RUN_NUMBER="${2:-${GITHUB_RUN_NUMBER:-0}}"

VERSION="$(sed -n 's/^[[:space:]]*versionName = "\([^"]*\)".*/\1/p' "$GRADLE_FILE" | head -n 1)"
if [ -z "$VERSION" ]; then
  echo "error: versionName not found in $GRADLE_FILE" >&2
  exit 1
fi

echo "VERSION=${VERSION}"
echo "TAG=v${VERSION}-preview.${RUN_NUMBER}"
echo "TITLE=OddDough ${VERSION} preview ${RUN_NUMBER}"
echo "APK=OddDough-${VERSION}-preview.apk"
