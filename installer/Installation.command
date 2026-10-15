#!/bin/bash
# Generated installers pin both the release and its expected archive hashes.
# This source template must be built with npm run installer before distribution.
set -euo pipefail

release_tag='@RELEASE_TAG@'
version='@VERSION@'
repository='@REPOSITORY@'
arm64_sha256='@ARM64_SHA256@'
x64_sha256='@X64_SHA256@'
installation_root="${STRUCTOGRAM_INSTALL_ROOT:-$HOME/Applications}"
payload_cache="${STRUCTOGRAM_PAYLOAD_CACHE:-}"
app_path="$installation_root/Structogram ADS.app"
receipt_path="$installation_root/.structogram-installation"
staging=''
backup=''
lock_owned=false
mode="${1:-launch}"

fail() { printf '\nInstallation stopped: %s\n' "$*" >&2; exit 1; }
cleanup() {
  if [ -n "$backup" ] && [ -d "$backup" ] && [ ! -e "$app_path" ]; then mv "$backup" "$app_path"; fi
  if [ -n "$staging" ] && [ -d "$staging" ]; then rm -rf "$staging"; fi
  if [ "$lock_owned" = true ]; then rmdir "$installation_root/.structogram-install.lock" 2>/dev/null || true; fi
}
trap cleanup EXIT

case "$mode" in
  launch|--verify-only|--smoke-test) ;;
  --help) printf 'Run this script to install and launch Structogram ADS.\n--verify-only installs/checks without opening a window.\n'; exit 0 ;;
  *) fail 'Unknown option. Run with --help.' ;;
esac
case "$release_tag" in *@*) fail 'This is a source template. Download the built Installation ZIP from the repository release.' ;; esac
[ "$(uname -s)" = Darwin ] || fail 'This installer is for macOS.'

case "$(uname -m)" in
  arm64) architecture=arm64 ;;
  x86_64)
    if [ "$(sysctl -in hw.optional.arm64 2>/dev/null || true)" = 1 ]; then architecture=arm64; else architecture=x64; fi ;;
  *) fail 'Unsupported Mac processor.' ;;
esac
if [ "$architecture" = arm64 ]; then expected_sha256="$arm64_sha256"; else expected_sha256="$x64_sha256"; fi
archive_name="Structogram-ADS-$version-$architecture.zip"
archive_url="https://github.com/$repository/releases/download/$release_tag/$archive_name"
expected_receipt="$release_tag $architecture $expected_sha256"

printf '\nStructogram ADS %s — %s\n' "$version" "$architecture"
mkdir -p "$installation_root"
[ ! -L "$app_path" ] || fail 'The application path is a symbolic link. Choose a regular installation folder.'

if [ -d "$app_path" ] && [ -f "$receipt_path" ] && [ "$(cat "$receipt_path")" = "$expected_receipt" ]; then
  codesign --verify --deep --strict "$app_path" || fail 'The installed application failed its integrity check. Move it aside and run this installer again.'
  printf 'Using the installed copy. No download is needed.\n'
else
  mkdir "$installation_root/.structogram-install.lock" 2>/dev/null || fail 'Another installation is running. Wait for it to finish.'
  lock_owned=true
  if [ -e "$app_path" ] && pgrep -x 'Structogram ADS' >/dev/null 2>&1; then fail 'Quit Structogram ADS before installing another version.'; fi
  staging="$(mktemp -d "$installation_root/.structogram-setup.XXXXXX")"
  archive="$staging/$archive_name"
  if [ -n "$payload_cache" ] && [ -f "$payload_cache/$archive_name" ]; then
    cp "$payload_cache/$archive_name" "$archive"
  else
    printf 'Downloading the application for this Mac…\n'
    curl --proto '=https' --tlsv1.2 --fail --location --retry 2 --connect-timeout 20 --max-time 600 "$archive_url" --output "$archive" || fail 'Download failed. Check the connection and try again.'
  fi
  actual_sha256="$(shasum -a 256 "$archive" | awk '{print $1}')"
  [ "$actual_sha256" = "$expected_sha256" ] || fail 'The archive checksum does not match this installer. Nothing was installed.'
  mkdir "$staging/unpacked"
  ditto -x -k "$archive" "$staging/unpacked"
  new_app="$staging/unpacked/Structogram ADS.app"
  [ -x "$new_app/Contents/MacOS/Structogram ADS" ] || fail 'The downloaded package does not contain the application.'
  codesign --verify --deep --strict "$new_app" || fail 'The application signature is invalid. Nothing was installed.'
  if [ -e "$app_path" ]; then backup="$staging/previous.app"; mv "$app_path" "$backup"; fi
  mv "$new_app" "$app_path"
  printf '%s\n' "$expected_receipt" > "$staging/receipt"
  mv "$staging/receipt" "$receipt_path"
  printf 'Installed in %s\n' "$app_path"
  cleanup
  staging=''; backup=''; lock_owned=false
fi

case "$mode" in
  --verify-only) printf 'Installation verified.\n' ;;
  --smoke-test) "$app_path/Contents/MacOS/Structogram ADS" --smoke-test ;;
  *) open "$app_path" ;;
esac
