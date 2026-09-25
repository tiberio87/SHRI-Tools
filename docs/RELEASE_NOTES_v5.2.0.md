# SHRI-Tools v5.2.0

## Nuove funzionalità

- **Tonemapping con libplacebo (Dolby Vision Profile 5)**: nuovo toggle nelle impostazioni "Usa libplacebo per il tonemapping".
  - Risolve i colori errati (dominanti verde/rosa) degli screenshot dai file **Dolby Vision Profile 5**, dove il base layer è in spazio ICtCp/IPT non gestibile dalla catena `zscale`.
  - libplacebo legge l'RPU Dolby Vision ed esegue il tonemap HDR → SDR (BT.709) su GPU, con colori corretti.
  - Attivo su tutte le vie: generazione automatica, anteprima e cattura manuale dei frame.
  - Il toggle è **disattivato di default** perché richiede una GPU con supporto Vulkan e un build di FFmpeg compilato con `--enable-libplacebo --enable-vulkan`.

## Docker

- L'immagine usa ora un build **FFmpeg statico "full"** (BtbN, con `libplacebo` + `vulkan`) al posto del pacchetto di sistema, così il tonemapping libplacebo è disponibile out-of-the-box.
- Aggiunti loader e driver Vulkan (`libvulkan1`, `mesa-vulkan-drivers`).

## Note per la release

- Tag consigliato: `v5.2.0`
- Per usare il toggle su installazioni non-Docker serve un FFmpeg con `libplacebo`/`vulkan` e una GPU compatibile.
- L'immagine Docker viene ricostruita automaticamente dai push su `main` e dai tag.
