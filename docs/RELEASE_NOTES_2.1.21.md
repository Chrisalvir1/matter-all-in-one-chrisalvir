# Matter All-in-One 2.1.21

- Retira el clúster Matter Electrical Power Measurement del endpoint RVC, principal sospechoso de la ficha «Incompatible» vista en Robotina en Apple Casa.
- Conserva el vacuum como nodo Matter independiente con batería, estado, modos de limpieza y controles RVC.
- La potencia del sensor asociado continúa en Home Assistant; no se anuncia como parte del RVC porque ese clúster no está declarado para este tipo de dispositivo.
- Para aplicar la nueva composición, restablece el nodo Matter de Robotina desde Matter All-in-One, elimina la ficha incompatible de Apple Casa y empareja el nuevo QR.
