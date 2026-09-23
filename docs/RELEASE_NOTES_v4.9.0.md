# SHRI-Tools v4.9.0

## Nuove funzionalità

- **Salta il controllo hash su qBittorrent (seed immediato)**: quando si invia il torrent al client per andare in seed, l'app usa il parametro `skip_checking` di qBittorrent così il torrent parte subito in seeding senza ricontrollare gli hash dei file già presenti in locale.

## Comportamento

- Nuova opzione "Salta il controllo hash (seed immediato)" nelle Impostazioni di qBittorrent, attiva di default.
- L'opzione si applica solo all'invio verso qBittorrent; Transmission non è interessato.
- Disattivando l'opzione, qBittorrent torna a ricontrollare gli hash all'aggiunta del torrent.

## Note per la release

- Tag consigliato: `v4.9.0`
- L'immagine Docker viene ricostruita automaticamente dai push su `main` e dai tag.
