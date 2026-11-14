import whatsappService from './whatsappService.js';
import appendToSheet from './googleSheetsService.js';
import geminiService, { AI_UNAVAILABLE } from './geminiService.js';
import { enviarPedidoALoggro } from './loggroService.js';
import { logAxiosError } from './printDetailError.js';
import { reportarFalla } from './reportarFallas.js';
import { esDomicilio, valorDomicilio, entregaTexto } from './datosFlow.js';
import { downloadImageFromMeta } from './httpRequest/sendToWhatsApp.js';
import { uploadToPublicStorage } from './awsS3Service.js';
import { sesion, tokenFlow, nuevoPedido, obtenerSesion } from './sesiones.js';
import { separarSaludo, esCortesia, esCancelar, esPreguntaGeneral, turnoActual, dentroDeHorario, esPeticionDeProducto } from './conversacion.js';
import { buscarPlatos, enviarTarjetas, hablaDePlatos, textoSinFoto } from './busquedaPlatos.js';
import { product_names, CATALOGOS, areaPorId, grupoPorId, precios, nombrePorId, LOGGRO_LOCATION_STOCK } from '../data/catalogo.js';
import config from '../config/env.js';
import negocio from '../config/negocio.js';

/**
 * BacanoBot · Bacano (comida mexicana, salchipapas, heladería y bebidas).
 *
 * Misma lógica de SamuelitoBot y BlackStationBot (v3.6):
 *  · Saludo → bienvenida UNA vez por turno (HORA_APERTURA → HORA_CIERRE) + botón Pedir.
 *  · "quiero 2 tacos", "¿qué hamburguesas tienen?" → búsqueda con la IA del CRM → tarjeta
 *    (1 producto) o carrusel (2 a 10) con productos del catálogo de Meta.
 *  · "Pedir" → menú con las 3 cartas (Comidas, Heladería y botanas, Bebidas); cada carta es
 *    un catálogo multiproducto con UNA tarjeta por grupo de variantes (el sabor o el tamaño
 *    se elige dentro del producto).
 *  · Carrito → "¿Está todo bien?" (Confirmar / Agregar más / Cambiar) → Flow de datos de
 *    entrega y pago → Efectivo o Transferencia (comprobante) → aviso a los números del
 *    negocio (plantilla), Google Sheets y comanda en Loggro. Recordatorios y adicionales.
 *  · Estado por cliente (sesiones.js); cada Flow lleva un flow_token con el número.
 */

// Plantillas de aviso al negocio (créalas en la WABA de Bacano con las mismas 6 variables
// que las de Samuelito/La Estación: nombre, celular, entrega, pedido, medio de pago, total).
const PLANTILLA_PEDIDO = process.env.PLANTILLA_PEDIDO || 'nuevo_pedido';
const PLANTILLA_COMPROBANTE = process.env.PLANTILLA_COMPROBANTE || 'comprobante_pago';

function isWithinBusinessHours() {
  // Hora de Colombia; soporta horarios que pasan la medianoche. Ver conversacion.js.
  return dentroDeHorario();
}

const cop = (n) => `$${Number(n || 0).toLocaleString('es-CO')}`;

// Botones del paso "confirmar pedido" (máx. 20 caracteres por botón).
const BOTONES_CONFIRMAR = [
  { type: 'reply', reply: { id: 'ped_ok', title: 'Confirmar pedido ✅' } },
  { type: 'reply', reply: { id: 'ped_mas', title: 'Agregar más ➕' } },
  { type: 'reply', reply: { id: 'ped_cambiar', title: 'Cambiar pedido ✏️' } },
];

// Recordatorios del pedido pendiente (un temporizador por cliente).
const temporizadores = new Map();

/** Texto sin tildes y en minúsculas, para comparar palabras. */
const normalizar = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

const paymentRowMap = {};         // número → fecha y hora de la fila del pedido en Sheets
const userOrderDataMap = {};      // número → datos del pedido (para avisos y comprobante)

// Cartas por palabra clave ("quiero ver las bebidas", "tienen helados"…).
const PALABRAS_CARTA = [
  [/\b(bebidas?|jugos?|frapp?es?|smoothies?|micheladas?|sodas?|gaseosas?|coca ?cola|aguas?|raspados?|ginger)\b/, 'bebidas'],
  [/\b(helados?|heladeria|postres?|brownie|banana split|chamoyada|helamoyado|malteadas?|nevados?|botanas?|gomitas?|copa)\b/, 'heladeria'],
  [/\b(comidas?|tacos?|burritos?|quesabirrias?|birria|birriamen|nachos|dorilocos?|tortas?|salchipapas?|hamburguesas?|burgers?|asados?|picadas?|carne asada|pechugas?|punta gorda|lomo|mexican[ao]s?)\b/, 'comidas'],
];

class MessageHandler {

  constructor() {
    this.assistandState = {};
  }

  async handleIncomingMessage(message, senderInfo, screen, datosPedido, pedidoStr) {
    try {
      const from = message.from;
      this.tocarSeguimiento(from);
      // Botones del pedido (confirmar, agregar, adicional…) y respuestas del Flow: a cualquier hora,
      // para no dejar a medias un pedido que empezó antes del cierre.
      const boton = message?.interactive?.button_reply?.id ?? message?.interactive?.list_reply?.id;
      if (!isWithinBusinessHours() && message?.type === 'interactive') {
        if (message.interactive.type === 'nfm_reply') {
          await this.respFlow(from, screen, datosPedido, pedidoStr);
          await whatsappService.markAsRead(message.id);
          return;
        }
        if (/^(ped_|cart_|ad_)/.test(boton ?? '')) return this.handleMenuOption(from, boton);
      }
      if (isWithinBusinessHours()) {
        if (message?.type === 'text') {
          // Saludo una vez por turno, cortesías, búsqueda de platos con IA y seguimiento del pedido.
          await this.atenderTexto(from, message, senderInfo);

        } else if (message?.type === 'interactive') {
          if (message?.interactive.type === 'nfm_reply') {
            await this.respFlow(from, screen, datosPedido, pedidoStr);
            await whatsappService.markAsRead(message.id);
          }
          else {
            // Botones (button_reply) y listas (list_reply: menú de cartas).
            await this.handleMenuOption(from, boton);
            await whatsappService.markAsRead(message.id);
          }
        } else if (message?.type === 'image' && sesion(from).esperandoComprobante) {
          await this.recibirComprobante(message);
        }
      } else {
        // Pedido de las últimas 3 h ("¿se demora?" después del cierre): lo atiende la IA, no el aviso de horario.
        const pedido = obtenerSesion(from)?.pedido;
        if (message?.type === 'text' && pedido?.enviadoAt && Date.now() - pedido.enviadoAt < 3 * 3600 * 1000) {
          await this.handleAssistandFlow(from, message.text.body, { botones: false });
          await whatsappService.markAsRead(message.id);
          return;
        }
        const incomingMessage = message?.type === 'text' ? message.text.body.toLowerCase().trim() : '';
        if (message?.type === 'text' && this.isQuestion(incomingMessage)) {
          this.assistandState[from] = { step: 'question' };
          await this.handleAssistand(from, incomingMessage);
        } else if (message?.type === 'text' && incomingMessage === 'ayuda') {
          await this.helpMenu(from);
        } else if (message?.type === 'text' && incomingMessage === 'carta') {
          await this.sendMedia(from);
        } else if (message?.type === 'text' && (incomingMessage.includes('menu') || incomingMessage.includes('menú'))) {
          await this.catalogo(from);
        } else if (message?.type === 'text' && (incomingMessage === 'ubicacion' || incomingMessage === 'ubicación')) {
          await this.sendLocation(from);
        } else if (message?.type === 'text' && incomingMessage === 'asesor') {
          await this.sendContact(from);
        } else if (message?.type === 'image' && sesion(from).esperandoComprobante) {
          await this.recibirComprobante(message);
        } else {
          const s = sesion(from);
          if (s.avisoCerradoAt && Date.now() - s.avisoCerradoAt < 2 * 3600 * 1000) {
            // Ya le dijimos que estamos cerrados: respuesta corta en vez de repetir todo.
            await whatsappService.sendMessage(from, `🌙 Ahora estamos cerrados. Te atendemos ${negocio.horarioTexto()} 😊`);
            return;
          }
          s.avisoCerradoAt = Date.now();
          const name = this.firstName(senderInfo);
          const msg = `¡Hola ${name}! 😊\nNuestro horario de atención es ${negocio.horarioTexto()}\nSi quieres conocer la carta escribe *menú*, o si prefieres hablar con la IA🤖 haz tu pregunta con el signo ❓\n\n¡Gracias por escribirnos! 😊`;
          await whatsappService.sendMessage(from, msg, message.id);
          return;
        }
      }
    } catch (error) {
      logAxiosError('Error', error);
      throw error;
    }
  }

  /** Saludo por PALABRAS (no por pedazos de texto: "hi" está dentro de "chicharrón"). */
  isGreeting(message) {
    const t = normalizar(message);
    return /^(hola|holi|hello|hi|hl|buenas|buen dia|buenos dias|buenas tardes|buenas noches|saludos|que mas|como estas)\b/.test(t)
      || /\b(hola|buenas tardes|buenas noches|buenos dias)\b/.test(t) && t.split(/\s+/).length <= 4;
  }

  isOrder(message) {
    const lower = message.toLowerCase();
    return (
      lower.includes('pedir') ||
      lower.includes('pedido') ||
      lower.includes('orden') ||
      lower.includes('comprar') ||
      lower.includes('domicilio')
    );
  }

  isQuestion(message) {
    const lower = message.toLowerCase();
    return (
      lower.includes('que') ||
      lower.includes('qué') ||
      lower.includes('quien') ||
      lower.includes('quién') ||
      lower.includes('cual') ||
      lower.includes('cuál') ||
      lower.includes('cuando') ||
      lower.includes('cuándo') ||
      lower.includes('porque') ||
      lower.includes('por que') ||
      lower.includes('porqué') ||
      lower.includes('por qué') ||
      lower.includes('para que') ||
      lower.includes('para qué') ||
      lower.includes('donde') ||
      lower.includes('dónde') ||
      lower.includes('como') ||
      lower.includes('cómo') ||
      lower.includes('cuanto') ||
      lower.includes('cuánto') ||
      lower.includes('pregunta') ||
      lower.includes('¿') ||
      lower.includes('?')
    );
  }

  /** Carta que corresponde a lo que escribió el cliente (o null). */
  cartaPorTexto(message) {
    const t = normalizar(message);
    for (const [re, key] of PALABRAS_CARTA) if (re.test(t)) return key;
    return null;
  }

  getSenderName(senderInfo) {
    return senderInfo?.profile?.name || senderInfo?.profile?.username || "Cliente";
  }

  firstName(senderInfo) {
    return this.getSenderName(senderInfo).replace(/^[~@]+/, '').match(/^([\p{L}\p{N}_]+)/u)?.[1] || '';
  }

  async sendWelcomeMessage(to, messageId, senderInfo) {
    try {
      const name = this.firstName(senderInfo);
      const welcomeMessage = `¡Hola 👋 ${name}!\nBienvenid@ a ${negocio.bienvenida}\n\n¿En qué te puedo ayudar? 😊\n\nEscribe *ayuda* si la necesitas`;
      await whatsappService.sendMessage(to, welcomeMessage, messageId);
    } catch (error) {
      logAxiosError('sendWelcomeMessage', error);
    }
  }

  async sendWelcomeMenu(to) {
    await whatsappService.sendInteractiveButtons(to, 'Elige una opción', [
      { type: 'reply', reply: { id: 'option_1', title: 'Pedir 🛒' } },
      { type: 'reply', reply: { id: 'option_4', title: 'Ubicación 📍' } },
      { type: 'reply', reply: { id: 'option_3', title: 'Preguntar 🤖' } },
    ]);
  }

  /** Después de la comida: "¿Deseas bebida o postre?". */
  async botonSi(to) {
    await whatsappService.sendInteractiveButtons(to, '¿Deseas bebida🍹 o postre? 🍨', [
      { type: 'reply', reply: { id: 'cat:bebidas', title: 'Bebidas 🍹' } },
      { type: 'reply', reply: { id: 'cat:heladeria', title: 'Heladería 🍨' } },
      { type: 'reply', reply: { id: 'option_1', title: 'Ver otra carta 📋' } },
    ]);
  }

  async menuPedido(to, textos = {}) {
    const action = {
      name: "flow",
      parameters: {
        "flow_message_version": "3",
        "flow_id": config.FLOW_ID_PEDIDO,
        "flow_token": tokenFlow('pedido', to),
        "flow_cta": "Pedido"
      },
    }
    if (!config.FLOW_ID_PEDIDO) return this.flowSinConfigurar(to);
    return await whatsappService.sendFlow(to, action, textos);
  }

  /** Sin FLOW_ID_PEDIDO en Railway, Meta rechaza el Flow (#131009): se avisa en vez de mandarlo roto. */
  async flowSinConfigurar(to) {
    console.error('[flows] FLOW_ID_PEDIDO vacío: configura el Flow de pedido en Railway.');
    reportarFalla(new Error('FLOW_ID_PEDIDO vacío en Railway: no se puede enviar el Flow de pedido'), { to, level: 'error', step: 'enviar el Flow de pedido' });
    await whatsappService.sendMessage(to, 'Tuvimos un problema para abrir el formulario del pedido 😔. Escribe *asesor* y una persona toma tu pedido ya mismo.');
    return null;
  }

  // ---------------------------------------------------------------------------
  //  Cartas y catálogos multiproducto
  // ---------------------------------------------------------------------------

  /** "Pedir": menú con las cartas (lista de WhatsApp). */
  async menuCartas(to, { soloBebidasYPostres = false } = {}) {
    const comida = {
      title: 'Para comer',
      rows: [
        { id: 'cat:comidas', title: 'Comidas 🌮🍔', description: 'Tacos, quesabirrias, burritos, salchipapas, hamburguesas, asados y picadas' },
      ],
    };
    const postresYBebidas = [
      { title: 'Heladería y bebidas', rows: [
        { id: 'cat:heladeria', title: 'Heladería y Botanas 🍨', description: 'Helados, banana split, chamoyada, brownie, malteadas y botanas' },
        { id: 'cat:bebidas', title: 'Bebidas 🍹🥤', description: 'Jugos, frappés, smoothies, micheladas, sodas y gaseosas' },
      ] },
    ];
    await whatsappService.sendListMessage(to, {
      header: soloBebidasYPostres ? 'Bebidas y postres' : '¿Qué se te antoja hoy? 😋',
      body: soloBebidasYPostres ? 'Elige qué quieres agregar a tu pedido 👇' : 'Aquí👇 puedes ver nuestras cartas',
      footer: negocio.nombre,
      button: 'Ver cartas',
      sections: soloBebidasYPostres ? postresYBebidas : [comida, ...postresYBebidas],
    });
  }

  /** Catálogo multiproducto (product_list) armado con los nombres de product_names. */
  async menuCarta(to, key, { header } = {}) {
    const carta = CATALOGOS[key];
    if (!carta) return false;
    if (!config.CATALOG_ID) {
      console.error('[catalogo] CATALOG_ID vacío: configura el ID del catálogo de Meta en Railway.');
      await whatsappService.sendMessage(to, 'Nuestro catálogo se está actualizando 🙈. Escribe *carta* para recibir el menú o *asesor* para pedir con una persona.');
      return false;
    }
    // Con variantes en Meta (VARIANTES_META=true) va un solo producto por grupo (p. ej. "Hamburguesas"):
    // el sabor o el tamaño se elige dentro del producto. Representante: la variante más económica
    // (WhatsApp muestra su precio en la lista).
    const unoPorGrupo = (nombres) => {
      if (!config.VARIANTES_META) return nombres;
      const elegido = new Map(); // grupo → nombre
      for (const n of nombres) {
        const g = grupoPorId[product_names[n]];
        if (g && (!elegido.has(g) || (precios[n] ?? 0) < (precios[elegido.get(g)] ?? 0))) elegido.set(g, n);
      }
      const usados = new Set();
      return nombres.flatMap((n) => {
        const g = grupoPorId[product_names[n]];
        if (!g) return [n];
        if (usados.has(g)) return [];
        usados.add(g);
        return [elegido.get(g)];
      });
    };
    let total = 0;
    const sections = carta.sections
      .map((s) => ({
        title: s.title.slice(0, 24),
        product_items: unoPorGrupo(s.productos)
          .map((nombre) => product_names[nombre])
          .filter(Boolean)
          .map((id) => ({ product_retailer_id: id })),
      }))
      .filter((s) => s.product_items.length)
      // Meta: máx. 30 productos y 10 secciones por mensaje.
      .map((s) => { const cabe = Math.max(0, 30 - total); const items = s.product_items.slice(0, cabe); total += items.length; return { ...s, product_items: items }; })
      .filter((s) => s.product_items.length)
      .slice(0, 10);
    if (total === 30) console.warn(`[catalogo] la carta "${key}" tiene más de 30 productos: se muestran los primeros 30 (activa VARIANTES_META o divide la carta).`);
    const tieneVariantes = sections.some((s) => s.product_items.some((p) => grupoPorId[p.product_retailer_id]));
    const template = {
      type: "product_list",
      header: { type: "text", text: header ?? carta.header },
      body: { text: config.VARIANTES_META && tieneVariantes ? "Agrega lo que quieras al carrito 🛒 y envía tu pedido. En cada producto eliges el sabor o el tamaño." : "Agrega lo que quieras al carrito 🛒 y envía tu pedido." },
      footer: { text: carta.marca },
      action: { catalog_id: config.CATALOG_ID, sections },
    };
    await whatsappService.sendMenu(to, template);
    return true;
  }

  /** "menu": plantilla con botón de catálogo si existe; si no, el menú de cartas. */
  async catalogo(to) {
    if (!config.CATALOG_TEMPLATE) return this.menuCartas(to);
    const template = {
      name: config.CATALOG_TEMPLATE,
      language: { code: config.CATALOG_TEMPLATE_LANG },
      components: [{ type: "button", sub_type: "CATALOG", index: 0 }],
    };
    await whatsappService.sendCatalogo(to, template);
  }

  async handleMenuOption(to, option) {
    let response;
    // Confirmar / agregar / cambiar el pedido y adicionales.
    switch (option) {
      case 'ped_ok': return this.confirmarPedido(to);
      case 'ped_mas': return this.prepararCarrito(to, 'agregar');
      case 'ped_cambiar': return this.prepararCarrito(to, 'reemplazar');
      case 'cart_sumar': return this.usarCarritoNuevo(to, 'agregar');
      case 'cart_reemplazar': return this.usarCarritoNuevo(to, 'reemplazar');
      case 'ad_si': return this.procesarAdicional(to);
      case 'ad_no': return this.usarCarritoNuevo(to, 'nuevo');
      default: break;
    }
    if (typeof option === 'string' && option.startsWith('cat:')) {
      const key = option.slice(4);
      const enviado = await this.menuCarta(to, key);
      // Después de la comida: "¿Deseas bebida o postre?".
      if (enviado && key === 'comidas') await this.botonSi(to);
      return;
    }
    switch (option) {
      case 'option_1':
        await this.menuCartas(to);
        break;
      case 'option_3':
        this.assistandState[to] = { step: 'question' };
        response = 'Realiza tu pregunta: ';
        break;
      case 'option_4':
        response = `Te esperamos en ${negocio.nombre}! 📍`;
        await this.sendLocation(to);
        break;
      case 'option_5':
        response = "Es un placer para nosotros servirte, que disfrutes de tu pedido 😊👩‍🍳\nVuelve pronto!";
        break;
      case 'op_3':
        response = 'Escribe a nuestro Whatsapp personal🤗';
        await this.sendContact(to);
        break;
      case 'si':
        await this.menuCartas(to, { soloBebidasYPostres: true });
        break;
      default:
        this.assistandState[to] = { step: 'question' };
    }
    if (response) {
      await whatsappService.sendMessage(to, response);
    }
  }

  /** (Compatibilidad) Antes mandaba el Flow de una vez; ahora primero se confirma el pedido. */
  async handleHiringFlow(to) {
    return this.pedirConfirmacion(to);
  }

  /**
   * Cobro según el medio de pago elegido en el Flow (Efectivo o Transferencia).
   * Se usa al llenar el Flow y también para los ADICIONALES (mismos datos, sin volver a llenarlo).
   * Devuelve el texto para el cliente.
   */
  async cobrarPedido(to, datosPedido, pedidoStr, { adicional = false } = {}) {
    let response;
    const pedidoStrTemplate = String(pedidoStr ?? '').replace(/\n/g, '  |  ');
    const entrega = entregaTexto(datosPedido.datos);
    const pago = String(datosPedido.datos.pago ?? '').trim();
    userOrderDataMap[to] = { ...datosPedido.datos, address: entrega, monto: datosPedido.monto, pedidoStr: pedidoStrTemplate };
    if (/transferencia|nequi|daviplata|bancolombia/i.test(pago)) {
      sesion(to).esperandoComprobante = true;
      response = `*Resumen de tu pedido*🛒:\n\n${pedidoStr}\n*Total:* ${cop(datosPedido.monto)} COP\n\n${negocio.cuentasBancarias}\n\nLuego, envíanos el comprobante de la transferencia (captura) para confirmar tu pedido 😊`;
    } else {
      // Efectivo (o cualquier otro medio que no requiera comprobante): el pedido queda recibido ya.
      const templateVars = [
        datosPedido.datos.name,
        datosPedido.datos.phone,
        entrega,
        pedidoStrTemplate,
        pago || 'Efectivo',
        datosPedido.monto ? datosPedido.monto.toLocaleString('es-CO') : ""
      ];
      await this.avisarNumerosOficiales(PLANTILLA_PEDIDO, negocio.imagenPedido, templateVars);
      response = adicional
        ? `✅ ¡Adicional recibido! Lo sumamos a tu pedido.\n*Total del adicional:* ${cop(datosPedido.monto)} (pagas al recibir) 🤗`
        : "✅¡Pedido recibido!\nPronto nos pondremos en contacto contigo! 🤗";
    }
    return response;
  }

  async respFlow(to, screen, datosPedido, pedidoStr) {
    if (screen !== "SUMMARY") return;
    if (!datosPedido?.datos) {
      await whatsappService.sendMessage(to, 'No encontré los datos de tu pedido 😔. Vuelve a enviarlo desde el carrito, por favor.');
      return;
    }
    // Domicilio solo si eligió "domicilio" en el Flow, y una sola vez aunque el Flow llegue repetido.
    if (esDomicilio(datosPedido.datos) && !datosPedido.domicilioIncluido) {
      datosPedido.monto = Number(datosPedido.monto || 0) + valorDomicilio(datosPedido.datos);
      datosPedido.domicilioIncluido = true;
    }
    const response = await this.cobrarPedido(to, datosPedido, pedidoStr);
    if (response) await whatsappService.sendMessage(to, response);
  }

  /** Comprobante de transferencia (imagen) → S3 → aviso a los números oficiales. */
  async recibirComprobante(message) {
    const from = message.from;
    sesion(from).esperandoComprobante = false;
    const datosUsuario = userOrderDataMap[from] || {};
    let publicUrl = negocio.imagenPedido;
    try {
      const imageBuffer = await downloadImageFromMeta(message.image.url);
      publicUrl = await uploadToPublicStorage(imageBuffer, message.image.mime_type);
    } catch (error) {
      logAxiosError('comprobante', error);
      // El aviso sale con la imagen genérica en vez de la foto del comprobante.
      reportarFalla(error, { to: from, level: 'warning', step: 'descargar el comprobante de Meta y subirlo a S3' });
    }
    const templateVars = [
      datosUsuario.name || "",
      datosUsuario.phone || "",
      datosUsuario.address || "",
      datosUsuario.pedidoStr || "",
      datosUsuario.pago || "",
      datosUsuario.monto ? datosUsuario.monto.toLocaleString('es-CO') : "",
    ];
    await this.avisarNumerosOficiales(PLANTILLA_COMPROBANTE, publicUrl, templateVars);
    await whatsappService.sendMessage(from, "Gracias por compartirnos el comprobante de tu pago ✅\n\nPronto nos pondremos en contacto contigo para confirmar tu pedido 😊");
  }

  async avisarNumerosOficiales(plantilla, imagen, templateVars) {
    if (!negocio.numerosOficiales.length) {
      console.warn('[avisos] NOTIFY_NUMBERS vacío: nadie recibe el aviso del pedido. Configura los números en Railway.');
      reportarFalla(new Error('NOTIFY_NUMBERS vacío: nadie del negocio recibió el aviso del pedido'), { step: `avisar al negocio (plantilla ${plantilla})`, pendingMessage: { type: 'template', template: { name: plantilla }, variables: templateVars } });
      return;
    }
    for (const numero of negocio.numerosOficiales) {
      await whatsappService.sendTemplateComprobantePago(numero, plantilla, imagen, templateVars);
    }
  }

  async helpMenu(to) {
    const response = `Bienvenido al menú de ayuda de *${negocio.nombre}*\n\nPara hacer una pregunta escríbela finalizando con el signo *?*\n\nPara pedir escribe *Pedir* (o el nombre del plato: "quiero 2 tacos de birria")\nPara ver la carta escribe *Carta* o *Menú*\nPara hablar con un asesor escribe *Asesor*\nPara la ubicación escribe *Ubicación*\n\nEspero te sirva! 😊`;
    await whatsappService.sendMessage(to, response);
  }

  /** Carta en PDF/imagen si hay URL configurada; si no, el menú de cartas del catálogo. */
  async sendMedia(to) {
    const c = negocio.carta;
    if (!c.url) return this.menuCartas(to);
    await whatsappService.sendMessage(to, "Espera que cargue la carta... 📄");
    const tipo = /\.(png|jpe?g|webp)(\?|$)/i.test(c.url) ? 'image' : 'document';
    await whatsappService.sendMediaMessage(to, tipo, c.url, c.caption, c.filename);
  }

  /** Fila del pedido en Google Sheets (SPREADSHEETID_PEDIDO). */
  completeHiring(productos, data, numero) {
    const fechayhora = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' });
    const spreadsheetId = process.env.SPREADSHEETID_PEDIDO;
    const userData = [
      numero,
      data.name,
      productos,
      entregaTexto(data), // "Domicilio" o "Recoger en el restaurante"
      data.phone,
      data.pago,
      data.recomendacion,
      fechayhora,
    ];
    paymentRowMap[numero] = fechayhora;
    if (spreadsheetId) appendToSheet(userData, spreadsheetId);
  }

  /** Comanda en Loggro POS: cada producto con su área de preparación (sale del JSON de Loggro). */
  completeOrder(productos, data, { adicional = false } = {}) {
    const locationStock = config.LOGGRO_LOCATION_STOCK || LOGGRO_LOCATION_STOCK;
    const orders = (productos ?? []).map(item => ({
      product: item.product_retailer_id,
      locationStock,
      waiterOrderArea: areaPorId[item.product_retailer_id] ?? null,
      quantity: item.quantity,
      unit_price: item.item_price,
      notes: data.recomendacion || ""
    }));

    // Si hay domicilio y existe el producto "Domicilio" en Loggro, va como un producto más.
    if (!adicional && esDomicilio(data) && config.LOGGRO_DOMICILIO_PRODUCT_ID && negocio.domicilio) {
      orders.push({
        product: config.LOGGRO_DOMICILIO_PRODUCT_ID,
        locationStock,
        quantity: 1,
        unit_price: negocio.domicilio,
        notes: "Domicilio"
      });
    }

    const pedidoLoggro = {
      table: config.LOGGRO_TABLE_ID,
      groupName: `${adicional ? '➕ ADICIONAL\n' : ''}Nombre: ${data.name}\nTeléfono: ${data.phone}\nEntrega: ${entregaTexto(data)}`,
      orders
    };

    enviarPedidoALoggro(pedidoLoggro); // no lanza errores (ver loggroService.js)
  }

  /**
   * Respuesta de la IA del CRM. Si el cliente tiene un pedido sin terminar, después
   * de responder se le recuerda (sin perder el pedido); si no, "¿Resolví tu pregunta?"
   * solo cuando fue una pregunta.
   */
  async handleAssistandFlow(to, message, { botones = true } = {}) {
    delete this.assistandState[to];
    const response = (await geminiService(message, to)) ?? AI_UNAVAILABLE;
    await whatsappService.sendMessage(to, response);
    if (this.pedidoPendiente(to)) {
      await this.recordarPedido(to);
    } else if (botones) {
      await whatsappService.sendInteractiveButtons(to, "¿Resolví tu pregunta?", [
        { type: 'reply', reply: { id: 'option_4', title: "Si, Gracias 😊" } },
        { type: 'reply', reply: { id: 'option_3', title: 'Hacer otra pregunta' } },
      ]);
    }
  }

  async handleAssistand(to, message) {
    const state = this.assistandState[to];
    let response;

    switch (state?.step) {
      case 'question':
        response = (await geminiService(message, to)) ?? AI_UNAVAILABLE;
        break;
      default:
        response = "Lo siento 😔 no entendí tu respuesta\nPor Favor, elige una de las opciones del menú.";
    }

    delete this.assistandState[to];
    await whatsappService.sendMessage(to, response);
  }

  async sendContact(to) {
    await whatsappService.sendContactMessage(to, negocio.contacto);
  }

  async sendLocation(to) {
    const { latitude, longitude, name, address } = negocio.ubicacion;
    if (latitude == null || longitude == null) {
      console.warn('[ubicacion] faltan UBICACION_LAT y UBICACION_LNG en Railway: se envía la dirección con el enlace de Google Maps');
      const mapa = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name}, ${address}`)}`;
      await whatsappService.sendMessage(to, `📍 *${name}*\n${address}\n\nCómo llegar: ${mapa}`);
      return;
    }
    await whatsappService.sendLocationMessage(to, latitude, longitude, name, address);
  }

  // ===========================================================================
  //  v3.5 · Conversación
  // ===========================================================================

  /**
   * Texto del cliente dentro del horario.
   *  1. Saludo: la bienvenida sale UNA vez por turno; "hola, ¿se demora?" atiende la pregunta.
   *  2. "gracias", "ok" → respuesta corta (nunca la bienvenida otra vez).
   *  3. Palabras clave de siempre (ayuda, carta, menú, ubicación, asesor).
   *  4. Preguntas generales (tiempos, pagos, domicilio, estado del pedido) → IA del CRM.
   *  5. Platos ("me regalas 3 tacos de birria") → búsqueda con IA → tarjetas / carrusel.
   *  6. Todo lo demás → IA del CRM (antes quedaba sin respuesta).
   * Si hay un pedido sin terminar, se le recuerda después de responder.
   */
  async atenderTexto(from, message, senderInfo) {
    try {
      return await this.responderTexto(from, message, senderInfo);
    } finally {
      await whatsappService.markAsRead(message.id);
    }
  }

  async responderTexto(from, message, senderInfo) {
    const texto = String(message.text?.body ?? '').trim();
    const s = sesion(from);

    const { saludo, resto } = separarSaludo(texto);
    if (saludo) {
      const turno = turnoActual() ?? 'fuera';
      const primeraVez = s.bienvenidaTurno !== turno;
      if (primeraVez) {
        s.bienvenidaTurno = turno;
        await this.sendWelcomeMessage(from, message.id, senderInfo);
      }
      if (!resto) {
        if (!primeraVez) {
          const nombre = this.firstName(senderInfo);
          await whatsappService.sendMessage(from, `¡Hola de nuevo${nombre ? `, ${nombre}` : ''}! 😊 ¿En qué te puedo ayudar?`);
        }
        if (this.pedidoPendiente(from)) await this.recordarPedido(from);
        else if (primeraVez) await this.sendWelcomeMenu(from);
        return;
      }
    }

    const t = saludo ? resto : texto;
    const lower = t.toLowerCase().trim();
    const pregunta = this.isQuestion(lower);

    if (esCortesia(t)) {
      await whatsappService.sendMessage(from, this.pedidoPendiente(from) ? '¡Con gusto! 😊' : '¡Con gusto! 😊 Aquí estamos si necesitas algo más.');
      if (this.pedidoPendiente(from)) await this.recordarPedido(from);
      return;
    }
    if (esCancelar(t) && this.pedidoPendiente(from)) return this.cancelarPedido(from);

    // Palabras clave (igual que antes).
    if (lower === 'ayuda') return this.helpMenu(from);
    if (lower.includes('carta')) return this.sendMedia(from);
    if (/\bmen[uú]\b/.test(lower) && !hablaDePlatos(t)) return this.catalogo(from);
    if (lower === 'ubicacion' || lower === 'ubicación') return this.sendLocation(from);
    if (lower === 'asesor') return this.sendContact(from);

    // "Hacer otra pregunta" o preguntas de tiempos, pagos, domicilio, estado del pedido → IA.
    if (this.assistandState[from] || esPreguntaGeneral(t)) return this.handleAssistandFlow(from, t, { botones: pregunta });

    // Platos: la IA completa el nombre y se muestran las tarjetas del catálogo.
    // v3.6: "¿qué hamburguesas tienes?", "¿tienen malteadas?" piden un producto: solo tarjetas, sin texto de la IA.
    const pideProducto = !pregunta || esPeticionDeProducto(t);
    if (hablaDePlatos(t)) {
      const { tarjetas, sinFoto } = await buscarPlatos(from, t);
      const carta = this.cartaPorTexto(lower);
      if (tarjetas.length > 10 && carta && pideProducto) return this.handleMenuOption(from, `cat:${carta}`); // "quiero una pizza" → la carta completa
      if (tarjetas.length) {
        if (!pideProducto) {
          // "¿la hawaiana tiene piña?": responde la IA y debajo quedan las tarjetas para pedir.
          const respuesta = await geminiService(t, from);
          if (respuesta) await whatsappService.sendMessage(from, respuesta);
        }
        await enviarTarjetas(from, tarjetas, t);
        return;
      }
      if (sinFoto?.length && pideProducto) {
        // Lo pidió, pero todavía no tiene foto en Meta (no sale en el catálogo de WhatsApp).
        await whatsappService.sendMessage(from, textoSinFoto(sinFoto));
        return;
      }
    }
    const carta = this.cartaPorTexto(lower);
    if (carta && !pregunta) return this.handleMenuOption(from, `cat:${carta}`);
    if (!pregunta && this.isOrder(lower)) {
      if (this.pedidoPendiente(from)) return this.recordarPedido(from);
      return this.handleMenuOption(from, 'option_1');
    }
    return this.handleAssistandFlow(from, t, { botones: pregunta });
  }

  // ===========================================================================
  //  v3.5 · Pedido: confirmar, agregar, cambiar, recordatorios y adicionales
  // ===========================================================================

  /** Pedido del carrito que todavía no tiene los datos del Flow. */
  pedidoPendiente(to) {
    const s = obtenerSesion(to);
    return Boolean(s?.pedido && ['confirmar', 'datos'].includes(s.pedido.estado) && s.productos?.length);
  }

  /** Nombres y total de un carrito (los nombres salen de data/catalogo.js). */
  resumenCarrito(items) {
    const lineas = items.map((item) => {
      const nombre = nombrePorId[item.product_retailer_id] || item.product_retailer_id;
      if (!nombrePorId[item.product_retailer_id]) console.warn('[pedido] producto sin nombre en data/catalogo.js:', item.product_retailer_id);
      return `${nombre} x${item.quantity}`;
    });
    const monto = items.reduce((t, i) => t + (Number(i.item_price) || 0) * (Number(i.quantity) || 1), 0);
    return { pedidoStr: lineas.join('\n'), monto };
  }

  /** Carrito que llega del catálogo de WhatsApp ("Pedido del catálogo"). */
  async recibirCarrito(to, order) {
    const items = (order?.product_items ?? []).map((i) => ({
      product_retailer_id: String(i.product_retailer_id),
      quantity: Number(i.quantity) || 1,
      item_price: Number(i.item_price) || 0,
      currency: i.currency,
    }));
    if (!items.length) return;
    const s = sesion(to);

    if (!isWithinBusinessHours()) {
      await whatsappService.sendMessage(to, `🌙 En este momento estamos cerrados. Recibimos pedidos ${negocio.horarioTexto()}.\nTu carrito queda guardado en WhatsApp 🛒: envíalo de nuevo cuando abramos 😊`);
      return;
    }

    // ¿Ya llenó el Flow hace poco? Puede ser un ADICIONAL a ese pedido.
    const p = s.pedido;
    if (p?.estado === 'enviado' && p.datos && Date.now() - (p.ultimoAt ?? p.enviadoAt ?? 0) < config.ADICIONAL_MINUTOS * 60000) {
      s.carritoNuevo = items;
      const { pedidoStr, monto } = this.resumenCarrito(items);
      await whatsappService.sendInteractiveButtons(to, `Recibí estos productos 🛒\n\n${pedidoStr}\n*Total:* ${cop(monto)}\n\n¿Son un *adicional* para el pedido que ya enviaste? (mismos datos de entrega y pago, sin volver a llenar el formulario)`.slice(0, 1024), [
        { type: 'reply', reply: { id: 'ad_si', title: 'Sí, es adicional' } },
        { type: 'reply', reply: { id: 'ad_no', title: 'Es un pedido nuevo' } },
      ]);
      return;
    }

    // ¿Tiene un pedido sin terminar? Se suma o se reemplaza (lo que haya elegido, o se le pregunta).
    if (this.pedidoPendiente(to)) {
      if (s.modoCarrito) {
        const modo = s.modoCarrito;
        s.modoCarrito = null;
        return this.aplicarCarrito(to, items, modo);
      }
      s.carritoNuevo = items;
      const nuevo = this.resumenCarrito(items);
      await whatsappService.sendInteractiveButtons(to, `Ya tienes un pedido sin terminar:\n\n${s.pedidoStr}\n\nY acabas de enviar:\n\n${nuevo.pedidoStr}\n\n¿Qué hago con estos productos?`.slice(0, 1024), [
        { type: 'reply', reply: { id: 'cart_sumar', title: 'Agregar al pedido' } },
        { type: 'reply', reply: { id: 'cart_reemplazar', title: 'Reemplazar pedido' } },
      ]);
      return;
    }
    return this.aplicarCarrito(to, items, 'nuevo');
  }

  /** Arma el pedido con el carrito (nuevo, sumado al anterior o reemplazándolo) y pide confirmarlo. */
  async aplicarCarrito(to, items, modo = 'nuevo') {
    const s = sesion(to);
    let lista = items;
    if (modo === 'agregar' && s.productos?.length) {
      const porId = new Map(s.productos.map((i) => [i.product_retailer_id, { ...i }]));
      for (const i of items) {
        const actual = porId.get(i.product_retailer_id);
        if (actual) actual.quantity = (Number(actual.quantity) || 0) + (Number(i.quantity) || 0);
        else porId.set(i.product_retailer_id, { ...i });
      }
      lista = [...porId.values()];
    }
    const { pedidoStr, monto } = this.resumenCarrito(lista);
    nuevoPedido(to, { productos: lista, pedidoStr, monto });
    const recordatorios = modo === 'nuevo' ? 0 : s.pedido?.recordatorios ?? 0;
    s.pedido = { estado: 'confirmar', creadoAt: Date.now(), recordatorios };
    s.carritoNuevo = null;
    s.modoCarrito = null;
    await this.pedirConfirmacion(to, { modo });
    this.programarRecordatorio(to);
  }

  /** "¿Está todo bien?" antes de mandar el Flow: confirmar, agregar más o cambiar. */
  async pedirConfirmacion(to, { modo = 'nuevo' } = {}) {
    const s = sesion(to);
    const intro = modo === 'agregar' ? '✅ Listo, lo agregué.\n\n' : modo === 'reemplazar' ? '✅ Listo, cambié tu pedido.\n\n' : '';
    const domicilio = negocio.domicilio ? `\n_(Si es a domicilio se suman ${cop(negocio.domicilio)})_` : '';
    const texto = `${intro}*Tu pedido* 🛒\n\n${s.pedidoStr}\n\n*Subtotal:* ${cop(s.datosPedido?.monto)}${domicilio}\n\n¿Está todo bien?`;
    await whatsappService.sendInteractiveButtons(to, texto.slice(0, 1024), BOTONES_CONFIRMAR);
  }

  /** Confirmó: se manda el Flow de datos (entrega y pago). */
  async confirmarPedido(to) {
    const s = sesion(to);
    if (!this.pedidoPendiente(to)) {
      await whatsappService.sendMessage(to, 'No encontré un pedido pendiente 🤔. Arma tu carrito 🛒 y envíalo, por favor.');
      return;
    }
    s.pedido.estado = 'datos';
    await this.menuPedido(to);
    this.programarRecordatorio(to);
  }

  /** "Agregar más" / "Cambiar pedido": el próximo carrito se suma o reemplaza sin preguntar. */
  async prepararCarrito(to, modo) {
    const s = sesion(to);
    if (!this.pedidoPendiente(to)) {
      await whatsappService.sendMessage(to, 'No encontré un pedido pendiente 🤔. Arma tu carrito 🛒 y envíalo, por favor.');
      return;
    }
    s.modoCarrito = modo;
    await whatsappService.sendMessage(to, modo === 'agregar'
      ? 'Perfecto 👌 Elige lo que quieras agregar y envía el carrito 🛒: lo sumo a tu pedido.'
      : 'Claro 👌 Arma tu carrito 🛒 con el pedido como lo quieres y envíalo: reemplazo el anterior.\n\n💡 En el carrito puedes cambiar cantidades o quitar productos antes de enviarlo.');
    await this.menuCartas(to);
    this.programarRecordatorio(to);
  }

  /** Respuesta a "¿Agregar o reemplazar?" / "¿Es adicional?" sobre el último carrito. */
  async usarCarritoNuevo(to, modo) {
    const s = sesion(to);
    if (!s.carritoNuevo?.length) {
      await whatsappService.sendMessage(to, 'No encontré los productos 🤔. Envía el carrito de nuevo, por favor.');
      return;
    }
    if (modo === 'nuevo') s.pedido = null; // pedido nuevo (el anterior ya se envió)
    return this.aplicarCarrito(to, s.carritoNuevo, modo);
  }

  /** ADICIONAL a un pedido ya enviado: mismos datos del Flow, sin domicilio otra vez. */
  async procesarAdicional(to) {
    const s = sesion(to);
    const prev = s.pedido?.datos;
    const items = s.carritoNuevo;
    if (!prev || !items?.length) {
      await whatsappService.sendMessage(to, 'No encontré tu pedido anterior 🤔. Envía el carrito de nuevo y lo tomamos como un pedido nuevo.');
      return;
    }
    const { pedidoStr, monto } = this.resumenCarrito(items);
    const datos = { ...prev, recomendacion: [prev.recomendacion, 'ADICIONAL al pedido anterior'].filter(Boolean).join(' · ') };
    this.completeHiring(`➕ ADICIONAL\n${pedidoStr}`, datos, to);   // Google Sheets
    this.completeOrder(items, datos, { adicional: true });          // Loggro (sin domicilio)
    const response = await this.cobrarPedido(to, { monto, datos: prev, domicilioIncluido: true }, `➕ *Adicional:*\n${pedidoStr}`, { adicional: true });
    if (response) await whatsappService.sendMessage(to, response);
    s.pedido.ultimoAt = Date.now();
    s.carritoNuevo = null;
  }

  /** El cliente llenó el Flow (pantalla SUMMARY): el pedido quedó enviado. Lo llama flow.js. */
  pedidoEnviado(numero, data) {
    const s = sesion(numero);
    s.pedido = { ...(s.pedido ?? {}), estado: 'enviado', enviadoAt: Date.now(), ultimoAt: Date.now(), datos: { ...data } };
    s.modoCarrito = null;
    clearTimeout(temporizadores.get(numero));
    temporizadores.delete(numero);
  }

  async cancelarPedido(to) {
    const s = sesion(to);
    s.pedido = null;
    s.productos = [];
    s.pedidoStr = '';
    s.modoCarrito = null;
    s.carritoNuevo = null;
    clearTimeout(temporizadores.get(to));
    temporizadores.delete(to);
    await whatsappService.sendMessage(to, 'Listo, cancelé tu pedido 👍. Cuando quieras, escribe *pedir* y te muestro la carta.');
  }

  /**
   * Recordatorio del pedido sin terminar: automático (cada RECORDATORIO_PEDIDO_MIN,
   * máx. RECORDATORIO_PEDIDO_MAX veces) o justo después de responderle una pregunta.
   */
  async recordarPedido(to, { automatico = false } = {}) {
    const s = obtenerSesion(to);
    if (!s || !this.pedidoPendiente(to)) return false;
    const p = s.pedido;
    if (!automatico && p.ultimoRecordatorioAt && Date.now() - p.ultimoRecordatorioAt < 60 * 1000) return false; // no repetir en ráfaga
    p.ultimoRecordatorioAt = Date.now();
    if (automatico) p.recordatorios = (p.recordatorios ?? 0) + 1;
    const ultimo = automatico && p.recordatorios >= config.RECORDATORIO_PEDIDO_MAX;
    const cierre = ultimo ? '\n\nSi ya no lo quieres, escribe *cancelar*.' : '';
    if (p.estado === 'confirmar') {
      const texto = `${automatico ? '⏰ ' : ''}Tu pedido sigue esperando 🛒\n\n${s.pedidoStr}\n\n*Subtotal:* ${cop(s.datosPedido?.monto)}\n\n¿Lo confirmamos?${cierre}`;
      await whatsappService.sendInteractiveButtons(to, texto.slice(0, 1024), BOTONES_CONFIRMAR);
    } else {
      await this.menuPedido(to, {
        header: automatico ? '⏰ ¿Seguimos con tu pedido?' : '¿Seguimos con tu pedido? 😊',
        body: `Solo falta que llenes tus datos de entrega y pago. Toca *Pedido* 👇${cierre}`,
      });
    }
    if (automatico) this.programarRecordatorio(to);
    return true;
  }

  /** Programa el próximo recordatorio (o lo cancela si ya no hace falta). */
  programarRecordatorio(to) {
    clearTimeout(temporizadores.get(to));
    temporizadores.delete(to);
    const s = obtenerSesion(to);
    if (!this.pedidoPendiente(to) || (s.pedido.recordatorios ?? 0) >= config.RECORDATORIO_PEDIDO_MAX) return;
    const t = setTimeout(() => {
      temporizadores.delete(to);
      this.recordarPedido(to, { automatico: true }).catch((error) => {
        console.error('[pedido] no se pudo enviar el recordatorio:', error.message);
        reportarFalla(error, { to, step: 'recordatorio del pedido pendiente' });
      });
    }, config.RECORDATORIO_PEDIDO_MIN * 60 * 1000);
    t.unref?.();
    temporizadores.set(to, t);
  }

  /** El cliente escribió: el recordatorio se cuenta desde ahora (no se le interrumpe mientras habla). */
  tocarSeguimiento(to) {
    if (temporizadores.has(to)) this.programarRecordatorio(to);
  }
}

export default new MessageHandler();
