# SHRI-Tools v5.4.1

Release di manutenzione successiva alla v5.4.0.

## Correzioni

### Screenshot automatici dopo upload consecutivi
- Risolto il mancato avvio degli screenshot al ritorno su **Rules Check** con un file diverso.
- Il wizard non riutilizza più il titolo torrent e gli screenshot del job precedente.
- Ripristino degli screenshot dalla cartella corretta; le risposte asincrone obsolete vengono ignorate.
- Stato di generazione e pulsanti sbloccati anche in caso di errore.

### Seed immediato su qBittorrent
- Compatibilità con la WebAPI qBittorrent **2.16.0+**: usa `seedMode=true`, anziché il parametro dismesso `skip_checking`.
- Compatibilità mantenuta con le WebAPI precedenti alla 2.16.0 (`skip_checking=true`).
- La versione della WebAPI viene rilevata automaticamente quando l'opzione "Salta il controllo hash" è abilitata.
- La verifica dei dati non viene saltata se l'opzione è disabilitata. In caso di versione API non riconosciuta, viene mostrato un errore.
- **Importante**: il seed immediato va usato solo con file locali già presenti e identici al contenuto del torrent.

### Docker / noVNC
- Evitati i messaggi `xmessage` di `fbsetbg` in Fluxbox all'avvio del container.
- Configurazione `background: unset` in `/data/.fluxbox/overlay` senza installare wallpaper setter aggiuntivi.
- Non vengono modificati i volumi dell'applicazione o le altre preferenze di Fluxbox.

## Test
- Test unitari del parametro qBittorrent in base alla versione WebAPI (`npm test`).
- Test simulati della generazione screenshot su più file e recupero da errori IPC.

## Distribuzione
- Versione dell'applicazione aggiornata a **5.4.1** in `package.json` e `package-lock.json`.
- Generazione automatica degli eseguibili Windows e dei pacchetti Linux tramite GitHub Actions.
- Immagine Docker ricostruita automaticamente dalla branch `main`.

## Note
- Le nuove release possono essere scaricate dalla sezione GitHub Releases.
- Per aggiornare il container Docker: `docker compose pull && docker compose up -d --force-recreate`.
