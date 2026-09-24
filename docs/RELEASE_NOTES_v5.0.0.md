# SHRI-Tools v5.0.0

## Nuove funzionalità

- **Sezioni Extra Encode nel BBCode**: per le release **Encode** (x264/x265) il wizard di upload chiede se inserire tre nuove sezioni nella descrizione:
  - `--- SORGENTE ---` — riga sorgente (es. `Sorgente...: Disclosure Day 2026 1080p EUR Blu-ray AVC TrueHD 7.1 Atmos-CYBER | (Thanks!)`)
  - `--- COMPARAZIONE ---` — link di comparazione screen (es. slow.pics), formattato come `Source vs <tag>: <url>`
  - `--- ENCODE NOTES ---` — log dell'encode x264/x265
  
  Le sezioni compaiono tra RELEASE NOTES e SHOUTOUTS e vengono inserite solo se abilitate e compilate. La descrizione si rigenera in tempo reale.
- **BBCode con link TheTVDB**: la sezione LINKS include TheTVDB per le serie TV, oltre a IMDb e TMDb.
- **Tonemapping HDR → SDR configurabile**: nuovo toggle in *Screenshot & Image Host* per abilitare/disabilitare la conversione tonemap sugli screen HDR.

## Miglioramenti

- **Impostazioni riorganizzate** in sezioni tematiche che seguono il flusso di lavoro: Generale, Tracker & Upload, Metadata API, Impostazioni di rinomina, Screenshot & Image Host, Creazione torrent, Tools, Client torrent.
  - Il **PID announce** è stato spostato nella sezione *Tracker & Upload* insieme a Base URL e API key.
  - Il **percorso FFmpeg** è stato spostato nella sezione *Tools* insieme a BDInfo e mkvpropedit.
- README aggiornato con tutte le funzionalità introdotte.

## Note per la release

- Tag consigliato: `v5.0.0`
- L'immagine Docker viene ricostruita automaticamente dai push su `main` e dai tag.
