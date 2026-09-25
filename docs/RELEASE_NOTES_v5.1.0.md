# SHRI-Tools v5.1.0

## Nuove funzionalità

- **Cattura manuale dei frame**: nel wizard degli screenshot è possibile scorrere il filmato e catturare a mano i frame desiderati.
  - Anteprima live tramite slider, con pulsanti rapidi di spostamento (−60s / −10s / −1s / +1s / +10s / +60s) e indicatore tempo `HH:MM:SS / durata`.
  - Il frame scelto viene catturato a piena risoluzione (stessa scala/tonemapping degli screenshot automatici) e caricato automaticamente sull'host immagini.
  - Gli screenshot manuali vengono inclusi automaticamente nel BBCode.
- **Eliminazione screenshot**: ogni screenshot ha un pulsante di rimozione; eliminandolo viene cancellato **anche il file locale** dalla cartella del job.
- **Sostituzione screenshot**: gli screenshot generati automaticamente possono essere eliminati e rimpiazzati con quelli scelti manualmente.

## Comportamento

- La generazione automatica degli screenshot parte entrando nell'**Upload Wizard** (step Rules Check), non più alla selezione del file: evita conflitti con la rinomina file/cartella ed elimina lavoro inutile per chi usa solo il tool di rinomina.
- Al rientro in un job già lavorato, gli screenshot esistenti (inclusi i manuali) vengono **ripristinati** da `image_data.json` senza rigenerarli.

## Correzioni

- Risolto un deadlock su MediaInfo quando la generazione automatica e la sonda della cattura manuale venivano eseguite in contemporanea (le analisi sono ora serializzate).
- Corretti conflitti di specificità CSS che impedivano la corretta apertura/chiusura del pannello di cattura manuale e dell'overlay di caricamento.
- Riquadro anteprima ora responsive (larghezza fluida, limite d'altezza sul viewport).
- Aggiunti timeout di sicurezza sulle chiamate di analisi/anteprima per evitare caricamenti bloccati all'infinito.

## Note per la release

- Tag consigliato: `v5.1.0`
- L'immagine Docker viene ricostruita automaticamente dai push su `main` e dai tag.
