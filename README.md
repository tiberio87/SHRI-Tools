# SHRI-Tools

Applicazione desktop (Electron) per la gestione completa delle release su tracker Unit3D: analisi file/cartelle, rinomina secondo rules, generazione BBCode, upload integrato e integrazione con Upload Assistant (UA), analisi di torrent gia' pubblicati.

---

## Funzioni principali

### 1) Rinomina file/cartelle
- Auto‑detect di titolo/anno/stagione/episodio dal nome e dai metadata.
- Parsing MediaInfo/BDInfo per codec, audio, HDR, sorgente.
- Gestione multi‑episode (S01E01‑E02 ecc.).
- Piano di rinomina con anteprima e applicazione.
- Regole di naming allineate al tracker (vedi `docs/RULES.txt`).

### 2) Modalita' Integrata (Upload Wizard)
- Workflow guidato a step con suggerimento titolo.
- Generazione BBCode per la descrizione del torrent.
- Creazione .torrent (create‑torrent o mkbrr).
- Dupe check automatico su tracker con filtri dedicati.
- Upload diretto al tracker + invio al client (qBittorrent/Transmission).

### 3) Modalita' Upload Assistant (UA)
- Modale per lanciare UA con arg precompilati.
- Toggle per tag gruppo, screens, servizio, tipo, source, ids, season/episode, ecc.
- Log in tempo reale e controllo esecuzione (start/stop).

### 4) Analisi Tracker
- Inserisci un link Unit3D e ottieni:
  - titolo suggerito secondo rules,
  - MediaInfo sintetico,
  - badge ID meta copiabili,
  - segnalazione mismatch ID.

---

## Modalita' operative

- **File/Cartella**: analisi locale + rinomina.
- **Upload Wizard Integrata**: upload completo da SHRI‑Tools.
- **Upload Assistant**: esecuzione UA con arg guidati.
- **Analisi Tracker**: analisi di torrent gia' presenti.

---

## Impostazioni (panoramica)

### Impostazioni generali (valide in tutte le modalità)
- **Modalità upload predefinita**: Integrata o Upload Assistant.
- **TMDb key**: auto‑matching e metadata film/serie.
- **TVDb key**: auto‑matching per serie/episodi.
- **OMDb key**: fallback metadata via IMDb.
- **Lingua preferita**: influenza titoli/descrizioni recuperate (es. it‑IT).
- **Lista servizi**: elenco personalizzato servizi per dropdown.
- **Lista tag gruppo**: elenco personalizzato tag gruppo.
- **Auto‑detect tag gruppo**: tenta di rilevare il tag dal nome file/cartella.
- **Auto‑NoGroup**: applica NoGroup se non esiste un tag gruppo.
- **Lingua nei nomi cartella**: include/omette il tag lingua nelle cartelle.
- **Lingua nei nomi file**: include/omette il tag lingua nei file.
- **Ometti NoGroup in file/cartelle**: non scrive NoGroup nei nomi, ma resta valido per i titoli.
- **Auto‑apply suggerimenti**: applica in automatico i suggerimenti di formato/source/codec.
- **Percorso BDInfo**: eseguibile BDInfo (se usato per dischi).
- **Percorso FFmpeg**: necessario per screenshot.
- **Numero screenshot**: quanti screen generare.
- **Host immagini primario**: imgbb o ptscreens.
- **Host immagini fallback**: fallback se il primario fallisce.
- **imgbb key**: API key per upload screenshot.
- **ptscreens key**: API key per upload screenshot.

### Modalità Integrata (Upload Wizard)
- **Unit3D Base URL**: tracker di destinazione.
- **Unit3D API key**: necessaria per upload/analisi/dupe check.
- **Upload anonimo**: flag per upload anonimo.
- **Personal release**: flag per release personale.
- **Mod queue**: invio in coda moderazione.
- **Override category**: mapping custom category Unit3D.
- **Override type**: mapping custom type Unit3D.
- **Override resolution**: mapping custom resolution Unit3D.
- **Announce/passkey**: usati per la generazione del .torrent.
- **Announce URL**: override completo dell’announce.
- **Output torrent**: cartella di destinazione .torrent.
- **mkbrr path**: eseguibile mkbrr.
- **mkbrr workers**: numero worker per hashing.
- **Torrent private**: flag private nel .torrent.
- **Client torrent**: scelta tra qBittorrent e Transmission.

**qBittorrent**
- **Host** / **Porta** / **HTTPS**: connessione al client.
- **Username** / **Password**: credenziali.
- **Save path**: destinazione download (se impostata, ignora path mapping).
- **Categoria**: categoria da assegnare.
- **Auto‑start**: avvio automatico del torrent.
- **Path mapping locale/remoto**: mapping percorso se client remoto.

**Transmission**
- **Host** / **Porta** / **HTTPS**: connessione al client.
- **Username** / **Password**: credenziali.
- **Save path**: destinazione download (se impostata, ignora path mapping).
- **Auto‑start**: avvio automatico del torrent.
- **Path mapping locale/remoto**: mapping percorso se client remoto.

### Modalità Upload Assistant (UA)
- **Path UA**: cartella installazione di Upload Assistant.
- **Health check UA**: verifica requisiti e configurazione.

### Impostazioni avanzate
- **Override Unit3D**: mapping custom per category/type/resolution (se necessario).
- **Path mapping client**: dettagli mapping locale/remoto quando client su altra macchina.

---

## Avvio rapido

```bash
npm install
npm start
```

---

## Documentazione tecnica

- `docs/DEVELOPMENT.md` – guida tecnica, architettura e flussi.
- `docs/RULES.txt` – regole naming del tracker.

---

## Note pratiche

- Le impostazioni sono salvate in localStorage (reset dati = reset settings).
- La qualita' dei suggerimenti dipende dalla qualita' dei nomi e dei metadata.
