# Matter All-in-One Chrisalvir v2.3.18

15 de noviembre de 2026

Esta versión actualiza el puente a Matterbridge 3.11.3 y aplica el parche de seguridad de Node.js 26.13.1 LTS a las imágenes para Home Assistant.

## Matterbridge 3.11.3

- **Cubiertas Matter.** El motor registra correctamente `ClosureDimension` cuando su identificador numérico coincide con el de un tipo de dispositivo. El complemento usa este clúster para cubiertas compatibles. Matterbridge añade también configuraciones para cubiertas de elevación, inclinación y ambas capacidades.
- **Inventario del puente.** La interfaz nativa de Matterbridge consulta el inventario por plugin y recarga la tabla cuando arranca el puente. Las integraciones externas que consumen la API de Matterbridge deben revisar los cambios de rutas y del contrato de `/api/devices`.
- **Copias de seguridad.** El motor corrige el empaquetado de respaldos cuando se ejecuta con un perfil. También reenvía cambios de estado de puentes secundarios a los clientes del WebSocket experimental.
- **Base para cámaras Matter.** La opción `--root-camera` añade clústeres de alimentación, sincronización horaria y gestión TLS al nodo raíz de Matter. Matterbridge reporta 33 pruebas de conformidad para los clústeres de tiempo y TLS. La opción queda disponible en el motor y requiere habilitación explícita. [Notas de Matterbridge 3.11.3](https://github.com/Luligu/matterbridge/releases/tag/3.11.3)

## Dependencias

- **Node.js 26.13.1 LTS** incorpora correcciones de seguridad en TLS y HTTP/2. Home Assistant usa la base Alpine 3.24 con el mismo parche para amd64 y arm64. [Notas de Node.js 26.13.1](https://nodejs.org/en/blog/release/v26.13.1)
- **Werift 0.27.0 y ws 8.23.0** actualizan las bibliotecas WebRTC y WebSocket del complemento.
- **Vite 8.3.8, plugin de React 6.3.0, Lucide 1.73.0 y Prettier 3.10.1** actualizan la compilación, los iconos y las herramientas de formato.
- Se actualizan dependencias transitivas de expansión de patrones, tratamiento de direcciones IP y redirecciones HTTP. El flujo de publicación usa Docker Login Action 4.8.0.

## Verificación

- Instalación limpia, validación de tipos y formato, compilación y empaquetado npm correctos.
- **88 suites y 755 pruebas** del complemento. Las dos pruebas del contrato WebSocket con Home Assistant Core 2026.11.0 también pasaron.
- Contenedores Linux **amd64 y arm64** compilados y verificados con las dependencias de producción, FFmpeg y FFprobe.
- En pruebas locales, Werift negoció una sesión y entregó datos y un paquete de vídeo. WebSocket completó una conexión con intercambio de mensajes. La comprobación de accesorios físicos queda pendiente.
