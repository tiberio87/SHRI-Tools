# SHRI-Tools v5.4.2

Release di manutenzione successiva alla v5.4.1.

## Correzioni

### Selezione degli eseguibili su macOS e Linux
- I pulsanti **Sfoglia** nelle impostazioni di mkbrr, FFmpeg, BDInfo e mkvpropedit non applicano più il filtro `.exe` su macOS e Linux.
- Gli eseguibili senza estensione sono selezionabili direttamente, senza cambiare manualmente il filtro.
- Su Windows rimangono il filtro predefinito `.exe` e l'opzione per visualizzare tutti i file.
- I suggerimenti nei campi percorso non indicano più nomi specifici di Windows.
- Nessuna modifica ai percorsi salvati o ai permessi dei file: su macOS e Linux il binario selezionato deve avere i permessi di esecuzione.

## Test
- Test unitari del selettore per macOS, Linux e Windows, inclusi annullamento, selezione vuota e propagazione degli errori.

## Distribuzione
- Versione dell'applicazione aggiornata a **5.4.2**.
- Pubblicazione automatica della release al merge su `main`, con eseguibile Windows e pacchetti Linux x64/arm64 tramite GitHub Actions.
- Immagine Docker ricostruita automaticamente da `main`.
- La pipeline esistente non genera pacchetti macOS; la correzione è disponibile anche avviando l'app dai sorgenti su macOS.
