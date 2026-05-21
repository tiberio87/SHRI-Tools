FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive \
    DISPLAY=:1 \
    VNC_PASSWORD=changeme \
    HOME=/data \
    ELECTRON_DISABLE_SANDBOX=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        apt-transport-https \
        ca-certificates \
        curl \
        wget \
        unzip \
        gnupg \
    && mkdir -p /usr/share/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
        | gpg --dearmor -o /usr/share/keyrings/nodesource.gpg \
    && chmod 644 /usr/share/keyrings/nodesource.gpg \
    && printf 'Types: deb\nURIs: https://deb.nodesource.com/node_20.x\nSuites: nodistro\nComponents: main\nArchitectures: amd64\nSigned-By: /usr/share/keyrings/nodesource.gpg\n' \
        > /etc/apt/sources.list.d/nodesource.sources \
    && wget -q https://packages.microsoft.com/config/ubuntu/22.04/packages-microsoft-prod.deb -O /tmp/packages-microsoft-prod.deb \
    && dpkg -i /tmp/packages-microsoft-prod.deb \
    && rm -f /tmp/packages-microsoft-prod.deb \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        xvfb \
        x11vnc \
        fluxbox \
        ffmpeg \
        libgtk-3-0 \
        libnotify4 \
        libnss3 \
        libxss1 \
        libxtst6 \
        libgbm1 \
        libasound2 \
        xauth \
        nodejs \
        dotnet-runtime-8.0 \
    && rm -rf /var/lib/apt/lists/*

RUN set -eux; \
    mkbrr_version="$(basename "$(curl -fsSLI -o /dev/null -w '%{url_effective}' https://github.com/autobrr/mkbrr/releases/latest)" | sed 's/^v//')"; \
    mkdir -p /tmp/mkbrr-extract; \
    curl -fsSL "https://github.com/autobrr/mkbrr/releases/download/v${mkbrr_version}/mkbrr_${mkbrr_version}_linux_amd64.tar.gz" -o /tmp/mkbrr.tar.gz; \
    tar -xzf /tmp/mkbrr.tar.gz -C /tmp/mkbrr-extract; \
    install -m 0755 "$(find /tmp/mkbrr-extract -type f -name mkbrr | head -n 1)" /usr/local/bin/mkbrr; \
    rm -rf /tmp/mkbrr.tar.gz /tmp/mkbrr-extract

RUN set -eux; \
    mkdir -p /opt/bdinfo; \
    bdinfo_url=""; \
    for candidate in \
        "https://github.com/UniqProject/BDInfo/releases/latest/download/BDInfo.CLI-linux-x64.zip" \
        "https://github.com/UniqProject/BDInfo/releases/latest/download/BDInfo-linux-x64.zip" \
        "https://github.com/UniqProject/BDInfo/releases/latest/download/BDInfo.CLI-linux-x64.tar.gz" \
        "https://github.com/UniqProject/BDInfo/releases/latest/download/BDInfo-linux-x64.tar.gz" \
        "https://github.com/tetrahydroc/BDInfoCLI/releases/latest/download/BDInfo-linux-x64.tar.gz"; do \
        if curl -fsSLI "$candidate" > /dev/null; then \
            bdinfo_url="$candidate"; \
            break; \
        fi; \
    done; \
    [ -n "$bdinfo_url" ]; \
    curl -fsSL "$bdinfo_url" -o /tmp/bdinfo-archive; \
    case "$bdinfo_url" in \
        *.zip) unzip -q /tmp/bdinfo-archive -d /opt/bdinfo ;; \
        *.tar.gz) tar -xzf /tmp/bdinfo-archive -C /opt/bdinfo ;; \
        *) echo "Unsupported BDInfo archive: $bdinfo_url" >&2; exit 1 ;; \
    esac; \
    bdinfo_bin=""; \
    for candidate in BDInfo.CLI BDInfo bdinfo; do \
        bdinfo_bin="$(find /opt/bdinfo -type f -name "$candidate" | head -n 1)"; \
        if [ -n "$bdinfo_bin" ]; then \
            break; \
        fi; \
    done; \
    if [ -n "$bdinfo_bin" ]; then \
        chmod +x "$bdinfo_bin"; \
        ln -sf "$bdinfo_bin" /usr/local/bin/bdinfo; \
    else \
        bdinfo_dll="$(find /opt/bdinfo -type f -name 'BDInfo*.dll' | head -n 1)"; \
        [ -n "$bdinfo_dll" ]; \
        printf '#!/bin/sh\nexec dotnet "%s" "$@"\n' "$bdinfo_dll" > /usr/local/bin/bdinfo; \
        chmod +x /usr/local/bin/bdinfo; \
    fi; \
    rm -f /tmp/bdinfo-archive

COPY package*.json ./
RUN npm install

COPY app ./app
COPY assets ./assets
COPY main.js preload.js ./
COPY entrypoint.sh /entrypoint.sh

RUN chmod +x /entrypoint.sh \
    && mkdir -p /data

EXPOSE 5901

ENTRYPOINT ["/entrypoint.sh"]
