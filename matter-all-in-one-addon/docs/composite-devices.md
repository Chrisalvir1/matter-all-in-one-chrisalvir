# Dispositivos compuestos por `device_id`

## Flujo

De forma predeterminada, el plugin consulta el entity registry de Home Assistant y agrupa las entidades que comparten `device_id`. Cuando encuentra un `fan.*` junto con al menos otra entidad compatible, publica un único `ServerNode` Matter:

- El ventilador es el endpoint principal.
- Una `light.*` se añade como endpoint Light hijo, seleccionando On/Off, Dimmable, Color Temperature o Extended Color a partir de `supported_color_modes` y atributos reales.
- Un `switch.*` puede añadirse como endpoint On/Off independiente.
- Sensores compatibles permanecen en endpoints separados dentro del mismo nodo cuando se incluyan; nunca se mezclan con los clusters Fan o Light.

El resultado es un solo QR y un único conjunto de fabrics para el dispositivo físico. Apple Home puede presentar Fan y Light como controles distintos; siguen perteneciendo al mismo accesorio Matter.

El panel deja activar únicamente la entidad principal (normalmente `fan.*`). Las demás filas aparecen como **Integrada**, incluso antes de publicar, para evitar crear accidentalmente dos códigos QR. Los dispositivos simples no cambian de comportamiento.

## Activación

En las opciones del add-on:

```yaml
group_by_device_id: true
```

Para reglas avanzadas, crea `/data/device-groups.json`:

```json
{
  "devices": [
    {
      "device_id": "abc123",
      "name": "Ventilador de Sala",
      "group_by_device_id": true,
      "primary_entity": "fan.ventilador_de_sala_main_fan",
      "include_entities": [
        "fan.ventilador_de_sala_main_fan",
        "light.ventilador_de_sala_main_light"
      ],
      "exclude_entities": ["switch.ventilador_beep"],
      "endpoint_order": [
        "fan.ventilador_de_sala_main_fan",
        "light.ventilador_de_sala_main_light"
      ],
      "friendly_name": "Ventilador de Sala",
      "room": "Sala"
    }
  ]
}
```

`include_entities`, `exclude_entities`, `primary_entity`, `endpoint_order`, `friendly_name` y `room` son opcionales. Las capacidades se detectan desde Home Assistant; no se deben forzar capacidades que la entidad no reporta.

## Sincronización y diagnóstico

Los eventos `state_changed` se enrutan al endpoint hijo adecuado. Los comandos Matter se traducen al servicio HA del dominio correspondiente (`fan.turn_on`, `fan.set_percentage`, `light.turn_on`, `switch.turn_off`, etc.).

Ejemplo de log esperado:

```text
Exported composite Matter device Ventilador de Sala with endpoints: fan.ventilador_de_sala_main_fan, light.ventilador_de_sala_main_light
```

Para volver al comportamiento anterior por entidad, establece `group_by_device_id: false` y reinicia el add-on. Antes de cambiar la topología de un accesorio ya emparejado, elimínalo de Apple Home y vuelve a emparejar el nuevo nodo compuesto.
