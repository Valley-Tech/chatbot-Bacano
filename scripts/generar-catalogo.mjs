#!/usr/bin/env node
/**
 * Genera el catálogo del bot a partir de la consulta de productos de Loggro (Pirpos):
 *
 *   npm run catalogo -- ruta/productos-bacano.json
 *
 * Escribe:
 *   src/data/catalogo.js             product_names, precios, CATALOGOS (cartas y secciones),
 *                                    AREAS_LOGGRO / areaPorId, grupoPorId, tituloGrupo, variantePorId
 *   docs/catalogo-meta-bacano.csv    para subir al Administrador de ventas de Meta (con item_group_id)
 *   docs/productos-crm-bacano.csv    para CRM → Chatbots → BacanoBot → IA y conocimiento → Catálogo de productos
 *   docs/CATALOGOS.md                resumen legible de las cartas
 *   docs/REVISAR-LOGGRO.md           lo que hay que corregir en Loggro (nombres, duplicados, fotos)
 *
 * Reglas:
 *   · Un producto de Loggro SIN subproductos es un producto del catálogo (ID = _id).
 *   · Un producto CON subproductos es un GRUPO de variantes: cada subproducto es una
 *     variante (ID = _id del subproducto, que es el que tiene precio propio y el que se
 *     manda a Loggro). En Meta, las variantes comparten item_group_id = _id del padre y
 *     el MISMO título (regla de Meta); la variante va en el campo "size" para que
 *     WhatsApp muestre el selector dentro de la tarjeta.
 *   · El JSON de Loggro trae nombres en mayúsculas, con faltas y duplicados. La tabla
 *     CORRECCIONES de abajo arregla lo que se sabe; lo demás queda anotado en REVISAR-LOGGRO.md.
 *   · El JSON tiene costos internos (pricePurchase, avgCost): NO lo subas al repositorio.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const entrada = process.argv[2];
if (!entrada) { console.error('Uso: npm run catalogo -- ruta/productos-bacano.json'); process.exit(1); }
const productos = JSON.parse(readFileSync(entrada, 'utf8'));

const MARCA = 'Bacano';
const LINK = process.env.CATALOGO_LINK || 'https://valleytech.up.railway.app/';

// ---------------------------------------------------------------------------
//  Correcciones a los datos de Loggro (por _id). "nombre" = cómo lo ve el cliente;
//  "variante" = texto del selector en WhatsApp; "omitir" = no va al catálogo.
// ---------------------------------------------------------------------------
const CORRECCIONES = {
  // Grupos (producto padre → título que verá el cliente)
  '6ae3b8c42f9b13af46c68936': { nombre: 'Bola de Helado en Vaso', nombreVariante: 'Bola de Helado en Vaso de {v}' },
  '6ae3b88d27548bc4ddfea8fb': { nombre: 'Bola de Helado en Cono' },
  '6ae40ccd8b592077782e1358': { nombre: 'Asados', nombreVariante: '{v}' },
  '6af4eccc815daed5a6171ad9': { nombre: 'Botanas Mexicanas', nombreVariante: '{v}' },
  '6ae3a7fdfd5558bc32883224': { nombre: 'Burritos', nombreVariante: 'Burrito {v}' },
  '6ae3b0c2ea273597d6522b98': { nombre: 'Dorilocos', nombreVariante: 'Dorilocos {v}' },
  '6ae3de664888e191527d9519': { nombre: 'Frappés y Cerezadas', nombreVariante: 'Frappé {v}' },
  '6ae3a9ab4888e19152fdd1dc': { nombre: 'Hamburguesas', nombreVariante: 'Hamburguesa {v}' },
  '6ae405ac8ab1d45d08eaa9c7': { nombre: 'Jugos en Agua', nombreVariante: 'Jugo de {v} en Agua' },
  '6ae4056558f9b0a66b383d20': { nombre: 'Jugos en Leche', nombreVariante: 'Jugo de {v} en Leche' },
  '6ae3e057f7e40bd0d3440b8d': { nombre: 'Micheladas', nombreVariante: 'Michelada {v}' },
  '6ae40bbe8ab1d45d08f707ad': { nombre: 'Picadas', nombreVariante: 'Picada para {v}' },
  '6ae3b2b8fd5558bc329fba7d': { nombre: 'Quesabirria' },
  '6ae40b6f71ab6cef726c044a': { nombre: 'Salchipapas Mexicanas', nombreVariante: 'Salchipapa Mexicana {v}' },
  '6ae40b44d7b104ae7d0857a9': { nombre: 'Salchipapas', nombreVariante: 'Salchipapa {v}' },
  '6ae16f49a94719c5d539e2cb': { nombre: 'Tacos x1', nombreVariante: 'Tacos {v} x1' },
  '6ae1013ec47d71e1e6f71948': { nombre: 'Tacos x3', nombreVariante: 'Tacos {v} x3' },
  '6ae3afaaea273597d64f3fd4': { nombre: 'Torta del Chavo' },
  '6ae4b83db62c2d5ffe26aa18': { nombre: 'Coca-Cola', nombreVariante: 'Coca-Cola {v}' },
  // Productos sueltos
  '6ae3ba532f9b13af46cadb03': { nombre: 'Nevado de Café' },
  '6ae3ddafbbbc4287b3e4b73e': { nombre: 'Smoothie Piñacafresa' },     // ⚠️ confirmar el nombre con el negocio
  '6ae3bb75fa10411a78e18c49': { nombre: 'Smoothie Maracupiña' },
  '6ae3e1b4595e36ff80a0bc0f': { nombre: 'Soda de Jamaica' },
  '6ae3e2232133aea23607b914': { nombre: 'Soda de Tamarindo' },
  '6ae3baeb961e16e9ef024e27': { nombre: 'Raspado al Diablito' },
  '6ae3b9d427548bc4dd01aae6': { nombre: 'Banana Split' },
  '6ae3b8fdfd5558bc32ad2cd7': { nombre: 'Copa de Helado Decorada' },
  '6ae3b216ac2fc19d00801830': { nombre: 'Nachos con Birria' },
  '6af4edf1b8e6258202b8cfe8': { nombre: 'Tacos x4' },
  '6ae171176a9e5dc2f94443e1': { nombre: 'Agua' },
  // Nuevos en Loggro (23 nov 2026)
  '6b00e26629e2f671ebd4fb0e': { nombre: 'Postobón Manzana Personal' },
  '6b00e23829e2f671ebd4845e': { nombre: 'Gaseosa Quatro (Toronja)' },  // en Loggro "GASEOSA 4" = Quatro de toronja (Beth, 24 nov)
  '6b00da6f61b4dedd039b3ac0': { nombre: 'Soda' },
  '6afa701f9603187f3d464c12': { nombre: 'Mexipaleta' },
  '6b00e7c6ada2be2853f6e41e': { nombre: 'Paletas' },
  // Variantes (subproductos)
  '6ae8d6e2e8da0ad9cefd59a0': { variante: 'Carne Asada' },
  '6ae8d6e2e8da0ad9cefd59a3': { variante: 'Pechuga Asada' },
  '6ae8d6e2e8da0ad9cefd59a6': { variante: 'Punta Gorda' },
  '6ae8d6e2e8da0ad9cefd59a9': { variante: 'Lomo' },
  '6ae8d6e2e8da0ad9cefd59ac': { omitir: 'Repetido: "Carne asada ASADOS" aparece dos veces con el mismo precio' },
  '6ae8d23a8fd15682eef0093c': { omitir: 'Subproducto con el mismo nombre del padre ("1 bola de helado vaso"), sin sabor' },
  '6af4ed30e1a589a3d09d34a7': { variante: 'Botanas Mexicanas' },
  '6af4ed30e1a589a3d09d34aa': { variante: 'Gomitas Enchiladas' },
  '6af4ed31e1a589a3d09d34ad': { omitir: 'Repetido: "BOTANAS MEXICANAS" aparece dos veces' },
  '6ae8cd46832bbb198f39599c': { variante: 'de Carne' },
  '6ae8cd46832bbb198f39599f': { variante: 'de Pollo' },
  '6ae8cd46832bbb198f3959a2': { variante: 'Mix' },
  '6ae8cf1fbad51218faa60c38': { variante: 'Personal' },
  '6ae8cf1fbad51218faa60c3b': { variante: 'Mediano' },
  '6ae8cf1fbad51218faa60c3e': { variante: 'Grande' },
  '6af3523ac722258ce686026a': { variante: 'Fresa en Leche' },
  '6af3523ac722258ce686026d': { variante: 'Lulo en Leche' },
  '6af3523ac722258ce6860270': { variante: 'Maracuyá en Leche' },
  '6af3523ac722258ce6860273': { variante: 'Cerezada' },
  '6ae8d90c8fd15682eef54ced': { variante: 'Sencilla' },
  '6ae8d90c8fd15682eef54cf0': { variante: 'Especial' },
  '6ae8d90c8fd15682eef54cf3': { variante: 'Chingona' },
  '6af35390c88bb9cf7fa510a7': { variante: 'Fresa' },
  '6af35390c88bb9cf7fa510aa': { variante: 'Lulo' },
  '6af35390c88bb9cf7fa510ad': { variante: 'Maracuyá' },
  '6af35390c88bb9cf7fa510b0': { variante: 'Guanábana' },
  '6af355150211d08070345096': { variante: 'Maracuyá' },
  '6af355150211d08070345099': { variante: 'Lulo' },
  '6af355150211d0807034509c': { variante: 'Fresa' },
  '6af355150211d0807034509f': { variante: 'Guanábana' },
  '6af34f1f0211d08070250fcb': { variante: 'Frutos Amarillos' },
  '6af34f1f0211d08070250fce': { variante: 'Frutos Rojos' },
  '6af34f1f0211d08070250fd1': { variante: 'Frutos Verdes' },
  '6af34f1f0211d08070250fd4': { variante: 'Azul' },
  '6af34f73f4f59fd4e03f72a9': { variante: 'de la Casa' },
  '6ae8e17b43188be97f0ab9af': { variante: '2 personas' },
  '6ae8e17b43188be97f0ab9b2': { variante: '3 personas' },
  '6ae8e17b43188be97f0ab9b5': { variante: '4 personas' },
  '6ae8e17b43188be97f0ab9b8': { variante: '5 personas', nota: 'En Loggro dice "Picada para 2 personas" con precio $60.000: se asume 5 personas ⚠️ confirmar' },
  '6ae8e17b43188be97f0ab9bb': { variante: '6 personas', nota: 'En Loggro dice "Picada para 2 personas" con precio $70.000: se asume 6 personas ⚠️ confirmar' },
  '6ae8dfbf887b3051f9fae6bc': { variante: 'Quesabirria' },
  '6ae8dfbf887b3051f9fae6bf': { omitir: 'Repetido: dos subproductos "Quesabirria" iguales' },
  '6ae8e5a443188be97f0ddadd': { variante: 'Birria' },
  '6ae8e5a443188be97f0ddae0': { variante: 'al Pastor' },
  '6ae8e4b017b412cdc5d625e0': { variante: 'Sencilla' },
  '6ae8e4b017b412cdc5d625e3': { variante: 'Mixta' },
  '6ae8e4b017b412cdc5d625e6': { variante: 'Especial' },
  '6ae8dab6acca84dbb01989da': { variante: 'Birria', nombre: 'Tacos de Birria x1' },
  '6ae8dab6acca84dbb01989dd': { variante: 'al Pastor' },
  '6ae8dab6acca84dbb01989e0': { variante: 'Ranchero' },
  '6ae8dab6acca84dbb01989e3': { variante: 'Chicharrón', nombre: 'Tacos de Chicharrón x1' },
  '6ae8dbc73dd959d80c2b12f3': { variante: 'Birria', nombre: 'Tacos de Birria x3' },
  '6ae8dbc73dd959d80c2b12f6': { variante: 'al Pastor' },
  '6ae8dbc73dd959d80c2b12f9': { variante: 'Ranchero' },
  '6ae8dbc73dd959d80c2b12fc': { variante: 'Chicharrón', nombre: 'Tacos de Chicharrón x3' },
  '6af3f15afe40e7bf4ad0c587': { omitir: '"TACOS X 4" está como subproducto de "TACOS X 3" y también como producto aparte; se usa el producto aparte' },
  '6ae8e50199418dc8db016bc7': { omitir: 'Torta del chavo con precio $3.000 (parece error de digitación; la otra vale $30.000)' },
  '6ae8e50199418dc8db016bca': { variante: 'Torta del Chavo' },
  '6af30a5e48065de9dd68c48f': { variante: '1 L' },
  '6af30a5e48065de9dd68c492': { variante: '1.5 L' },
  '6af30b06944593af9b671752': { variante: '400 ml' },
  '6ae8ca71d2a9baa13933f0e1': { variante: 'Brownie', nota: 'En Loggro dice "BROWMI"' },
  '6ae8ca71d2a9baa13933f0cc': { variante: 'Ron con Pasas' },
  '6ae8ca71d2a9baa13933f0cf': { variante: 'Chocolate' },
  '6ae8ca71d2a9baa13933f0d2': { variante: 'Maracuyá' },
  '6ae8ca71d2a9baa13933f0d5': { variante: 'Frutos Rojos' },
  '6ae8ca71d2a9baa13933f0d8': { variante: 'Macadamia' },
  '6ae8ca71d2a9baa13933f0db': { variante: 'Café' },
  '6ae8ca71d2a9baa13933f0de': { variante: 'Vainilla Chips' },
  '6ae8ca71d2a9baa13933f0e4': { variante: 'Fresa' },
};

// Cartas (catálogos multiproducto, máx. 30 productos y 10 secciones cada una) y secciones.
// Se asigna por _id del producto padre; lo que no esté aquí va a la carta de su categoría de Loggro.
const CARTAS = {
  comidas: {
    header: 'Comidas 🌮🍔', marca: MARCA,
    secciones: {
      'Tacos y antojitos 🌮': ['6ae16f49a94719c5d539e2cb', '6ae1013ec47d71e1e6f71948', '6af4edf1b8e6258202b8cfe8', '6ae3b2b8fd5558bc329fba7d', '6ae3a7fdfd5558bc32883224', '6ae3afaaea273597d64f3fd4', '6ae3b216ac2fc19d00801830', '6ae3b0c2ea273597d6522b98', '6ae3ac4dac2fc19d0071edfa'],
      'Salchipapas y burgers 🍔': ['6ae40b44d7b104ae7d0857a9', '6ae40b6f71ab6cef726c044a', '6ae3a9ab4888e19152fdd1dc'],
      'Asados y picadas 🔥': ['6ae40ccd8b592077782e1358', '6ae40bbe8ab1d45d08f707ad'],
    },
  },
  heladeria: {
    header: 'Heladería y Botanas 🍨', marca: MARCA,
    secciones: {
      'Helados 🍦': ['6ae3b88d27548bc4ddfea8fb', '6ae3b8c42f9b13af46c68936', '6ae3b8fdfd5558bc32ad2cd7', '6ae3b9d427548bc4dd01aae6', '6ae3ba9ecf805bbb35fad33e', '6ae3ddeebbbc4287b3e5b40b', '6afa701f9603187f3d464c12', '6b00e7c6ada2be2853f6e41e'],
      'Postres y botanas 🍫': ['6ae3b96b4888e1915220ac71', '6ae3ba264888e19152221d4f', '6ae3ba532f9b13af46cadb03', '6af4eccc815daed5a6171ad9'],
    },
  },
  bebidas: {
    header: 'Bebidas 🍹🥤', marca: MARCA,
    secciones: {
      'Jugos y frappés 🧃': ['6ae405ac8ab1d45d08eaa9c7', '6ae4056558f9b0a66b383d20', '6ae3de664888e191527d9519', '6ae3bb75fa10411a78e18c49', '6ae3ddafbbbc4287b3e4b73e'],
      'Micheladas y sodas 🍺': ['6ae3e057f7e40bd0d3440b8d', '6ae3e1b4595e36ff80a0bc0f', '6ae3e2232133aea23607b914', '6ae3baeb961e16e9ef024e27'],
      'Gaseosas y agua 🥤': ['6ae4b83db62c2d5ffe26aa18', '6b00e26629e2f671ebd4fb0e', '6b00e23829e2f671ebd4845e', '6b00da6f61b4dedd039b3ac0', '6ae171176a9e5dc2f94443e1', '6af674eecb8f3c2e1d4a9fe8'],
    },
  },
};
const CARTA_POR_CATEGORIA = { COMIDAS: 'comidas', 'HELADERIA & BOTANAS': 'heladeria', BEBIDAS: 'bebidas', GASEOSAS: 'bebidas' };

// Nombres de las áreas de preparación de Loggro (waiterOrderArea). Si conoces el nombre real, ponlo aquí.
const NOMBRE_AREA = process.env.AREAS_LOGGRO ? Object.fromEntries(process.env.AREAS_LOGGRO.split(',').map((p) => p.split('='))) : {};

// ---------------------------------------------------------------------------
const titulo = (t) => String(t ?? '').trim().replace(/\s+/g, ' ').toLowerCase().replace(/(^|[\s(/-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase())
  .replace(/\bDe\b/g, 'de').replace(/\bEn\b/g, 'en').replace(/\bAl\b/g, 'al').replace(/\bDel\b/g, 'del').replace(/\bCon\b/g, 'con').replace(/\bY\b/g, 'y').replace(/\bX\s?(\d)/gi, 'x$1');
const precioDe = (p) => Number(p.locationsStock?.[0]?.price ?? p.price) || 0;
const idStock = productos[0]?.locationsStock?.[0]?.locationStock?._id ?? '';

const avisos = [];
const sinFoto = [];
const items = [];      // { id, nombre, precio, grupo, tituloGrupo, variante, imagen, area, padre, descripcion, categoria }
for (const p of productos) {
  if (p.deleted || p.isActive === false || p.isIngredient) continue;
  const c = CORRECCIONES[p._id] ?? {};
  if (c.omitir) { avisos.push(`- \`${p._id}\` **${p.name}**: ${c.omitir}. No va al catálogo.`); continue; }
  const nombrePadre = c.nombre ?? titulo(p.name);
  if (!c.nombre && p.name !== nombrePadre) avisos.push(`- \`${p._id}\` "${p.name}" → se muestra como **${nombrePadre}** (solo mayúsculas/minúsculas).`);
  const area = p.waiterOrderArea ?? p.locationsStock?.[0]?.waiterOrderArea ?? null;
  if (!area) avisos.push(`- \`${p._id}\` **${nombrePadre}**: sin área de preparación (waiterOrderArea) en Loggro.`);
  const subs = (p.subProducts ?? []).filter((s) => s && typeof s === 'object');
  const base = { imagen: p.urlImage ?? '', area, descripcion: String(p.description ?? '').trim().replace(/\s+/g, ' '), categoria: p.category?.name ?? '' };
  if (!subs.length) {
    items.push({ ...base, id: p._id, nombre: nombrePadre, precio: precioDe(p), grupo: null, padre: p._id });
    continue;
  }
  let n = 0;
  for (const s of subs) {
    const cs = CORRECCIONES[s._id] ?? {};
    if (cs.omitir) { avisos.push(`- \`${s._id}\` **${s.name}** (variante de ${nombrePadre}): ${cs.omitir}. No va al catálogo.`); continue; }
    if (cs.nota) avisos.push(`- \`${s._id}\` ${nombrePadre} · **${cs.variante}**: ${cs.nota}`);
    const variante = cs.variante ?? titulo(s.name);
    if (!cs.variante) avisos.push(`- \`${s._id}\` variante "${s.name}" de ${nombrePadre} sin corrección: se muestra como **${variante}** ⚠️ revisar.`);
    // Nombre completo del producto (como aparecerá en el pedido y en Loggro): "Hamburguesa Sencilla",
    // "Picada para 2 personas"… (plantilla nombreVariante del grupo, o nombre propio de la variante).
    const nombre = cs.nombre ?? (c.nombreVariante ? c.nombreVariante.replace('{v}', variante) : /^\d/.test(variante) ? `${nombrePadre} (${variante})` : `${nombrePadre} ${variante}`);
    items.push({ ...base, id: s._id, nombre: nombre.replace(/\s+/g, ' '), precio: Number(s.price) || precioDe(p), grupo: p._id, tituloGrupo: nombrePadre, variante, padre: p._id });
    n += 1;
  }
  if (n === 1) {
    // Un grupo con una sola variante: se vuelve producto suelto con el ID de la variante (es el que cobra Loggro).
    const u = items.at(-1); u.grupo = null; u.tituloGrupo = undefined; u.nombre = nombrePadre; u.variante = undefined;
    avisos.push(`- \`${p._id}\` **${nombrePadre}**: quedó con una sola variante (\`${u.id}\`); se muestra como producto sencillo.`);
  }
}

// Nombres únicos (product_names es NOMBRE → ID).
const vistos = new Map();
for (const it of items) {
  let n = it.nombre, k = 2;
  while (vistos.has(n)) n = `${it.nombre} (${k++})`;
  if (n !== it.nombre) avisos.push(`- Nombre repetido "${it.nombre}": \`${it.id}\` se guarda como **${n}**.`);
  it.nombre = n; vistos.set(n, it.id);
}

// Fotos puestas a mano en Meta (Administrador de ventas) que Loggro no tiene: se conservan las del CSV
// actual (docs/catalogo-meta-bacano.csv, o el que indiques con CATALOGO_META_ACTUAL). Sirve el CSV tal
// como lo guarda Excel (tabulaciones o ";", UTF-8 o Windows-1252).
const fotosManuales = leerFotosCsv(process.env.CATALOGO_META_ACTUAL || new URL('../docs/catalogo-meta-bacano.csv', import.meta.url));
for (const it of items) {
  const manual = fotosManuales.get(it.id);
  if (!it.imagen && manual) {
    it.imagen = manual;
    avisos.push(`- \`${it.id}\` **${it.nombre}**: sin foto en Loggro; se conserva la foto puesta a mano en Meta (${manual.split('/').pop()}).`);
  }
}
for (const padre of [...new Set(items.map((it) => it.padre))]) {
  const delPadre = items.filter((it) => it.padre === padre);
  const sin = delPadre.filter((it) => !it.imagen);
  if (sin.length) sinFoto.push(`- \`${padre}\` **${delPadre[0].tituloGrupo ?? delPadre[0].nombre}**${sin.length < delPadre.length ? ` (${sin.map((x) => x.variante ?? x.nombre).join(', ')})` : ''}`);
}

// Cartas y secciones.
const seccionDe = new Map(); // padre → { carta, seccion }
for (const [carta, c] of Object.entries(CARTAS)) for (const [sec, ids] of Object.entries(c.secciones)) for (const id of ids) seccionDe.set(id, { carta, seccion: sec });
const cartas = Object.fromEntries(Object.entries(CARTAS).map(([k, c]) => [k, { header: c.header, marca: c.marca, sections: Object.keys(c.secciones).map((t) => ({ title: t, productos: [] })) }]));
for (const it of items) {
  let d = seccionDe.get(it.padre);
  if (!d) {
    const carta = CARTA_POR_CATEGORIA[it.categoria.toUpperCase()] ?? 'comidas';
    d = { carta, seccion: 'Otros' };
    avisos.push(`- \`${it.padre}\` **${it.tituloGrupo ?? it.nombre}** no está asignado a una carta en scripts/generar-catalogo.mjs (CARTAS): va a "${cartas[carta].header}" → Otros.`);
    if (!cartas[carta].sections.some((s) => s.title === 'Otros')) cartas[carta].sections.push({ title: 'Otros', productos: [] });
  }
  cartas[d.carta].sections.find((s) => s.title === d.seccion).productos.push(it.nombre);
  it.seccion = `${d.carta}|${d.seccion}`;
}
// Sin área de preparación en Loggro: se usa la de los demás productos de su sección (si todos la comparten
// o es la más común), para que la comanda llegue a la cocina o la barra correcta.
for (const it of items) {
  if (it.area) continue;
  const cuenta = new Map();
  for (const o of items) if (o.area && o.seccion === it.seccion) cuenta.set(o.area, (cuenta.get(o.area) ?? 0) + 1);
  const [area] = [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  if (area) { it.area = area; avisos.push(`- \`${it.id}\` **${it.nombre}**: se le asignó el área de su sección (\`${area}\`) en la comanda de Loggro. Ponle el área en Loggro para confirmarla.`); }
}
// Dentro de cada sección, el orden de la tabla CARTAS (tacos primero, luego quesabirria…), no el alfabético de Loggro.
const orden = new Map([...seccionDe.keys()].map((id, i) => [id, i]));
const padreDe = new Map(items.map((it) => [it.nombre, it.padre]));
for (const c of Object.values(cartas)) for (const s of c.sections) s.productos.sort((x, y) => (orden.get(padreDe.get(x)) ?? 999) - (orden.get(padreDe.get(y)) ?? 999));

// ---------------------------------------------------------------------------
//  src/data/catalogo.js
// ---------------------------------------------------------------------------
const J = (o) => JSON.stringify(o);
const areas = new Map();
for (const it of items) if (it.area) { if (!areas.has(it.area)) areas.set(it.area, []); areas.get(it.area).push(it.nombre); }
const grupos = [...new Set(items.filter((i) => i.grupo).map((i) => i.grupo))];
const L = [];
L.push(`/**
 * Productos de ${MARCA}. GENERADO por scripts/generar-catalogo.mjs a partir de la consulta
 * de productos de Loggro (GET https://api.pirpos.com/products). No editar a mano:
 * corrige en Loggro o en la tabla CORRECCIONES del script y vuelve a correr \`npm run catalogo\`.
 *
 * Los IDs son los _id de Loggro: el mismo valor va como "ID de contenido" (retailer_id)
 * de cada producto en el Administrador de ventas de Meta, y es el que se manda a Loggro
 * al registrar el pedido. Los productos con variantes (sabores, tamaños) usan el ID del
 * subproducto, que es el que tiene precio propio en Loggro.
 *
 * product_names: NOMBRE → ID. nombrePorId: ID → NOMBRE (se arma sola).
 */

export const product_names = {`);
let cat = null;
for (const it of items) { if (it.categoria !== cat) { cat = it.categoria; L.push(`  // ${cat}`); } L.push(`  ${J(it.nombre)}: ${J(it.id)},`); }
L.push('};', '', 'export const nombrePorId = Object.fromEntries(Object.entries(product_names).map(([nombre, id]) => [id, nombre]));', '',
  '// Precios de referencia de Loggro (el precio que ve el cliente es el del catálogo de Meta).', 'export const precios = {');
for (const it of items) L.push(`  ${J(it.nombre)}: ${it.precio},`);
L.push('};', '', '// Fotos de Loggro (urlImage). Las variantes usan la foto del producto padre.', 'export const imagenPorId = {');
for (const it of items) if (it.imagen) L.push(`  ${J(it.id)}: ${J(it.imagen)},`);
L.push('};', '', '// Cartas: cada una es un mensaje product_list (máx. 30 productos, 10 secciones). Con VARIANTES_META', '// va una tarjeta por grupo y el cliente elige la variante dentro del producto.', 'export const CATALOGOS = {');
for (const [k, c] of Object.entries(cartas)) {
  L.push(`  ${k}: {`, `    header: ${J(c.header)},`, `    marca: ${J(c.marca)},`, '    sections: [');
  for (const s of c.sections) { L.push(`      { title: ${J(s.title)}, productos: [`); for (const n of s.productos) L.push(`        ${J(n)},`); L.push('      ] },'); }
  L.push('    ],', '  },');
}
L.push('};', '', `// Bodega (locationStock) de Loggro donde se descuenta el pedido.`, `export const LOGGRO_LOCATION_STOCK = ${J(idStock)};`, '',
  '// Áreas de preparación de Loggro (waiterOrderArea) → productos. Salen del JSON de Loggro.', 'export const AREAS_LOGGRO = {');
for (const [a, nombres] of areas) { L.push(`  // ${NOMBRE_AREA[a] ?? 'área ' + a.slice(-6)}`, `  ${J(a)}: [`); for (const n of nombres) L.push(`    ${J(n)},`); L.push('  ],'); }
L.push('};', 'export const areaPorId = Object.fromEntries(', '  Object.entries(AREAS_LOGGRO).flatMap(([area, nombres]) => nombres.map((n) => [product_names[n], area]))', ');', '',
  '// Variantes: ID de la variante → grupo (item_group_id en Meta = _id del producto padre en Loggro).', 'export const grupoPorId = {');
for (const it of items) if (it.grupo) L.push(`  ${J(it.id)}: ${J(it.grupo)},`);
L.push('};', '', '// Grupo → título que comparten todas sus variantes en Meta.', 'export const tituloGrupo = {');
for (const g of grupos) L.push(`  ${J(g)}: ${J(items.find((i) => i.grupo === g).tituloGrupo)},`);
L.push('};', '', '// ID de la variante → valor de la variante (campo "size" en Meta).', 'export const variantePorId = {');
for (const it of items) if (it.grupo) L.push(`  ${J(it.id)}: ${J(it.variante)},`);
L.push('};', '');
mkdirSync(new URL('../src/data/', import.meta.url), { recursive: true });
writeFileSync(new URL('../src/data/catalogo.js', import.meta.url), L.join('\n'));

// ---------------------------------------------------------------------------
//  CSVs y docs
// ---------------------------------------------------------------------------
mkdirSync(new URL('../docs/', import.meta.url), { recursive: true });
const celda = (v) => (/[;"\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ''));
const csv = (cab, filas) => '﻿' + [cab, ...filas].map((f) => f.map(celda).join(';')).join('\r\n') + '\r\n';

const cabMeta = ['id', 'title', 'description', 'availability', 'condition', 'price', 'link', 'image_link', 'brand', 'google_product_category', 'item_group_id', 'size', 'additional_variant_attribute'];
const filasMeta = items.map((it) => [it.id, it.grupo ? it.tituloGrupo : it.nombre, it.descripcion || (it.grupo ? `${it.tituloGrupo} · ${it.variante}` : it.nombre), 'in stock', 'new', `${it.precio} COP`, LINK, it.imagen, MARCA, 'Food, Beverages & Tobacco', it.grupo ?? '', it.grupo ? it.variante : '', '']);
writeFileSync(new URL('../docs/catalogo-meta-bacano.csv', import.meta.url), csv(cabMeta, filasMeta));

const filasCrm = items.map((it) => { const sec = seccionDe.get(it.padre); return [it.id, it.nombre, it.precio, [it.tituloGrupo, sec?.seccion, it.categoria].filter(Boolean).join(' · ')]; });
writeFileSync(new URL('../docs/productos-crm-bacano.csv', import.meta.url), csv(['id', 'nombre', 'precio', 'categoria'], filasCrm));

const md = [`# Cartas de BacanoBot`, '', `Generado de \`src/data/catalogo.js\` (${items.length} productos, ${grupos.length} grupos de variantes). Precios de referencia de Loggro; el precio que ve el cliente es el del catálogo de Meta.`, 'Cada carta es un mensaje *product_list* (máx. 30 productos). ID = _id de Loggro = ID de contenido en Meta.', ''];
for (const [k, c] of Object.entries(cartas)) {
  const total = c.sections.reduce((n, s) => n + s.productos.length, 0);
  const tiles = new Set(c.sections.flatMap((s) => s.productos.map((n) => { const it = items.find((i) => i.nombre === n); return it.grupo ?? it.id; }))).size;
  md.push(`## ${c.header} · \`${k}\` (${tiles} tarjetas con variantes · ${total} productos sin agrupar)`, '', '| Sección | Producto | Variante | Precio | ID |', '|---|---|---|---:|---|');
  for (const s of c.sections) for (const n of s.productos) { const it = items.find((i) => i.nombre === n); md.push(`| ${s.title} | ${it.tituloGrupo ?? it.nombre} | ${it.variante ?? ''} | $${it.precio.toLocaleString('es-CO')} | \`${it.id}\` |`); }
  md.push('');
}
writeFileSync(new URL('../docs/CATALOGOS.md', import.meta.url), md.join('\n'));

const rev = [`# Revisar en Loggro (generado por scripts/generar-catalogo.mjs)`, '',
  `Fuente: ${entrada.split('/').pop()} · ${productos.length} productos en Loggro → ${items.length} productos en el catálogo del bot (${grupos.length} grupos de variantes).`, '',
  '## Sin foto en Loggro (' + sinFoto.length + ')', 'WhatsApp no muestra productos sin foto y Meta rechaza un carrusel que los incluya (#131009). Súbeles foto en Loggro (o en el Administrador de ventas de Meta) y vuelve a correr `npm run catalogo`.', '', ...sinFoto, '',
  '## Nombres, duplicados y dudas (' + avisos.length + ')', ...avisos, ''];
writeFileSync(new URL('../docs/REVISAR-LOGGRO.md', import.meta.url), rev.join('\n'));

console.log(`✔ ${items.length} productos (${grupos.length} grupos de variantes) → src/data/catalogo.js`);
console.log(`✔ docs/catalogo-meta-bacano.csv (para Meta) · docs/productos-crm-bacano.csv (para el CRM) · docs/CATALOGOS.md`);
console.log(`⚠ ${sinFoto.length} productos sin foto y ${avisos.length} avisos → docs/REVISAR-LOGGRO.md`);

/** Lee id → image_link de un CSV de Meta (";" / tabulación / ","; UTF-8 o Windows-1252). */
function leerFotosCsv(ruta) {
  const mapa = new Map();
  try {
    if (!existsSync(ruta)) return mapa;
    const buf = readFileSync(ruta);
    let texto = buf.toString('utf8');
    if (texto.includes('\uFFFD')) texto = buf.toString('latin1'); // Excel en Windows guarda en Windows-1252
    texto = texto.replace(/^\uFEFF/, '');
    const lineas = texto.split(/\r?\n/).filter((l) => l.trim());
    const cab = lineas[0] ?? '';
    const sep = ['\t', ';', ','].sort((a, b) => cab.split(b).length - cab.split(a).length)[0];
    const cols = cab.split(sep).map((c) => c.replace(/^"|"$/g, '').trim());
    const iId = cols.indexOf('id');
    const iImg = cols.indexOf('image_link');
    if (iId < 0 || iImg < 0) return mapa;
    for (const l of lineas.slice(1)) {
      const c = l.split(sep).map((x) => x.replace(/^"|"$/g, '').trim());
      if (c[iId] && /^https?:\/\/\S+\.(jpe?g|png)$/i.test(c[iImg] ?? '')) mapa.set(c[iId], c[iImg]);
    }
  } catch (e) { console.warn('No se pudo leer el CSV actual de Meta:', e.message); }
  return mapa;
}
