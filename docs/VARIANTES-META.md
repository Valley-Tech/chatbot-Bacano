# Variantes del catálogo de Meta en BacanoBot

## Cómo se ve
El catálogo de Meta agrupa las variantes con `item_group_id` y **todas las variantes de un grupo tienen el mismo título** (regla de Meta). `docs/catalogo-meta-bacano.csv` ya viene así: el `item_group_id` es el `_id` del producto padre en Loggro y cada subproducto de Loggro es una variante con su propio ID, precio y el campo `size` con el nombre de la variante.

Con **`VARIANTES_META` activo (por defecto)** el bot manda **una sola tarjeta por grupo**:

| Carta | Tarjetas |
|---|---|
| Comidas 🌮🍔 | Tacos x1 · Tacos x3 · Tacos x4 · Quesabirria · Burritos · Torta del Chavo · Nachos con Birria · Dorilocos · Birriamen · Salchipapas · Salchipapas Mexicanas · Hamburguesas · Asados · Picadas |
| Heladería y Botanas 🍨 | Bola de Helado en Cono · Bola de Helado en Vaso · Copa de Helado Decorada · Banana Split · Helamoyado · Chamoyada · Brownie · Malteadas · Nevado de Café · Botanas Mexicanas |
| Bebidas 🍹🥤 | Jugos en Agua · Jugos en Leche · Frappés y Cerezadas · Smoothie Maracupiña · Smoothie Piñacafresa · Micheladas · Soda de Jamaica · Soda de Tamarindo · Raspado al Diablito · Coca-Cola · Agua · Ginger |

Al tocar una tarjeta, WhatsApp abre el producto con el selector **"Tamaño"** (Sencilla / Especial / Chingona, 2 personas / 3 personas…, 1 L / 1.5 L / 400 ml) y **cada opción con su precio**. El carrito llega con el ID exacto de la variante, el resumen dice el nombre completo ("Hamburguesa Chingona x1") y así va a Loggro.

## Grupos (16)
Bola de Helado en Vaso (9 sabores), Asados (4), Botanas Mexicanas (2), Burritos (3), Coca-Cola (3), Dorilocos (3 tamaños), Frappés y Cerezadas (4), Hamburguesas (3), Jugos en Agua (4), Jugos en Leche (4), Micheladas (5), Picadas (5 tamaños), Salchipapas Mexicanas (2), Salchipapas (3), Tacos x1 (4), Tacos x3 (4).

Quesabirria y Torta del Chavo tenían subproductos repetidos o con precio errado en Loggro: quedaron como producto sencillo con el ID de la variante válida (ver `docs/REVISAR-LOGGRO.md`).

## Cuando cambien las variantes
1. Corrige en Loggro y vuelve a consultar los productos (Postman, `GET https://api.pirpos.com/products`).
2. `npm run catalogo -- ruta/productos.json` → regenera `src/data/catalogo.js` y los CSV.
3. Sube `docs/catalogo-meta-bacano.csv` a Meta y `docs/productos-crm-bacano.csv` al CRM. Despliega.

Para mostrar cada variante por separado: `VARIANTES_META=false` (la carta de Comidas pasaría de 14 a 36 productos y Meta solo permite 30 por mensaje, así que habría que dividirla).
