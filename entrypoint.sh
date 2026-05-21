#!/bin/bash
set -e

X11_WAIT_TIMEOUT=10

mkdir -p "${HOME:-/data}" /tmp/runtime-root
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/tmp/runtime-root}"

# Start virtual display
Xvfb :1 -screen 0 1920x1080x24 &

for _ in $(seq 1 "$X11_WAIT_TIMEOUT"); do
  if [ -S /tmp/.X11-unix/X1 ]; then
    break
  fi
  sleep 1
done

[ -S /tmp/.X11-unix/X1 ]

# Start window manager
fluxbox &

# Start VNC server
x11vnc -display :1 -forever -rfbport 5901 -passwd "${VNC_PASSWORD:-changeme}" -shared &

echo "VNC server avviato sulla porta 5901"
echo "Collegati con un client VNC all'indirizzo: <host>:5901"
echo "Password: ${VNC_PASSWORD:-changeme}"

# Start Electron app
cd /app
exec npm start -- --no-sandbox
