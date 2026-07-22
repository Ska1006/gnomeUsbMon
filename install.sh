#!/usr/bin/env bash
# Install (or uninstall) the USB & PD Monitor GNOME Shell extension for the current user.
# Usage: ./install.sh          install and enable
#        ./install.sh -u       uninstall
set -euo pipefail

UUID="gnome-usb-mon@ska1006.github.io"
DOMAIN="gnome-usb-mon"
SUPPORTED_SHELL=50
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$UUID"

cd "$SRC"

# --- uninstall ---
if [[ "${1:-}" == "-u" || "${1:-}" == "--uninstall" ]]; then
    gnome-extensions disable "$UUID" 2>/dev/null || true
    rm -rf "$DEST"
    echo "Uninstalled: $DEST"
    exit 0
fi

# --- dependencies ---
need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing required tool: $1" >&2; exit 1; }; }
need glib-compile-schemas
need gnome-extensions

# --- shell version (warn only) ---
if command -v gnome-shell >/dev/null 2>&1; then
    ver="$(gnome-shell --version | grep -oE '[0-9]+' | head -1 || true)"
    if [[ -n "$ver" && "$ver" != "$SUPPORTED_SHELL" ]]; then
        echo "Warning: GNOME Shell $ver detected; this extension targets $SUPPORTED_SHELL and may not load."
    fi
fi

# --- build: schemas + translations ---
glib-compile-schemas schemas/

if command -v msgfmt >/dev/null 2>&1; then
    for po in po/*.po; do
        [[ -e "$po" ]] || break
        lang="$(basename "$po" .po)"
        mkdir -p "locale/$lang/LC_MESSAGES"
        msgfmt "$po" -o "locale/$lang/LC_MESSAGES/$DOMAIN.mo"
    done
else
    echo "Note: msgfmt (gettext) not found — installing without translations (English only)."
fi

# --- install ---
rm -rf "$DEST"
mkdir -p "$DEST"
cp -r metadata.json extension.js prefs.js stylesheet.css lib ui schemas "$DEST/"
[[ -d locale ]] && cp -r locale "$DEST/"
echo "Installed -> $DEST"

# --- enable ---
gnome-extensions enable "$UUID" 2>/dev/null || true

# --- session hint ---
if [[ "${XDG_SESSION_TYPE:-}" == "wayland" ]]; then
    echo "Wayland: log out and back in to activate."
else
    echo "X11: press Alt+F2, type 'r', Enter to restart the shell."
fi
echo "Settings:  gnome-extensions prefs $UUID"
echo "Uninstall: ./install.sh -u"
