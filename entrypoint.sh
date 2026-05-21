#!/bin/bash
set -e

X11_WAIT_TIMEOUT=10

mkdir -p "${HOME:-/data}" /tmp/runtime-root
export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/tmp/runtime-root}"
# Start TigerVNC (X display + VNC server in one process)
/usr/bin/Xtigervnc :1 -desktop "SHRI-Tools" -SecurityTypes None -rfbport 5901 \
  -geometry 1920x1080 -depth 24 -localhost no &

# Wait for X display
for _ in $(seq 1 "$X11_WAIT_TIMEOUT"); do
  if [ -S /tmp/.X11-unix/X1 ]; then
    break
  fi
  sleep 1
done

if [ ! -S /tmp/.X11-unix/X1 ]; then
  echo "Error: X11 socket not available after ${X11_WAIT_TIMEOUT} seconds" >&2
  exit 1
fi

# Start window manager
fluxbox &

# Start noVNC (browser access on port 6080)
websockify --web /usr/share/novnc/ 6080 localhost:5901 &

echo "VNC server avviato sulla porta 5901"
echo "noVNC browser UI disponibile su: http://localhost:6080/vnc.html"

# Start Electron app
# --disable-gpu forces software rendering so X11 damage events reach TigerVNC correctly
cd /app
exec npm start -- --no-sandbox --disable-gpu
