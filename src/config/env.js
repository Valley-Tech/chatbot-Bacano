import dotenv from 'dotenv';
import crypto from 'node:crypto';

dotenv.config();

/**
 * Normaliza una clave PEM leída de una variable de entorno.
 *
 * Al pegar la clave en el .env o en Railway se suelen perder los saltos de
 * línea (quedan como "\n" literales) o se cuelan las comillas. OpenSSL 3
 * entonces responde `DECODER routines::unsupported`, que no dice nada útil.
 * Aquí se arregla antes de usarla, igual que ya se hace con la clave de Google.
 */
function normalizarPem(valor) {
  let pem = String(valor ?? '').trim();
  if ((pem.startsWith('"') && pem.endsWith('"')) || (pem.startsWith("'") && pem.endsWith("'"))) {
    pem = pem.slice(1, -1);
  }
  pem = pem.replace(/\\r/g, '').replace(/\\n/g, '\n').replace(/\r/g, '');
  return pem ? `${pem.trim()}\n` : '';
}

const PRIVATE_KEY = normalizarPem(process.env.PRIVATE_KEY);

// Aviso al arrancar: mejor enterarse aquí que cuando Meta llame al endpoint.
if (PRIVATE_KEY) {
  try {
    crypto.createPrivateKey({ key: PRIVATE_KEY, passphrase: process.env.PASSPHRASE });
    console.log('[flows] clave privada cargada correctamente ✅');
  } catch (error) {
    const codigo = error.code || error.message;
    console.error(`[flows] ❌ no se pudo leer la clave privada: ${codigo}`);
    if (codigo === 'ERR_OSSL_BAD_DECRYPT') {
      console.error('        La PASSPHRASE no coincide con la que usaste al crear private.pem.');
    } else {
      console.error('        Revisa PRIVATE_KEY: debe empezar por "-----BEGIN" y conservar los saltos de línea.');
    }
  }
} else {
  console.warn('[flows] PRIVATE_KEY vacío: el endpoint /flow no podrá descifrar.');
}

export default {
  WEBHOOK_VERIFY_TOKEN: process.env.WEBHOOK_VERIFY_TOKEN,
  API_TOKEN: process.env.API_TOKEN,
  BUSINESS_PHONE: process.env.BUSINESS_PHONE,
  API_VERSION: process.env.API_VERSION,
  PORT: process.env.PORT || 3000,
  BASE_URL: process.env.BASE_URL,
  PRIVATE_KEY,
  APP_SECRET: process.env.APP_SECRET,
  PASSPHRASE: process.env.PASSPHRASE,
  NODE_TLS_REJECT_UNAUTHORIZED : process.env.NODE_TLS_REJECT_UNAUTHORIZED,
  LOGGRO_API_KEY : process.env.LOGGRO_API_KEY,
  SPREADSHEETID_PEDIDO: process.env.SPREADSHEETID_PEDIDO,       // hoja de Google Sheets donde se registran los pedidos
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
  AWS_REGION: process.env.AWS_REGION,
  AWS_BUCKET_NAME: process.env.AWS_BUCKET_NAME,

  // ---- BacanoBot ----------------------------------------------------------
  CATALOG_ID: process.env.CATALOG_ID,                         // catálogo del Administrador de ventas de Meta
  CATALOG_TEMPLATE: process.env.CATALOG_TEMPLATE,             // plantilla con botón CATALOG (opcional)
  CATALOG_TEMPLATE_LANG: process.env.CATALOG_TEMPLATE_LANG || 'es_CO',
  // Activo por defecto: el catálogo de Meta tiene las variantes agrupadas (item_group_id), así
  // que cada carta muestra UNA tarjeta por grupo ("Hamburguesas", "Tacos x3") y el cliente elige
  // la variante dentro del producto. VARIANTES_META=false vuelve a mostrar cada variante.
  VARIANTES_META: !/^(0|false|no)$/i.test(process.env.VARIANTES_META || 'true'),
  FLOW_ID_PEDIDO: process.env.FLOW_ID_PEDIDO,                 // Flow de datos de entrega y pago (lo creas tú en Meta)
  NOTIFY_NUMBERS: (process.env.NOTIFY_NUMBERS || '').split(',').map((n) => n.replace(/\D/g, '')).filter(Boolean),
  DOMICILIO_VALOR: Number(process.env.DOMICILIO_VALOR ?? 3000),
  HORA_APERTURA: process.env.HORA_APERTURA || '17:00',           // turno: 5:00 p. m.
  HORA_CIERRE: process.env.HORA_CIERRE || '23:00',               // a 11:00 p. m.
  // v1.1: memoria del turno. MEMORIA_IA=false → la IA usa solo el historial del CRM (como antes).
  MEMORIA_IA: !/^(0|false|no)$/i.test(process.env.MEMORIA_IA || 'true'),
  // v1.1: abrir el Flow de pedido con los datos que el cliente ya dio (nombre, teléfono, entrega, pago).
  // Actívalo SOLO después de publicar el Flow con "init-values" (docs/FLOW-PEDIDO-PRECARGADO.md).
  FLOW_PRECARGA: /^(1|true|si|yes)$/i.test(process.env.FLOW_PRECARGA || 'false'),
  // v1.2: la IA recibe la fecha y hora de Colombia y si el restaurante está abierto o cerrado.
  HORA_EN_IA: !/^(0|false|no)$/i.test(process.env.HORA_EN_IA || 'true'),
  // v1.2: menú en una página web (solo se envía si el cliente lo pide: "el menú en la página web").
  MENU_WEB_URL: process.env.MENU_WEB_URL || '',
  // Seguimiento del pedido sin terminar y adicionales (igual que BlackStation v3.5)
  RECORDATORIO_PEDIDO_MIN: Number(process.env.RECORDATORIO_PEDIDO_MIN) || 5, // cada cuántos minutos se recuerda
  RECORDATORIO_PEDIDO_MAX: Number(process.env.RECORDATORIO_PEDIDO_MAX ?? 2),  // cuántas veces como máximo (0 = nunca)
  ADICIONAL_MINUTOS: Number(process.env.ADICIONAL_MINUTOS) || 60,           // ventana para sumar un adicional a un pedido enviado
  // Carrusel de productos (2 a 10 tarjetas). TARJETAS_CARRUSEL=false → lista de productos con carrito.
  TARJETAS_CARRUSEL: !/^(0|false|no)$/i.test(process.env.TARJETAS_CARRUSEL || 'true'),
  // Carrusel y tarjeta solo con productos que tienen foto válida en Meta (docs/catalogo-meta-bacano.csv).
  SOLO_CON_FOTO: !/^(0|false|no)$/i.test(process.env.SOLO_CON_FOTO || 'true'),
  // v1.2: apagado por defecto. La fuente de verdad es el CSV de Meta (docs/catalogo-meta-bacano.csv);
  // la revisión en línea daba falsos "sin foto" con las fotos de Loggro. VERIFICAR_FOTOS=true la vuelve a activar.
  VERIFICAR_FOTOS: /^(1|true|si|yes)$/i.test(process.env.VERIFICAR_FOTOS || 'false'),
  // Números a los que el bot NO responde (p. ej. el personal del restaurante que escribe a la línea).
  NO_RESPONDER_A: (process.env.NO_RESPONDER_A || '').split(',').map((n) => n.replace(/\D/g, '')).filter(Boolean),
  LOGGRO_TABLE_ID: process.env.LOGGRO_TABLE_ID,               // mesa "Domicilios/WhatsApp" en Loggro
  LOGGRO_LOCATION_STOCK: process.env.LOGGRO_LOCATION_STOCK,   // bodega; si está vacía se usa la del JSON (src/data/catalogo.js)
  LOGGRO_DOMICILIO_PRODUCT_ID: process.env.LOGGRO_DOMICILIO_PRODUCT_ID, // producto "Domicilio" en Loggro (opcional)
};
