/**
 * Lectura de los datos que llegan del Flow de pedido, en un solo lugar.
 * flow.js y messageHandler.js usan estas funciones para que el resumen del Flow,
 * el aviso al negocio, Google Sheets y Loggro digan siempre lo mismo.
 */
import negocio from '../config/negocio.js';

const norm = (v) => String(v ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

// ---------------------------------------------------------------------------
//  Pedido: domicilio o recoger en el restaurante
// ---------------------------------------------------------------------------

/**
 * ¿El cliente pidió a domicilio?
 * El Flow de pedido manda "address" (RadioButtons "Tu pedido es para:") con el id
 * "domicilio" o "restaurante". Si algún día vuelve a llegar una dirección escrita
 * (Flow viejo), también cuenta como domicilio.
 */
export function esDomicilio(datos) {
  const v = norm(datos?.address ?? datos?.paradonde);
  if (!v || v === 'restaurante') return false;
  return true; // "domicilio" o una dirección escrita
}

/** Valor del domicilio que se suma al total (0 si recoge en el restaurante). */
export const valorDomicilio = (datos) => (esDomicilio(datos) ? Number(negocio.domicilio) || 0 : 0);

/** Texto para el aviso al negocio, Sheets y Loggro: "Domicilio" o "Recoger en el restaurante". */
export function entregaTexto(datos) {
  if (!esDomicilio(datos)) return 'Recoger en el restaurante';
  const v = String(datos?.address ?? '').trim();
  // Si el Flow trae una dirección escrita (campo "direccion" o el address viejo), se muestra.
  const direccion = datos?.direccion || (norm(v) !== 'domicilio' ? v : '');
  return direccion ? `Domicilio: ${direccion}` : 'Domicilio';
}
