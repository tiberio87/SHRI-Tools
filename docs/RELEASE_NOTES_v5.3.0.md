# SHRI-Tools v5.3.0

## Nuove funzionalità

- **Storico upload**: nuova sezione "Storico" accessibile dall'header per consultare gli upload passati. Ogni voce conserva titolo, esito, categoria/tipo/risoluzione, link (pagina torrent e download .torrent), ID (TMDB/IMDB/TVDB/MAL), screenshot, BBCode e MediaInfo/BDInfo.
  - BBCode con pulsanti **Copia** e **Anteprima**, MediaInfo/BDInfo in sezione a comparsa.
  - Possibilità di **eliminare** singole voci o **svuotare** l'intero storico.
  - I dati sono persistiti localmente in `upload-history.json` (cartella userData).
- **Link di download nei Tools/Impostazioni**:
  - mkbrr → [autobrr/mkbrr](https://github.com/autobrr/mkbrr/releases)
  - FFmpeg → build full [BtbN/FFmpeg-Builds](https://github.com/BtbN/FFmpeg-Builds/releases)
  - mkvpropedit → [MKVToolNix](https://mkvtoolnix.download/downloads.html)

## Miglioramenti UX

- Rimosse dalle Impostazioni le opzioni **Upload anonimo**, **Personal release** e **Coda moderazione**: restano selezionabili di volta in volta nella fase finale dell'upload (di default deselezionate).
- Rimosso dalle Impostazioni il toggle **Torrent privato**: la creazione resta sempre privata (prerogativa del tracker).

## Correzioni

- Anteprima BBCode ora mostrata correttamente sopra la finestra dello Storico (z-index).
- Corretto l'overflow del testo BBCode nel riquadro dello Storico e l'altezza della finestra (scroll interno, non richiede più la modalità a schermo intero).

## Sicurezza

- Validazione del certificato HTTPS attiva di default per le connessioni qBittorrent; disattivabile solo su richiesta esplicita (`allowInsecure`) per certificati self-signed.
- Corretto l'ordine di decodifica delle entità HTML (`&amp;` gestito per ultimo) per evitare doppio unescape.
- `stripTags` ora itera fino a stabilità e rimuove eventuali `<`/`>` orfani da tag non chiusi.

## Note per la release

- Tag: `v5.3.0`
- L'immagine Docker viene ricostruita automaticamente dai push su `main` e dai tag.
