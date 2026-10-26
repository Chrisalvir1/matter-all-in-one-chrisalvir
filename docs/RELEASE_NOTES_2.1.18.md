# Matter All-in-One v2.1.18 — restablecimiento Matter

## Emparejamiento de accesorios

- El botón «Desconectar todo y nuevo QR» utiliza el restablecimiento de fábrica del `ServerNode` Matter.js en el nodo que ya publica el accesorio.
- Se eliminan las fabrics del accesorio y se abre commissioning de nuevo, manteniendo su `storedId`, endpoint y perfil Matter elegido (por ejemplo, Robotina continúa como Matter RVC).
- La interfaz confirma éxito solo cuando no quedan fabrics y hay un QR o código manual nuevo.
- Si el nodo Matter no está listo o el reset no completa, la interfaz muestra el error sin afirmar que haya un QR nuevo.

## Diagnóstico de Robotina

La instancia HA confirmó MIAO 2.1.17 y el perfil `vacuum.sala_tv_robotina` como «Aspiradora robot (RVC)», con estado `DOCKED`. El reinicio anterior falló porque eliminó el contexto persistente que Matterbridge requiere para `storedId`; por eso no generó un QR y no debe considerarse completado. La 2.1.18 mantiene el RVC y restablece sus fabrics en el mismo nodo.
