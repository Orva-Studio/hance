#!/bin/sh
# Hancer installer. Usage:
#   curl -fsSL https://github.com/Orva-Studio/hancer/releases/latest/download/install.sh | sh
#   curl -fsSL <...>/install.sh | sh -s -- --version v0.1.0
set -eu

REPO="${HANCE_REPO:-Orva-Studio/hancer}"
INSTALL_DIR="${HANCE_INSTALL_DIR:-$HOME/.hance/bin}"
VERSION="${HANCE_VERSION:-}"

while [ $# -gt 0 ]; do
  case "$1" in
    --version) VERSION="$2"; shift 2 ;;
    --version=*) VERSION="${1#*=}"; shift ;;
    -h|--help)
      cat <<EOF
Hancer installer.
  --version vX.Y.Z    install a specific version (default: latest)
Environment:
  HANCE_REPO          override repo (default: ${REPO})
  HANCE_INSTALL_DIR   override install dir (default: \$HOME/.hance/bin)
EOF
      exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

info()  { printf '%s\n' "$*"; }
warn()  { printf 'warning: %s\n' "$*" >&2; }
die()   { printf 'error: %s\n' "$*" >&2; exit 1; }

# --- detect OS/arch ----------------------------------------------------------
uname_s=$(uname -s)
uname_m=$(uname -m)
case "$uname_s/$uname_m" in
  Darwin/arm64)         PLATFORM="macos-arm64";   PLATFORM_HUMAN="macOS on Apple Silicon (arm64)" ;;
  Darwin/x86_64)        PLATFORM="macos-x64";     PLATFORM_HUMAN="macOS on Intel (x64)" ;;
  Linux/x86_64)         PLATFORM="linux-x64";     PLATFORM_HUMAN="Linux x86_64" ;;
  Linux/aarch64|Linux/arm64) PLATFORM="linux-arm64"; PLATFORM_HUMAN="Linux arm64" ;;
  *) die "unsupported platform: $uname_s/$uname_m. Supported: macOS (arm64/x64), Linux (x64/arm64)." ;;
esac
info "Detected: ${PLATFORM_HUMAN} → hance-${PLATFORM}"

# --- resolve version ---------------------------------------------------------
if [ -z "$VERSION" ]; then
  api="https://api.github.com/repos/${REPO}/releases/latest"
  VERSION=$(curl -fsSL "$api" | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -n1)
  [ -n "$VERSION" ] || die "could not resolve latest version from $api"
  info "Installing hance ${VERSION} (latest)"
else
  info "Installing hance ${VERSION}"
fi

# --- prereqs -----------------------------------------------------------------
if ! command -v ffmpeg >/dev/null 2>&1; then
  case "$uname_s" in
    Darwin) warn "ffmpeg not found on PATH — install with: brew install ffmpeg" ;;
    Linux)  warn "ffmpeg not found on PATH — install with: apt install ffmpeg (or your distro's package manager)" ;;
  esac
fi

# --- download ----------------------------------------------------------------
tarball="hance-${PLATFORM}.tar.gz"
base="https://github.com/${REPO}/releases/download/${VERSION}"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

info "Downloading ${tarball}..."
curl -fL --progress-bar -o "$tmp/$tarball"       "$base/$tarball"      || die "download failed: $tarball"
curl -fsSL                -o "$tmp/checksums.txt" "$base/checksums.txt" || die "download failed: checksums.txt"

# --- verify (silent on success) ---------------------------------------------
( cd "$tmp" && grep " $tarball\$" checksums.txt > checksums.expected ) \
  || die "no checksum entry for $tarball in checksums.txt"
if command -v shasum >/dev/null 2>&1; then
  ( cd "$tmp" && shasum -a 256 -c checksums.expected >/dev/null ) \
    || die "checksum mismatch for $tarball — aborting"
elif command -v sha256sum >/dev/null 2>&1; then
  ( cd "$tmp" && sha256sum -c checksums.expected >/dev/null ) \
    || die "checksum mismatch for $tarball — aborting"
else
  die "neither shasum nor sha256sum found; cannot verify download"
fi

# --- extract -----------------------------------------------------------------
info "Installing to ${INSTALL_DIR}"
mkdir -p "$INSTALL_DIR"
tar -xzf "$tmp/$tarball" -C "$tmp"
cp -f "$tmp/hance-${PLATFORM}/hance"     "$INSTALL_DIR/hance"
cp -f "$tmp/hance-${PLATFORM}/hance-gpu" "$INSTALL_DIR/hance-gpu"
chmod 0755 "$INSTALL_DIR/hance" "$INSTALL_DIR/hance-gpu"

# --- macOS: strip quarantine --------------------------------------------------
if [ "$uname_s" = "Darwin" ] && command -v xattr >/dev/null 2>&1; then
  xattr -dr com.apple.quarantine "$INSTALL_DIR" 2>/dev/null || true
fi

# --- PATH --------------------------------------------------------------------
shell_name=$(basename "${SHELL:-sh}")
case ":$PATH:" in
  *":$INSTALL_DIR:"*) on_path=1 ;;
  *) on_path=0 ;;
esac

if [ "$on_path" = "0" ]; then
  case "$shell_name" in
    zsh)  rc="$HOME/.zshrc";  line="export PATH=\"$INSTALL_DIR:\$PATH\"" ;;
    bash) rc="$HOME/.bashrc"; line="export PATH=\"$INSTALL_DIR:\$PATH\"" ;;
    fish) rc="$HOME/.config/fish/config.fish"; line="set -gx PATH $INSTALL_DIR \$PATH" ;;
    *)    rc=""; line="export PATH=\"$INSTALL_DIR:\$PATH\"" ;;
  esac
  echo
  echo "$INSTALL_DIR is not on your PATH. Add this line to your shell config:"
  echo "  $line"
  if [ -t 0 ] && [ -n "$rc" ]; then
    printf "Add to %s now? [y/N] " "$rc"
    read -r reply
    case "$reply" in
      y|Y|yes|YES)
        mkdir -p "$(dirname "$rc")"
        printf '\n# Added by hance installer\n%s\n' "$line" >> "$rc"
        echo "Added. Open a new shell (or 'source $rc') to pick it up."
        ;;
    esac
  fi
fi

cat <<EOF

✓ Installed hance ${VERSION} to ${INSTALL_DIR}

Get started:
  hance --help                    # CLI usage
  hance ui                        # launch the UI
  hance input.mp4 -o out.mp4      # apply default look

Docs: https://github.com/${REPO}
EOF
