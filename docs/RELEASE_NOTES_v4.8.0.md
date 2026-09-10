# SHRI-Tools v4.8.0

## Nuove funzionalità

- **Generazione screenshot automatica in background**: alla selezione di un file singolo o di una cartella di episodi, la generazione degli screenshot parte automaticamente in background, senza attendere l'ultimo step del wizard.
- La generazione viene avviata dopo la finalizzazione del piano di rinomina, così le immagini vengono salvate nell'unica cartella job del torrent (nessuna cartella duplicata).

## Comportamento

- Sono esclusi i Full Disc Blu-ray (BDMV) e i DVD (VIDEO_TS), che richiedono la selezione manuale della playlist.
- Notifiche a schermo principale: "Generazione screenshot iniziata..." all'avvio e "Generazione screenshot completata: X/Y" al termine (o messaggio di errore).
- Se FFmpeg o l'host immagini non sono configurati, l'avvio automatico viene saltato con un avviso.
- Nel wizard, il pulsante "Genera & Carica" riutilizza gli screenshot già generati in background e chiede conferma prima di rigenerarli.

## Note per la release

- Tag consigliato: `v4.8.0`
- L'immagine Docker viene ricostruita automaticamente dai push su `main` e dai tag.
