/**
 * Palabras clave "menú" y "carta" (v1.2, igual que BlackStationBot v3.10).
 *
 *   "carta" (carta, Carta, CARTA, cartas) → la carta en PDF (CARTA_URL). Sin PDF: la carta del catálogo
 *       que nombre ("la carta de bebidas" → Bebidas) o la lista de cartas.
 *   "menú" sin "carta":
 *       con un tema → "el menú de los tacos" → carrusel solo de tacos (si alguno no tiene foto, la
 *                     lista de productos de su carta); "el menú de bebidas" → la carta de Bebidas;
 *       sin tema    → "quiero el menú", "el menú completo" → catálogo de WhatsApp (CATALOG_TEMPLATE)
 *                     o la lista de cartas;
 *       en la web   → "el menú en la página web", "el link del menú" → MENU_WEB_URL (si existe).
 * (Antes "menú" CON TILDE no se reconocía: /\bmen[uú]\b/ no ve el final de palabra después de la "ú".)
 */
import { normalizar } from './conversacion.js';

const limpio = (t) => normalizar(t).replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim();

/** ¿Dijo "carta"? */
export const pideCarta = (texto) => /\bcartas?\b/.test(limpio(texto));

/** ¿Dijo "menú"? */
export const pideMenu = (texto) => /\bmenus?\b/.test(limpio(texto));

/** ¿Lo quiere en internet? */
export const pideWeb = (texto) => /\b(pagina|paginas|web|internet|google|navegador|chrome|safari|link|links|enlace|url|digital|en linea|online|sitio)\b/.test(limpio(texto));

// Palabras que acompañan a "menú" sin decir de qué: "regálame el menú xf completo".
const RELLENO = new Set(`menu menus carta cartas completo completa completos todo toda todos todas general entero entera ver verlo verla mirar conocer revisar
quiero quiere quisiera queremos deseo deseamos necesito me te le nos les regalas regalame regala regalan regalen muestrame muestreme muestranos mostrar muestra muestras
enviame envia envian enviar envialo manda mandame mandas mandan pasame pasa pasas dame das da puedes podrias puede pueden podrian seria
el la lo los las de del al a en con por para su sus tu tus mi un una unos unas y o que cual cuales como donde
favor porfa porfavor xfa xf pf plis please gracias hola buenas buenos noches tardes dias buen dia saludos
hoy actual ahora ya aqui alla ustedes tienen tienes hay manejan precios precio valores
oye mira listo ok bueno si vale amigo amiga senor senora joven don dona disponible disponibles actualizado nuevo bacano`.split(/\s+/));

/** Lo que queda del mensaje sin "menú" ni palabras de relleno ("el menú de los tacos" → "tacos"). */
export function temaDelMenu(texto) {
  return limpio(texto).split(' ').filter((w) => w && !RELLENO.has(w)).join(' ');
}
