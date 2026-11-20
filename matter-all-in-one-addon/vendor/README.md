# HAP-NodeJS para HomeKit Secure Video

El paquete de esta carpeta se generó con `npm pack --ignore-scripts` a partir
de `vendor/hap-nodejs` en [Camera.UI HomeKit 4K
v0.6.64-beta.3](https://github.com/Chrisalvir1/homekit-4k/tree/v0.6.64-beta.3/vendor/hap-nodejs)
(commit `645ca6a5d785d4f18cfc704a2fe5e1a5d21d96c4`). El paquete incluye la
licencia Apache 2.0 y las notas de la variante. El lockfile aplica la
verificación de integridad al instalar y el empaquetado npm incluye la
dependencia instalada.

Esta variante parte del runtime HAP-NodeJS 2.3.0 y añade SecureVideoController.
Las cámaras H.264 y los accesorios HAP genéricos siguen usando sus
controladores existentes.
