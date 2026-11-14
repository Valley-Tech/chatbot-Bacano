/**
 * Datos de Bacano que usa el chatbot. Lo marcado con ⚠️ hay que confirmarlo con el
 * restaurante antes de salir a producción (o ponerlo en las variables de Railway).
 */
import config from './env.js';

export default {
  nombre: 'Bacano',
  bienvenida: '*Bacano* 🌮🍔🍨',
  descripcion: 'Comida mexicana, salchipapas, heladería y bebidas',

  // Horario de atención del chatbot para pedidos (hora Colombia): 5:00 p. m. a 11:00 p. m.
  horario: { apertura: config.HORA_APERTURA, cierre: config.HORA_CIERRE },
  horarioTexto: () => `todos los días de *${fmtHora(config.HORA_APERTURA)}* a *${fmtHora(config.HORA_CIERRE)}*`,

  // Valor del domicilio que se suma al pedido cuando el cliente elige "domicilio" en el Flow.
  domicilio: config.DOMICILIO_VALOR,

  // Números que reciben el aviso de cada pedido (plantillas). Variable NOTIFY_NUMBERS.
  numerosOficiales: config.NOTIFY_NUMBERS,

  // Cuentas para transferencia. ⚠️ completar con las del restaurante (variable CUENTAS_BANCARIAS o aquí).
  cuentasBancarias: process.env.CUENTAS_BANCARIAS?.replace(/\\n/g, '\n') || '🏦 Cuentas bancarias:\n\n*Nequi:* ⚠️ pendiente\n*Bancolombia:* ⚠️ pendiente',

  // Ubicación. ⚠️ confirmar dirección; las coordenadas van en Railway (UBICACION_LAT y UBICACION_LNG):
  // Google Maps → clic derecho sobre el local → clic en los números (se copian "lat, lng").
  // Sin coordenadas se manda la dirección con el enlace de Google Maps.
  ubicacion: {
    latitude: numeroONull(process.env.UBICACION_LAT),
    longitude: numeroONull(process.env.UBICACION_LNG),
    name: process.env.UBICACION_NOMBRE || 'Bacano',
    address: process.env.UBICACION_DIRECCION || '⚠️ Dirección pendiente',
  },

  // Carta en PDF o imagen (URL pública, p. ej. en S3). Si está vacía, "carta" muestra las cartas del catálogo.
  carta: { url: process.env.CARTA_URL || '', filename: 'Carta-Bacano.pdf', caption: '🌮 Carta Bacano' },

  // Imagen del encabezado de las plantillas de aviso al negocio (URL pública).
  imagenPedido: process.env.IMAGEN_PEDIDO_URL || 'https://micarta.s3.us-east-1.amazonaws.com/Copia+de+Reserva+tu+mesa.jpg',

  // Tarjeta de contacto (escribir "asesor"). ⚠️ número del restaurante (variable CONTACTO_TELEFONO).
  contacto: {
    name: { formatted_name: 'Bacano', first_name: 'Bacano', last_name: '' },
    org: { company: 'Bacano', department: 'Atención al Cliente', title: 'Domicilios' },
    phones: (process.env.CONTACTO_TELEFONO || config.NOTIFY_NUMBERS[0] || '').split(',').map((n) => n.replace(/\D/g, '')).filter(Boolean)
      .map((n) => ({ phone: `+${n}`, wa_id: n, type: 'WORK' })),
  },
};

function numeroONull(v) {
  const n = Number(String(v ?? '').trim().replace(',', '.'));
  return String(v ?? '').trim() && Number.isFinite(n) ? n : null;
}

function fmtHora(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  const ampm = h >= 12 ? 'p.m.' : 'a.m.';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m || 0).padStart(2, '0')} ${ampm}`;
}
