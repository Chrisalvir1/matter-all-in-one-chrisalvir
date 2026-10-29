# Matter All-in-One v2.3.2

## [2.3.2] - 2026-10-29

- Restaura la negociación clásica HAP con varias resoluciones y FPS dinámicos de 15, 20, 25 y 30, limitados al perfil de fuente medido. No presenta los valores de respaldo como mediciones del dispositivo.
- Mide una URL Omni nueva antes de publicar el accesorio; evita verificar la URL temporal antigua guardada por Camera.UI y renueva la asignación después de consumirla con ffprobe.
- Revalida vídeo y audio Omni al abrir Live View, con detector y prebuffer pausados, y actualiza los modos del accesorio existente sin cambiar UUID, PIN, puerto ni emparejamiento.
- Conserva passthrough H.264 cuando coincide con la salida negociada. Si Casa solicita menor tamaño o FPS, adapta realmente esa salida con un codificador comprobado; conserva la relación de aspecto.
- Mantiene el anuncio HKSV separado, con el formato principal de grabación. La recuperación física de Live View y los clips guardados en Casa requieren comprobación después de instalar; esta publicación no los da por verificados.

