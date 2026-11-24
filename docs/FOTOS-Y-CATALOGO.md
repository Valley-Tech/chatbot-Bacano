# v1.2 · Fotos del catálogo, "menú", "carta" y hora real

## ¿Por qué salía "Todavía no está en nuestro catálogo de WhatsApp" con los tacos?
El bot revisaba en línea cada foto (VERIFICAR_FOTOS) y solo la aceptaba si el servidor decía que era una
imagen (`content-type: image/*`). Las fotos de Loggro (pirpos-files.s3.amazonaws.com) responden
`application/octet-stream` (verificado el 24 nov 2026), así que **todas** quedaban "sin foto", aunque Meta sí
las muestre. Ahora:
- `VERIFICAR_FOTOS` viene apagado: manda el CSV de Meta (`docs/catalogo-meta-bacano.csv`).
- Si se enciende, solo cuenta como faltante un 404/410 o un 403 que se repite al pedir la imagen; cualquier
  2xx que no sea una página de error es una foto. Las fallas se escriben en el log de Railway.
- El CSV puede ser el que guarda Excel (tabulaciones, Windows-1252): el bot y `npm run catalogo` lo leen igual.

## Fotos puestas a mano en Meta
`npm run catalogo -- productos.json` conserva las fotos que pusiste a mano en el CSV (las que Loggro no tiene),
por ejemplo Tacos x4 y Salchipapas Mexicanas. Para usar el CSV que bajaste de Meta:
`CATALOGO_META_ACTUAL=ruta/al.csv npm run catalogo -- productos.json`.

## "menú", "carta" y hora real (igual que BlackStationBot v3.10)
- "quiero el menú", "el menú completo" → catálogo de WhatsApp (`CATALOG_TEMPLATE`) o la lista de cartas.
- "el menú de los tacos" → carrusel solo de tacos; "el menú de bebidas" → carta de Bebidas.
- "la carta" → el PDF (`CARTA_URL`); sin PDF, la carta del catálogo que nombre o la lista de cartas.
- "el link del menú", "el menú en la página web" → `MENU_WEB_URL` (si la configuras).
- "¿hay servicio?", "¿están abiertos?", "¿a qué hora cierran?" → respuesta con la hora de Bogotá.
- La IA recibe la fecha, la hora y si están abiertos o cerrados (`HORA_EN_IA`).
