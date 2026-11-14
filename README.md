# BacanoBot · chatbot de WhatsApp de Bacano (ValleyTech)

Chatbot de pedidos para **Bacano** (comida mexicana, salchipapas, heladería y bebidas) sobre la
API oficial de WhatsApp Business, conectado al **CRM ValleyTech** (bandeja, IA y conocimiento,
fallas) y al POS **Loggro**. Misma lógica que SamuelitoBot y BlackStationBot (v3.6).

## Qué hace
1. **Saludo** → bienvenida una sola vez por turno (5:00 p. m. a 11:00 p. m.) con los botones
   *Pedir 🛒*, *Ubicación 📍* y *Preguntar 🤖*. Si vuelve a saludar: "¡Hola de nuevo!".
2. **El cliente pregunta por un producto** ("quiero 2 tacos de birria", "¿qué hamburguesas tienen?",
   "tienen micheladas?") → búsqueda con la **IA del CRM** y respaldo local → **tarjeta** (1 producto)
   o **carrusel** (2 a 10) del catálogo de Meta. Si no dice cuál ("quiero malteada") salen todas las opciones.
3. **Botón Pedir** → lista con las 3 cartas (**Comidas**, **Heladería y Botanas**, **Bebidas**); cada
   carta es un catálogo multiproducto con **una tarjeta por grupo de variantes** (el sabor o el tamaño
   se elige dentro del producto: "Hamburguesas" → sencilla / especial / chingona).
4. **Carrito** → "¿Está todo bien?" con *Confirmar pedido*, *Agregar más* y *Cambiar pedido*;
   recordatorio a los 5 y 10 min; *cancelar*.
5. **Confirmar** → **Flow de pedido** (datos de entrega y pago; lo creas tú en Meta y pones su ID en
   `FLOW_ID_PEDIDO`) → **Efectivo** (pedido recibido) o **Transferencia** (cuentas + comprobante).
6. Con el pedido: **aviso al negocio** (plantilla `nuevo_pedido` a `NOTIFY_NUMBERS`), fila en
   **Google Sheets** y **comanda en Loggro** (cada producto con su área de preparación y la bodega
   del negocio; el domicilio como producto si existe en Loggro).
7. **Adicional**: otro carrito dentro de 60 min usa los mismos datos sin cobrar domicilio otra vez.
8. Preguntas libres (horario, tiempos, "¿la quesabirria qué trae?") → IA del CRM con el conocimiento del negocio.

Detalle: `docs/CONVERSACION-Y-PEDIDOS.md`, `docs/VARIANTES-META.md`, `docs/CATALOGOS.md`.

## Estructura
```
src/
  app.js                       servidor Express (webhook, /flow, /crm/events)
  config/env.js                variables de entorno (ver .env.example)
  config/negocio.js            nombre, horario, domicilio, cuentas, ubicación, contacto
  controllers/webhookController.js  Meta / CRM → dispatch; endpoint cifrado del Flow
  data/catalogo.js             GENERADO desde Loggro: productos, precios, cartas, áreas, variantes
  services/
    messageHandler.js          la conversación y el pedido
    busquedaPlatos.js          búsqueda con IA + tarjetas / carrusel
    conversacion.js            saludo por turno, cortesías, "pide un producto" vs "pregunta"
    sesiones.js                estado por cliente y flow_token
    fotosCatalogo.js           qué productos tienen foto en Meta (filtro del carrusel)
    flow.js · datosFlow.js     pantallas del Flow de pedido; domicilio / recoger
    loggroService.js           POST https://api.pirpos.com/orders
    googleSheetsService.js     filas de pedidos
    crmAdapter.js · reportarFallas.js · geminiService.js   CRM ValleyTech
    whatsappService.js · httpRequest/sendToWhatsApp.js      envío (gateway o espejo)
    awsS3Service.js            comprobantes de transferencia
scripts/
  generar-catalogo.mjs         JSON de Loggro → catalogo.js + CSV de Meta + CSV del CRM + docs
  verificar-catalogo.mjs       límites de Meta (30 productos, 10 secciones) y productos faltantes en Meta
  productos-crm.mjs · fotos.mjs · clave-flow.mjs · probar-clave.mjs
docs/
  catalogo-meta-bacano.csv     para el Administrador de ventas de Meta (con item_group_id)
  productos-crm-bacano.csv     para CRM → Chatbots → BacanoBot → IA y conocimiento → Catálogo de productos
  REVISAR-LOGGRO.md            productos sin foto, duplicados y nombres a corregir en Loggro
```

## Puesta en marcha
1. `npm install` y copia `.env.example` a `.env` (en Railway, las mismas variables).
2. **Catálogo de Meta:** en el Administrador de ventas crea el catálogo de Bacano y sube
   `docs/catalogo-meta-bacano.csv` (hoja de datos). Pon su ID en `CATALOG_ID` y conéctalo al número de WhatsApp.
   Los productos **sin foto** no se muestran: súbeles foto en Loggro y vuelve a generar el catálogo.
3. **Flow de pedido:** crea el Flow (pantallas `DETAILS` → `SUMMARY` → `SUCCESS`, campos `name`, `phone`,
   `address` con los ids `domicilio` / `restaurante`, `pago` con `Efectivo` / `Transferencia`, `recomendacion`),
   con endpoint `https://<bot>/flow`. Claves: `npm run clave-flow` → `PRIVATE_KEY`, `PASSPHRASE`; ID → `FLOW_ID_PEDIDO`.
4. **Plantillas** en la WABA de Bacano: `nuevo_pedido` y `comprobante_pago` (encabezado de imagen y
   6 variables: nombre, celular, entrega, pedido, medio de pago, total), como en Samuelito.
5. **CRM ValleyTech:** crea el chatbot BacanoBot, conecta el número, copia `CRM_API_KEY` y
   `CRM_SIGNING_SECRET`, y en *IA y conocimiento* sube `docs/productos-crm-bacano.csv` (Catálogo de productos)
   más la información del negocio (horarios, domicilio, tiempos).
6. **Loggro:** `LOGGRO_API_KEY` y `LOGGRO_TABLE_ID` (mesa donde caen los pedidos de WhatsApp).
   La bodega y las áreas de preparación salen del JSON de productos.
7. **Google Sheets:** hoja de pedidos compartida como Editor con la cuenta de servicio → `SPREADSHEETID_PEDIDO`.
8. `npm run verificar` (con `CATALOG_ID` y `API_TOKEN` compara contra Meta) y `npm start`.

## Cuando cambien los productos en Loggro
```
npm run catalogo -- ruta/productos-bacano.json   # consulta GET https://api.pirpos.com/products (Postman)
npm run verificar
```
Después: sube `docs/catalogo-meta-bacano.csv` a Meta, `docs/productos-crm-bacano.csv` al CRM,
commit y despliega. El JSON de Loggro trae costos internos: **no lo subas al repositorio** (está en `.gitignore`).
