# Development (SHRI-Tools)

Questo documento serve a far partire **un nuovo sviluppatore** in modo rapido, con riferimenti puntuali al codice.

---

## 1) Scopo e perimetro

SHRI-Tools è un'app Electron per:
- analizzare file/cartelle media;
- generare suggerimenti di rinomina e titoli secondo le rules;
- integrare Upload Assistant (UA) + modalità integrata con upload su tracker Unit3D;
- analizzare un link tracker e proporre titolo/metadata.

Regole ufficiali: `docs/RULES.txt`.

---

## 2) Avvio rapido

Prerequisiti:
- Node.js LTS
- npm

Comandi:
```bash
npm install
npm start
```

---

## 3) Architettura (Electron)

**Main process**
- `main.js`
  - IPC, filesystem, MediaInfo/BDInfo, chiamate Unit3D, creazione torrent.
  - Cerca funzioni con `unit3d` / `mediainfo` / `bdinfo`.

**Preload**
- `preload.js`
  - bridge sicuro IPC (exposed API al renderer).

**Renderer**
- `app/renderer.js`
  - entry UI: wiring di eventi, orchestrazione moduli.

**UI**
- `app/index.html`
- `app/style.css`

Mini‑diagramma dei flussi principali:
```
[UI (index.html + renderer.js)]
        │
        ▼
[Parsing/Rules] ──► [Rename Builder] ──► [Preview titolo/rename]
 (media-utils,       (rename.js,
  parsing-tools,      rename-flow)
  rules-check)
        │
        ├─► Modalità Integrata ──► BBCode (bbcode.js) ──► Upload (upload-kit.js)
        │                                              │
        │                                              ▼
        │                                         IPC → main.js → Unit3D API
        │
        └─► Analisi Tracker ──► tracker-analysis.js ──► IPC → main.js → Unit3D API
```

---

## 4) Struttura del codice (punti chiave)

### UI e State
- `app/renderer/dom.js`: selezione e caching elementi UI.
- `app/renderer/state.js`: stato condiviso e mutazioni.
- `app/renderer/theme.js`: tema light/dark.
- `app/renderer/settings-tools.js`: settings + localStorage.
  - chiave storage: `SETTINGS_STORAGE_KEY` in `app/renderer/constants.js`.

### Parsing/Media
- `app/renderer/media-utils.js`: parsing MediaInfo, estrazione tracce, normalizzazione.
- `app/renderer/parsing-tools.js`: parsing token da nome file/cartella.
- `app/renderer/path-utils.js`: utilità path cross‑platform.

### Regole e Rinomina
- `app/renderer/rules-check.js`: verifica rules su nome (coerenza token).
- `app/renderer/rename.js`: builder per nome/titolo finale.
- `app/renderer/rename-flow.js`: logica di rinomina per file/cartelle.

### Modalità / Flussi
- `app/renderer/ua-mode.js`: modale Upload Assistant (arg, UI, comandi).
- `app/renderer/upload-kit.js`: modalità integrata + payload upload.
- `app/renderer/tracker-analysis.js`: analisi link tracker (Unit3D) + suggerimento titolo.
- `app/renderer/dupe-check.js`: dupe check (UA‑parity lato UI).

### BBCode
- `app/renderer/bbcode.js`: generazione BBCode per upload integrato.

### Log/Feedback
- `app/renderer/logger.js`: logging interno.
- `app/renderer/feedback.js`: pannello log/feedback UI.

### Config statiche
- `app/services.json`: elenco servizi.
- `app/renderer/constants.js`: costanti, mapping, tokens, `SHRI_TYPE_ID`.

---

## 5) Flussi principali (end‑to‑end)

### A) Rinomina File/Cartelle
1. Input via drag&drop: `app/renderer/drag-drop.js`
2. Parsing/auto‑detect: `app/renderer/auto-detect.js` + `media-utils.js`
3. Regole: `rules-check.js`
4. Titolo/rename finale: `rename.js` + `rename-flow.js`

### B) Modalità Integrata (Upload Wizard)
1. Parsing metadata + rules
2. Generazione BBCode: `bbcode.js`
3. Payload upload: `upload-kit.js`
4. Chiamate API/IPC: `main.js`

### C) Analisi Tracker
1. Inserimento link → fetch Unit3D: `tracker-analysis.js` (IPC verso `main.js`)
2. Parsing MediaInfo e name
3. Suggerimento titolo

### D) Dupe Check (Unit3D)
1. Mapping typeId: `app/renderer/constants.js` → `SHRI_TYPE_ID`
2. Query/filtri: `app/renderer/dupe-check.js`
3. Fetch effettivo: `main.js` (cerca `unit3d dupe` / `filter`)

---

## 6) Rules/Naming

- Fonte regole: `docs/RULES.txt`.
- Implementazione: `rules-check.js` + `rename.js`.
- Token e mapping codec/format: `constants.js`.

Note tipiche:
- WEB-DL vs WEBRip: differenze in naming/codec.
- `NoGroup`: gestito in base alle impostazioni (vedi `settings-tools.js`).
- Multi‑episode: gestito in `rename-flow.js` e nel UI badge.

---

## 7) Tracker / Unit3D

- Base URL + API key: settings (vedi `settings-tools.js`).
- Mapping typeId: `app/renderer/constants.js` (es. `WEBRIP: '51'` su SHRI).
- Upload integrato: `upload-kit.js` + IPC in `main.js`.
- Analisi tracker: `tracker-analysis.js`.

---

## 8) Settings & Storage

- LocalStorage key: `SETTINGS_STORAGE_KEY` in `constants.js`.
- Valori default: `DEFAULT_SETTINGS` in `settings-tools.js`.
- Sezione UI settings: `app/index.html`.

---

## 9) Logging / Debug

- Logging JS: `logger.js`.
- Log main process: `main.js` (stdout/stderr).
- Pannello log interno: `feedback.js`.

---

## 10) Checklist test manuale (minima)

1. **File movie**: suggerimento titolo + rename.
2. **Cartella stagione**: rename + ordine episodi.
3. **Analisi tracker**: link Unit3D → suggerimento titolo.
4. **Dupe check**: verifica risultati con `tmdbId` e `typeId`.
5. **Upload integrato**: payload + bbcode coerente.
6. **Modalità UA**: arg toggles, tooltip, output.

---

## 10.1) Troubleshooting rapido

- **Dupe check mostra risultati non coerenti**: verifica `SHRI_TYPE_ID` in `app/renderer/constants.js` e override in settings.  
- **NoGroup non compare**: controlla `autoNoGroupTag` e `renameOmitNoGroupInPaths` in settings.  
- **MediaInfo vuoto/errore**: verifica percorso mediainfo/bdinfo in settings o permessi file.  
- **Analisi tracker non suggerisce titolo**: controlla API key Unit3D e log `tracker analysis`.  
- **Tooltip tagliati nel modale UA**: controlla CSS z‑index/overflow del container.

---

## 11) Note di manutenzione

- Quando tocchi mapping o rules, aggiorna:
  - `app/renderer/constants.js` (app integrata)
  - eventuali riferimenti esterni a UA **solo se** il repo UA è coinvolto nel task.
- Prima di push: `git status -sb`, test manuale minimo.

---

## 12) Decisioni / Change log (consigliato)

Aggiungi un file `docs/DECISIONS.md` se crescono le eccezioni (typeId, rules custom, differenze UA/Integrata).
