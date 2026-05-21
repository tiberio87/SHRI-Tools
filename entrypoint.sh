#!/bin/bash
set -e

mkdir -p "${HOME:-/data}" /tmp/runtime-root
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/tmp/runtime-root}"

# Avvia display virtuale
Xvfb :1 -screen 0 1920x1080x24 &
sleep 1

# Avvia window manager
fluxbox &
sleep 1

# Avvia VNC server
x11vnc -display :1 -forever -rfbport 5901 -passwd "${VNC_PASSWORD:-changeme}" -shared &

echo "VNC server avviato sulla porta 5901"
echo "Collegati con un client VNC all'indirizzo: <host>:5901"
echo "Password: ${VNC_PASSWORD:-changeme}"

# Avvia l'app Electron
cd /app
exec npm start -- --no-sandbox
