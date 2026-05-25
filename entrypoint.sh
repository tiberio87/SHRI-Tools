#!/bin/bash
set -e

PUID=${PUID:-0}
PGID=${PGID:-0}
X11_WAIT_TIMEOUT=30

mkdir -p /data /media /output /tmp/runtime-root
export XDG_RUNTIME_DIR=/tmp/runtime-root

# Setup non-root user if PUID/PGID are provided
if [ "${PUID}" != "0" ]; then
  groupadd -f -g "${PGID}" appgroup 2>/dev/null || true
  id -u appuser &>/dev/null || useradd -u "${PUID}" -g "${PGID}" -d /data -M appuser
  chown "${PUID}:${PGID}" /data /media /output /tmp/runtime-root
  RUN_AS=appuser
else
  RUN_AS=root
fi

# Start TigerVNC as root (requires socket creation in /tmp/.X11-unix)
/usr/bin/Xtigervnc :1 -desktop "SHRI-Tools" -SecurityTypes None -rfbport 5901 \
  -geometry 1920x1080 -depth 24 -localhost no &

# Wait for X socket
for _ in $(seq 1 "$X11_WAIT_TIMEOUT"); do
  if [ -S /tmp/.X11-unix/X1 ]; then break; fi
  sleep 1
done

if [ ! -S /tmp/.X11-unix/X1 ]; then
  echo "Error: X11 socket not available after ${X11_WAIT_TIMEOUT} seconds" >&2
  exit 1
fi

# Wait for X to actually accept connections (not just socket present)
for _ in $(seq 1 "$X11_WAIT_TIMEOUT"); do
  if DISPLAY=:1 xdpyinfo >/dev/null 2>&1; then break; fi
  sleep 1
done

# Allow appuser to connect to the X display
chmod o+rw /tmp/.X11-unix/X1 2>/dev/null || true

# Start window manager as appuser
gosu "${RUN_AS}" fluxbox &

# Start noVNC (runs as root, proxies to VNC port)
websockify --web /usr/share/novnc/ 6080 localhost:5901 &

echo "VNC server avviato sulla porta 5901"
echo "noVNC browser UI disponibile su: http://localhost:6080/vnc.html"

# Start dbus session to suppress Electron DBus errors
export DBUS_SESSION_BUS_ADDRESS=
if command -v dbus-launch >/dev/null 2>&1; then
  eval "$(dbus-launch --sh-syntax 2>/dev/null)" || true
fi

# Start Electron as appuser
# --disable-gpu forces software rendering so X11 damage events reach TigerVNC correctly
cd /app
exec gosu "${RUN_AS}" env \
  DISPLAY=:1 \
  DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-}" \
  electron . --no-sandbox --disable-gpu
