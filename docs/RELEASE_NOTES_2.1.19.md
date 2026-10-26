# Matter All-in-One v2.1.19

## Aspiradoras RVC y Apple Home

- Evita que una aspiradora y sus sensores de potencia se combinen en un nodo genérico cuya raíz se identifica como sensor eléctrico.
- Conserva la aspiradora como un accesorio RVC Matter independiente con un solo QR.
- El accesorio utiliza controles, modos de limpieza y batería vinculada que Matter RVC soporta cuando Home Assistant los expone.

## Límite de compatibilidad

Apple Home puede no mostrar como tarjetas individuales las métricas que no forman parte del modelo Matter RVC (por ejemplo, corriente/potencia o tiempos propietarios). Los sensores Omni siguen siendo entidades HA; no se publican falsamente como atributos RVC.
