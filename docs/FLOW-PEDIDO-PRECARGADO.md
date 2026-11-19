# Flow de pedido precargado (v1.1) · BacanoBot

Con `FLOW_PRECARGA=true` el bot abre el Flow de pedido con lo que el cliente ya dijo en el chat
("pago por transferencia", "paso a recoger", "a domicilio a la calle 10 # 5-20") y su nombre de WhatsApp:

```json
"flow_action": "navigate",
"flow_action_payload": {
  "screen": "DETAILS",
  "data": { "init_values": { "name": "Ana", "phone": "3001234567", "address": "domicilio", "pago": "Efectivo", "recomendacion": "Dirección: Calle 10 # 5-20" } }
}
```

Solo van los datos conocidos. Las claves son los `name` de los campos del Flow de Bacano:

| Campo del Flow | Tipo | Valor que pone el bot |
|---|---|---|
| `name` | TextInput | nombre del perfil de WhatsApp, sin emojis |
| `phone` | TextInput | el celular del cliente sin el 57 |
| `address` | RadioButtonsGroup | id `domicilio` o `restaurante` |
| `pago` | Dropdown / RadioButtons | id `Efectivo` o `Transferencia` |
| `recomendacion` | TextArea | `Dirección: …` (solo si escribió la dirección en el chat) |

## Cambios en el Flow (Flow Builder de Meta)
1. En la pantalla **DETAILS**, agrega en `"data"`:
```json
"data": {
  "init_values": {
    "type": "object",
    "properties": {
      "name": { "type": "string" }, "phone": { "type": "string" },
      "address": { "type": "string" }, "pago": { "type": "string" }, "recomendacion": { "type": "string" }
    },
    "__example__": { "name": "Ana", "phone": "3001234567", "address": "restaurante", "pago": "Efectivo" }
  }
}
```
2. En el `Form` de DETAILS agrega: `"init-values": "${data.init_values}"`.
3. Revisa que los `name` de los campos sean `name`, `phone`, `address`, `pago`, `recomendacion` y que los ids
   de las opciones sean `domicilio` / `restaurante` y `Efectivo` / `Transferencia`. Si alguno se llama
   distinto, avísame y ajusto `valoresFlowPedido` en `src/services/messageHandler.js`.
4. Prueba con `docs/postman-flow-precargado.json` (con `"mode": "draft"`, antes de publicar).
5. Publica el Flow y pon `FLOW_PRECARGA=true` en Railway.

Orden importante: primero despliega el bot (con `FLOW_PRECARGA` apagado no cambia nada), después publica
el Flow y al final enciende `FLOW_PRECARGA`. Si Meta rechaza el mensaje, apágalo y el Flow vuelve a abrir vacío.
