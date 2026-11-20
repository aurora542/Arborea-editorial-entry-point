/* ============================================================================
 * Arbórea — Backend de pedidos del Welcome
 *
 * Navegador → /api/orders/ (route handler en Vercel) → ESTE script → Drive + correo
 *
 * Modelo de datos (docs/ORDERS-BACKEND.md §5):
 *
 *   WelcomeOrders/                     ← creada a mano, es el FOLDER_ID
 *   ├── Registro de Checkouts          ← una fila por checkout, solicitudes y dedupe
 *   └── Pedidos/
 *         └── SB-10432 — Rodríguez — Casa Mango
 *               ├── Pedido 1 · 2026-11-20   ← cabecera + detalle completo
 *               ├── Pedido 2 · 2026-11-24   ← pestaña nueva, misma reserva
 *               ├── Consolidado             ← se reescribe en cada pedido
 *               └── Payload (oculta)        ← JSON crudo, la red de seguridad
 *
 * NADA SE RE-CREA. La subcarpeta y el maestro se crean una vez y después solo
 * reciben información. Ver `buscarOCrear_`: id cacheado en PropertiesService,
 * validado contra la papelera, y todo dentro del LockService — dos checkouts
 * simultáneos no pueden crear cada uno su propio maestro.
 *
 * TODO EL FORMATO SE GENERA AQUÍ. No hay plantilla. Para iterar sobre cómo se ve
 * sin hacer un checkout completo en el sitio: `generarPedidoDePrueba()`.
 *
 * RECORDATORIO: un cambio de código NO surte efecto hasta hacer una implementación
 * nueva (Implementar → Administrar implementaciones → editar → Versión: Nueva).
 * ========================================================================== */

const CONFIG = {
  /* Carpeta `WelcomeOrders` en el Drive de concierge@arboreaexperiences.com. */
  FOLDER_ID: '18K4EYRvXwBcvR9QEMsoQphYG1SnJFJLc',

  /* Debe ser EXACTAMENTE el mismo valor que ORDERS_SHARED_SECRET en Vercel. */
  SHARED_SECRET: 'PEGAR_EL_MISMO_SECRETO_QUE_EN_VERCEL',

  TIMEZONE: 'America/Costa_Rica',

  /* Quién recibe el resumen de cada pedido. El correo sale desde la cuenta dueña
   * del script, así que las respuestas del huésped llegan ahí. */
  CONCIERGE_EMAILS: ['concierge@arboreaexperiences.com'],

  /* Se buscan POR NOMBRE dentro de FOLDER_ID. Si se renombran a mano, el script
   * crea unos nuevos y los pedidos quedan partidos en dos sitios. */
  MASTER_NAME: 'Registro de Checkouts',
  ORDERS_FOLDER_NAME: 'Pedidos',

  TAB_CHECKOUTS: 'Checkouts',
  TAB_SOLICITUDES: 'Solicitudes',
  TAB_CONSOLIDADO: 'Consolidado',
  TAB_PAYLOAD: 'Payload',

  ESTADOS: ['Pendiente', 'Confirmado', 'Entregado', 'Cancelado'],
};

/* Paleta del sitio, para que hojas y correos se vean de la casa. */
const C = {
  VERDE: '#213B2F', SAGE: '#D8DDB8', HUESO: '#EDE5D8',
  TINTA: '#222E2C', ORO: '#C9974F', GRIS: '#7D8584',
};

const SERVICIOS = {
  'private-chef': 'Chef privado',
  'full-fridge': 'Full Fridge',
  'wellness-spa': 'Spa y bienestar',
  'fishing-tours': 'Pesca',
  'tours': 'Tours y actividades',
  'transport': 'Vehículos',
};

/* Etiquetas en español para las preferencias. Una clave que no esté aquí se
 * muestra tal cual: mejor un encabezado feo que perder el dato. */
const CAMPOS = {
  adults: 'Adultos', children: 'Niños', days: 'Días',
  restrictions: 'Restricciones', restrictionOther: 'Otra restricción',
  allergies: 'Alergias', preferences: 'Preferencias', dishes: 'Platos elegidos',
  cooking: 'Cocina', groceries: 'Compras', snacksFor: 'Snacks para',
  preferredSnacks: 'Snacks preferidos', produce: 'Lista de productos',
  notes: 'Notas', guests: 'Huéspedes',
};

const CATEGORIAS = {
  cleaning: 'Limpieza extra', amenities: 'Reposición de amenities',
  electricity: 'Electricidad', wildlife: 'Insectos o animales',
  checkout: 'Check-out tardío o check-in temprano',
  concierge: 'Recomendación o reserva', message: 'Mensaje libre',
};

/* ─────────────────────────── Entradas HTTP ─────────────────────────── */

function doGet() {
  return json_({ ok: true, service: 'arborea-orders', ts: new Date().toISOString() });
}

function doPost(e) {
  try {
    const p = JSON.parse(e.postData.contents);

    if (p.secret !== CONFIG.SHARED_SECRET) return json_({ ok: false, error: 'unauthorized' });
    if (!p.submissionId) return json_({ ok: false, error: 'missing-submission-id' });

    const esSolicitud = p.type === 'request';
    const faltante = esSolicitud ? validarSolicitud_(p) : validarPedido_(p);
    if (faltante) return json_({ ok: false, error: 'invalid-payload', detail: faltante });

    /* El lock abarca el buscar-o-crear completo, no solo la escritura: dos
     * checkouts simultáneos encontrarían ambos que no existe el maestro. */
    const lock = LockService.getScriptLock();
    lock.waitLock(45000);
    try {
      if (yaProcesado_(p.submissionId)) {
        /* Un reintento tras fallo de red trae el mismo id. Responder ok para que
         * el huésped vea éxito, sin escribir nada por segunda vez. */
        return json_({ ok: true, submissionId: p.submissionId, dedup: true });
      }
      return esSolicitud ? procesarSolicitud_(p) : procesarPedido_(p);
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    console.error('doPost: ' + (err && err.stack));
    return json_({ ok: false, error: String((err && err.message) || err) });
  }
}

function validarPedido_(p) {
  const g = p.guest || {};
  /* Los cinco obligatorios del formulario. `email` y `checkInDate` son opcionales
   * por decisión de producto, así que NO se validan. */
  if (!g.reservationNumber) return 'guest.reservationNumber';
  if (!g.firstName) return 'guest.firstName';
  if (!g.lastName) return 'guest.lastName';
  if (!g.phone) return 'guest.phone';
  if (!g.casa) return 'guest.casa';
  if (!Array.isArray(p.cart) || !p.cart.length) return 'cart vacío';
  return null;
}

function validarSolicitud_(p) {
  const g = p.guest || {};
  if (!g.name) return 'guest.name';
  if (!g.casa) return 'guest.casa';
  if (!p.request || !p.request.category) return 'request.category';
  return null;
}

/* ───────────────── Buscar-o-crear idempotente ───────────────── */

/*
 * El corazón de "nada se re-crea".
 *
 * 1. Lee el id cacheado en PropertiesService.
 * 2. Lo VALIDA: si el archivo fue borrado o está en la papelera, descarta el caché.
 *    Un id cacheado que apunta a la papelera no debe producir un archivo nuevo en
 *    silencio — ese es justo el bug que deja veinte maestros con una fila cada uno.
 * 3. Sin caché válido, busca por nombre dentro del padre.
 * 4. Solo si de verdad no existe, crea.
 */
function buscarOCrear_(claveCache, padre, nombre, crear, esCarpeta) {
  const props = PropertiesService.getScriptProperties();
  const cacheado = props.getProperty(claveCache);

  if (cacheado) {
    try {
      const f = esCarpeta ? DriveApp.getFolderById(cacheado) : DriveApp.getFileById(cacheado);
      if (!f.isTrashed()) return cacheado;
    } catch (err) { /* id inválido: seguimos a la búsqueda por nombre */ }
    props.deleteProperty(claveCache);
  }

  const it = esCarpeta ? padre.getFoldersByName(nombre) : padre.getFilesByName(nombre);
  while (it.hasNext()) {
    const encontrado = it.next();
    if (!encontrado.isTrashed()) {
      props.setProperty(claveCache, encontrado.getId());
      return encontrado.getId();
    }
  }

  const id = crear();
  props.setProperty(claveCache, id);
  return id;
}

function carpetaRaiz_() { return DriveApp.getFolderById(CONFIG.FOLDER_ID); }

function carpetaPedidos_() {
  const raiz = carpetaRaiz_();
  const id = buscarOCrear_('FOLDER_PEDIDOS', raiz, CONFIG.ORDERS_FOLDER_NAME,
    function () { return raiz.createFolder(CONFIG.ORDERS_FOLDER_NAME).getId(); }, true);
  return DriveApp.getFolderById(id);
}

function maestro_() {
  const raiz = carpetaRaiz_();
  const id = buscarOCrear_('SHEET_MAESTRO', raiz, CONFIG.MASTER_NAME, function () {
    const ss = SpreadsheetApp.create(CONFIG.MASTER_NAME);
    DriveApp.getFileById(ss.getId()).moveTo(raiz);
    ss.setSpreadsheetTimeZone(CONFIG.TIMEZONE);
    const primera = ss.getSheets()[0];
    primera.setName(CONFIG.TAB_CHECKOUTS);
    encabezado_(primera, [
      'Fecha', 'Hora', 'Nº de reserva', 'Nombre', 'Apellido', 'Email', 'Teléfono',
      'Casa', 'Fecha de ingreso', 'Idioma', 'Origen', 'Pedido #', 'ID de envío', 'Archivo',
    ]);
    encabezado_(ss.insertSheet(CONFIG.TAB_SOLICITUDES), [
      'Fecha', 'Hora', 'Casa', 'Nombre', 'Teléfono', 'Categoría', 'Mensaje', 'ID de envío',
    ]);
    return ss.getId();
  }, false);
  return SpreadsheetApp.openById(id);
}

function encabezado_(hoja, cols) {
  hoja.getRange(1, 1, 1, cols.length).setValues([cols])
    .setFontWeight('bold').setFontColor(C.HUESO).setBackground(C.VERDE)
    .setVerticalAlignment('middle');
  hoja.setFrozenRows(1);
  hoja.setRowHeight(1, 32);
  for (let i = 1; i <= cols.length; i++) hoja.autoResizeColumn(i);
}

function hojaDe_(ss, nombre, cols) {
  let h = ss.getSheetByName(nombre);
  if (!h) { h = ss.insertSheet(nombre); encabezado_(h, cols); }
  return h;
}

/* ───────────────── Dedupe ───────────────── */

function yaProcesado_(submissionId) {
  const ss = maestro_();
  const donde = [[CONFIG.TAB_CHECKOUTS, 13], [CONFIG.TAB_SOLICITUDES, 8]];
  for (let i = 0; i < donde.length; i++) {
    const h = ss.getSheetByName(donde[i][0]);
    if (!h || h.getLastRow() < 2) continue;
    const hit = h.getRange(2, donde[i][1], h.getLastRow() - 1, 1)
      .createTextFinder(submissionId).matchEntireCell(true).findNext();
    if (hit) return true;
  }
  return false;
}

/* ───────────────── Pedidos ───────────────── */

function procesarPedido_(p) {
  const ahora = new Date();
  const g = p.guest;
  const ss = archivoDeReserva_(p);
  const numeroPedido = contarPedidos_(ss) + 1;

  escribirPestanaPedido_(ss, p, numeroPedido, ahora);
  guardarPayload_(ss, p, numeroPedido, ahora);
  reescribirConsolidado_(ss);

  const url = ss.getUrl();
  maestro_().getSheetByName(CONFIG.TAB_CHECKOUTS).appendRow([
    fecha_(ahora), hora_(ahora), g.reservationNumber,
    g.firstName, g.lastName, g.email || '', g.phone, casaLegible_(g.casa),
    g.checkInDate || '', p.locale === 'es' ? 'Español' : 'Inglés',
    p.source === 'kiosk' ? 'Kiosko' : 'Sitio web',
    numeroPedido, p.submissionId, url,
  ]);

  /* El correo nunca debe tumbar un pedido ya escrito: si falla el envío el pedido
   * está guardado igual, y la respuesta sigue siendo ok con la falla anotada. */
  let correo = 'ok';
  try {
    mailConcierge_(p, numeroPedido, url);
    if (g.email) mailHuesped_(p);
  } catch (err) {
    correo = 'fallo: ' + err.message;
    console.error('correo: ' + err.stack);
  }

  return json_({ ok: true, submissionId: p.submissionId, pedido: numeroPedido,
                 url: url, mail: correo });
}

function archivoDeReserva_(p) {
  const g = p.guest;
  const nombre = g.reservationNumber + ' — ' + g.lastName + ' — ' + casaLegible_(g.casa);
  const carpeta = carpetaPedidos_();

  /* La clave de caché lleva el número de reserva: una entrada por reserva. */
  const id = buscarOCrear_('RESERVA_' + g.reservationNumber, carpeta, nombre, function () {
    const ss = SpreadsheetApp.create(nombre);
    DriveApp.getFileById(ss.getId()).moveTo(carpeta);
    ss.setSpreadsheetTimeZone(CONFIG.TIMEZONE);
    /* La hoja que nace por defecto se recicla como Consolidado. */
    ss.getSheets()[0].setName(CONFIG.TAB_CONSOLIDADO);
    return ss.getId();
  }, false);

  return SpreadsheetApp.openById(id);
}

function contarPedidos_(ss) {
  return ss.getSheets().filter(function (h) {
    return h.getName().indexOf('Pedido ') === 0;
  }).length;
}

/*
 * La pestaña de un pedido. Se lee como una boleta: quién y cuándo arriba, luego un
 * bloque por servicio con sus ítems y sus preferencias completas, totales al final.
 */
function escribirPestanaPedido_(ss, p, numero, ahora) {
  const g = p.guest;
  const h = ss.insertSheet('Pedido ' + numero + ' · ' + fecha_(ahora), 0);
  const filas = [];
  const estilos = [];

  function fila(a, b, c, d, e, tipo) {
    filas.push([a || '', b || '', c === undefined ? '' : c,
                d === undefined ? '' : d, e === undefined ? '' : e]);
    if (tipo) estilos.push({ fila: filas.length, tipo: tipo });
  }

  fila('PEDIDO ' + numero, fecha_(ahora) + '   ' + hora_(ahora), '', '', '', 'titulo');
  fila('Estado', CONFIG.ESTADOS[0], '', '', '', 'estado');
  fila('');

  fila('DATOS DEL HUÉSPED', '', '', '', '', 'seccion');
  fila('Nº de reserva', g.reservationNumber, '', '', '', 'dato');
  fila('Huésped', g.firstName + ' ' + g.lastName, '', '', '', 'dato');
  fila('Teléfono', g.phone, '', '', '', 'dato');
  fila('Email', g.email || '—', '', '', '', 'dato');
  fila('Casa', casaLegible_(g.casa), '', '', '', 'dato');
  fila('Fecha de ingreso', g.checkInDate || '—', '', '', '', 'dato');
  fila('Origen', p.source === 'kiosk' ? 'Kiosko (tablet)' : 'Sitio web', '', '', '', 'dato');
  fila('Idioma del huésped', p.locale === 'es' ? 'Español' : 'Inglés', '', '', '', 'dato');
  if (p.notes) fila('Notas generales', p.notes, '', '', '', 'dato');
  fila('');

  /* Un bloque por servicio, en el orden en que viene el carrito (ya ordenado por
   * SERVICE_ORDER en el front, así que coincide con lo que vio el huésped). */
  const porServicio = agrupar_(p.cart);
  for (const sid in porServicio) {
    fila(etiquetaServicio_(sid), '', '', '', '', 'seccion');
    fila('Ítem', 'Detalle', 'Cant.', 'P. unit.', 'Total', 'colitem');
    porServicio[sid].forEach(function (l) {
      fila('   ' + (l.titleEn || l.title), detalle_(l), l.qty,
           l.byQuote ? 'A cotizar' : l.unitPrice,
           l.byQuote ? 'A cotizar' : l.lineTotal, 'item');
    });
    const prefs = filasDePreferencias_((p.serviceForms || {})[sid]);
    if (prefs.length) {
      fila('   Preferencias', '', '', '', '', 'subseccion');
      prefs.forEach(function (r) { fila('      ' + r[0], r[1], '', '', '', 'pref'); });
    }
    fila('');
  }

  const t = p.totals || {};
  fila('', '', '', 'Subtotal', t.subtotal || 0, 'total');
  if (t.quotePending) fila('', '', '', 'Por cotizar', t.quotePending + ' ítem(s)', 'nota');
  fila('', '', '', 'Ítems', t.itemCount || 0, 'nota');

  h.getRange(1, 1, filas.length, 5).setValues(filas);
  aplicarEstilos_(h, estilos, filas.length);
}

function aplicarEstilos_(h, estilos, nFilas) {
  h.setColumnWidth(1, 240); h.setColumnWidth(2, 400);
  h.setColumnWidth(3, 60);  h.setColumnWidth(4, 95); h.setColumnWidth(5, 95);
  h.getRange(1, 1, nFilas, 5).setVerticalAlignment('top').setFontFamily('Arial');
  h.getRange(1, 2, nFilas, 1).setWrap(true);
  /* Formato de moneda que deja pasar el texto "A cotizar" sin convertirlo en 0. */
  h.getRange(1, 4, nFilas, 2).setNumberFormat('$#,##0;;;@');

  estilos.forEach(function (s) {
    const r = h.getRange(s.fila, 1, 1, 5);
    if (s.tipo === 'titulo') {
      r.setBackground(C.VERDE).setFontColor(C.HUESO).setFontWeight('bold').setFontSize(13);
      h.setRowHeight(s.fila, 30);
    } else if (s.tipo === 'estado') {
      h.getRange(s.fila, 1).setFontWeight('bold');
      h.getRange(s.fila, 2)
        .setDataValidation(SpreadsheetApp.newDataValidation()
          .requireValueInList(CONFIG.ESTADOS, true).build())
        .setBackground('#FFF4D6').setFontWeight('bold');
    } else if (s.tipo === 'seccion') {
      r.setBackground(C.SAGE).setFontWeight('bold').setFontColor(C.TINTA);
    } else if (s.tipo === 'colitem') {
      r.setFontWeight('bold').setFontColor(C.GRIS).setFontSize(9);
    } else if (s.tipo === 'subseccion') {
      h.getRange(s.fila, 1).setFontWeight('bold').setFontColor(C.ORO);
    } else if (s.tipo === 'dato') {
      h.getRange(s.fila, 1).setFontColor(C.GRIS);
    } else if (s.tipo === 'total') {
      h.getRange(s.fila, 4, 1, 2).setFontWeight('bold');
    }
  });
}

/*
 * Vista plana de todo lo que esa reserva pidió, en todos sus pedidos. Se reescribe
 * entera en cada checkout: es derivada de la pestaña Payload, no una fuente de
 * verdad. Si se corrompe, se regenera sola en el pedido siguiente.
 */
function reescribirConsolidado_(ss) {
  const cols = ['Pedido #', 'Fecha', 'Servicio', 'Tipo', 'Ítem', 'Cant.',
                'P. unit.', 'Total', 'Fecha solicitada', 'Detalles'];
  const h = hojaDe_(ss, CONFIG.TAB_CONSOLIDADO, cols);
  if (h.getLastRow() > 1) h.getRange(2, 1, h.getLastRow() - 1, cols.length).clearContent();

  const filas = [];
  leerPayloads_(ss).forEach(function (reg) {
    (reg.payload.cart || []).forEach(function (l) {
      filas.push([reg.numero, reg.fecha, etiquetaServicio_(l.service), l.kind || '',
                  l.titleEn || l.title, l.qty,
                  l.byQuote ? 'A cotizar' : l.unitPrice,
                  l.byQuote ? 'A cotizar' : l.lineTotal,
                  l.date || '', detalle_(l)]);
    });
  });
  if (filas.length) {
    h.getRange(2, 1, filas.length, cols.length).setValues(filas);
    h.getRange(2, 7, filas.length, 2).setNumberFormat('$#,##0;;;@');
  }
  for (let i = 1; i <= cols.length; i++) h.autoResizeColumn(i);
}

/* El JSON crudo de cada pedido: la garantía de que no se pierde nada aunque no
 * exista columna para algo, y la fuente desde la que se reconstruye Consolidado. */
function guardarPayload_(ss, p, numero, ahora) {
  const h = hojaDe_(ss, CONFIG.TAB_PAYLOAD, ['Fecha', 'Pedido #', 'ID de envío', 'JSON']);
  h.appendRow([fecha_(ahora) + ' ' + hora_(ahora), numero, p.submissionId, JSON.stringify(p)]);
  h.hideSheet();
}

function leerPayloads_(ss) {
  const h = ss.getSheetByName(CONFIG.TAB_PAYLOAD);
  if (!h || h.getLastRow() < 2) return [];
  const out = [];
  h.getRange(2, 1, h.getLastRow() - 1, 4).getValues().forEach(function (r) {
    try { out.push({ fecha: r[0], numero: r[1], payload: JSON.parse(r[3]) }); }
    catch (err) { /* una fila corrupta no debe tumbar el consolidado */ }
  });
  return out;
}

/* ───────────────── Solicitudes (kiosko) ───────────────── */

function procesarSolicitud_(p) {
  const ahora = new Date();
  const g = p.guest;
  maestro_().getSheetByName(CONFIG.TAB_SOLICITUDES).appendRow([
    fecha_(ahora), hora_(ahora), casaLegible_(g.casa), g.name, g.phone || '',
    CATEGORIAS[p.request.category] || p.request.category,
    p.request.message || '', p.submissionId,
  ]);

  let correo = 'ok';
  try { mailSolicitud_(p, ahora); }
  catch (err) { correo = 'fallo: ' + err.message; console.error(err.stack); }

  return json_({ ok: true, submissionId: p.submissionId, mail: correo });
}

/* ───────────────── Correos ───────────────── */

function mailConcierge_(p, numero, url) {
  const g = p.guest;
  let cuerpo = dato_('Nº de reserva', g.reservationNumber)
    + dato_('Huésped', g.firstName + ' ' + g.lastName)
    + dato_('Teléfono', g.phone);
  if (g.email) cuerpo += dato_('Email', g.email);
  cuerpo += dato_('Casa', casaLegible_(g.casa));
  if (g.checkInDate) cuerpo += dato_('Fecha de ingreso', g.checkInDate);
  cuerpo += dato_('Origen', p.source === 'kiosk' ? 'Kiosko (tablet)' : 'Sitio web');
  if (p.notes) cuerpo += bloque_('Notas generales', p.notes);

  const porServicio = agrupar_(p.cart);
  for (const sid in porServicio) {
    cuerpo += '<h3 style="margin:22px 0 8px;font-size:15px;color:' + C.VERDE + '">'
      + esc_(etiquetaServicio_(sid)) + '</h3><table style="width:100%;border-collapse:collapse">';
    porServicio[sid].forEach(function (l) {
      const det = detalle_(l);
      cuerpo += '<tr><td style="padding:7px 0;border-bottom:1px solid #eee;font-size:13px">'
        + esc_(l.titleEn || l.title)
        + (det ? '<br><span style="color:' + C.GRIS + ';font-size:12px">' + esc_(det) + '</span>' : '')
        + '</td><td style="padding:7px 8px;border-bottom:1px solid #eee;font-size:13px;text-align:center;width:44px">×'
        + l.qty + '</td><td style="padding:7px 0;border-bottom:1px solid #eee;font-size:13px;text-align:right;width:92px">'
        + (l.byQuote ? 'A cotizar' : money_(l.lineTotal)) + '</td></tr>';
    });
    cuerpo += '</table>';
    const prefs = filasDePreferencias_((p.serviceForms || {})[sid]);
    if (prefs.length) {
      cuerpo += '<div style="margin:10px 0 0;padding:11px 13px;background:#F6F5F0;border-radius:8px">';
      prefs.forEach(function (r) {
        cuerpo += '<p style="margin:0 0 5px;font-size:12px"><strong>' + esc_(r[0]) + ':</strong> '
          + esc_(r[1]) + '</p>';
      });
      cuerpo += '</div>';
    }
  }

  const t = p.totals || {};
  cuerpo += '<p style="margin:22px 0 0;font-size:16px"><strong>Subtotal: '
    + money_(t.subtotal || 0) + '</strong></p>';
  if (t.quotePending) {
    cuerpo += '<p style="margin:4px 0 0;font-size:13px;color:' + C.ORO + '"><strong>'
      + t.quotePending + ' ítem(s) por cotizar</strong> — no incluidos en el subtotal.</p>';
  }
  cuerpo += '<p style="margin:24px 0 0"><a href="' + url + '" style="display:inline-block;'
    + 'background:' + C.VERDE + ';color:' + C.SAGE + ';padding:11px 20px;border-radius:999px;'
    + 'text-decoration:none;font-size:14px;font-weight:bold">Abrir la hoja de la reserva</a></p>';

  const opciones = {
    to: CONFIG.CONCIERGE_EMAILS.join(','),
    subject: 'Pedido ' + numero + ' · ' + g.reservationNumber + ' · ' + casaLegible_(g.casa)
             + ' — ' + g.firstName + ' ' + g.lastName,
    htmlBody: shell_('Arbórea · Pedido nuevo', 'Pedido ' + numero + ' — ' + casaLegible_(g.casa), cuerpo),
  };
  /* Responder al correo va directo al huésped, cuando lo dejó. */
  if (g.email) opciones.replyTo = g.email;
  MailApp.sendEmail(opciones);
}

/*
 * El del huésped es corto a propósito: confirma que llegó y que alguien lo va a
 * contactar. Sin totales — los precios son estimados y la cotización final la da
 * operaciones, así que mandarle un número aquí sería comprometerse de más.
 */
function mailHuesped_(p) {
  const g = p.guest;
  const es = p.locale === 'es';
  const cuerpo = es
    ? '<p style="font-size:14px;line-height:1.65">Hola ' + esc_(g.firstName) + ',</p>'
      + '<p style="font-size:14px;line-height:1.65">Recibimos tu pedido para <strong>'
      + esc_(casaLegible_(g.casa)) + '</strong>. Nuestro equipo de concierge va a revisar la '
      + 'disponibilidad y te contactará por WhatsApp o correo para confirmarte todo.</p>'
      + '<p style="font-size:14px;line-height:1.65">Lo registramos bajo tu reserva <strong>'
      + esc_(g.reservationNumber) + '</strong>.</p>'
      + '<p style="font-size:13px;line-height:1.65;color:' + C.GRIS + '">No se ha cobrado nada. '
      + 'Los precios que viste son estimados y te confirmamos la cotización final antes de tu estadía.</p>'
      + '<p style="font-size:14px;line-height:1.65">Nos vemos pronto,<br>Arbórea Experiences</p>'
    : '<p style="font-size:14px;line-height:1.65">Hi ' + esc_(g.firstName) + ',</p>'
      + '<p style="font-size:14px;line-height:1.65">We received your order for <strong>'
      + esc_(casaLegible_(g.casa)) + '</strong>. Our concierge team will check availability and '
      + 'reach out by WhatsApp or email to confirm everything with you.</p>'
      + '<p style="font-size:14px;line-height:1.65">We filed it under your reservation <strong>'
      + esc_(g.reservationNumber) + '</strong>.</p>'
      + '<p style="font-size:13px;line-height:1.65;color:' + C.GRIS + '">Nothing has been charged. '
      + 'The prices you saw are estimates and we confirm the final quote before your stay.</p>'
      + '<p style="font-size:14px;line-height:1.65">See you soon,<br>Arbórea Experiences</p>';

  MailApp.sendEmail({
    to: g.email,
    subject: es ? 'Recibimos tu pedido · Arbórea Experiences'
                : 'We received your order · Arbórea Experiences',
    htmlBody: shell_('Arbórea Experiences', es ? 'Pedido recibido' : 'Order received', cuerpo),
    name: 'Arbórea Experiences',
  });
}

function mailSolicitud_(p, ahora) {
  const g = p.guest;
  const cat = CATEGORIAS[p.request.category] || p.request.category;
  let cuerpo = dato_('Casa', casaLegible_(g.casa))
    + dato_('Huésped', g.name)
    + dato_('Teléfono', g.phone || '—')
    + dato_('Categoría', cat);
  if (p.request.message) cuerpo += bloque_('Mensaje', p.request.message);
  cuerpo += '<p style="margin:18px 0 0;font-size:12px;color:' + C.GRIS
    + '">Enviada desde el kiosko el ' + fecha_(ahora) + ' a las ' + hora_(ahora) + '.</p>';

  MailApp.sendEmail({
    to: CONFIG.CONCIERGE_EMAILS.join(','),
    subject: 'Solicitud · ' + casaLegible_(g.casa) + ' · ' + cat,
    htmlBody: shell_('Arbórea · Solicitud de huésped', cat, cuerpo),
  });
}

function shell_(eyebrow, titulo, inner) {
  return '<div style="font-family:Arial,Helvetica,sans-serif;color:' + C.TINTA + ';max-width:640px">'
    + '<p style="color:' + C.GRIS + ';font-size:11px;letter-spacing:.09em;text-transform:uppercase;margin:0 0 4px">'
    + esc_(eyebrow) + '</p>'
    + '<h2 style="margin:0 0 18px;font-size:21px;color:' + C.VERDE + '">' + esc_(titulo) + '</h2>'
    + inner + '</div>';
}

function dato_(label, valor) {
  return '<p style="margin:0 0 5px;font-size:13px"><span style="color:' + C.GRIS + '">'
    + esc_(label) + ':</span> <strong>' + esc_(valor) + '</strong></p>';
}

function bloque_(label, texto) {
  return '<div style="margin:14px 0 0;padding:11px 13px;background:#F6F5F0;border-radius:8px">'
    + '<p style="margin:0 0 4px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:'
    + C.GRIS + '">' + esc_(label) + '</p><p style="margin:0;font-size:13px;line-height:1.55">'
    + esc_(texto).replace(/\n/g, '<br>') + '</p></div>';
}

/* ───────────────── Formateo de datos ───────────────── */

function agrupar_(cart) {
  const out = {};
  (cart || []).forEach(function (l) {
    if (!out[l.service]) out[l.service] = [];
    out[l.service].push(l);
  });
  return out;
}

function etiquetaServicio_(id) { return SERVICIOS[id] || id; }

function casaLegible_(slug) {
  if (!slug) return '';
  return String(slug).split('-').map(function (w) {
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(' ');
}

/* El detalle visible de una línea: lo que el huésped eligió, en su idioma. Sale de
 * `options`, la bolsa de display. Los mismos hechos tipados viven en `data` y se
 * guardan íntegros en la pestaña Payload. */
function detalle_(l) {
  const partes = [];
  const o = l.options || {};
  for (const k in o) {
    if (k.charAt(0) === '_') continue;
    if (o[k] === '' || o[k] === null || o[k] === undefined) continue;
    partes.push(String(o[k]));
  }
  if (l.date) partes.push('Fecha: ' + l.date);
  return partes.join(' · ');
}

/*
 * Convierte el blob de preferencias de un servicio en filas legibles SIN perder
 * nada. Es genérico a propósito en vez de conocer cada clave: strings pasan, los
 * arrays se unen COMPLETOS (la lista de productos del Full Fridge son 40 ítems y es
 * literalmente la lista de compras — jamás un conteo) y los objetos se expanden
 * según su forma.
 */
function filasDePreferencias_(form) {
  if (!form || typeof form !== 'object') return [];
  const out = [];
  for (const k in form) {
    const v = form[k];
    const label = CAMPOS[k] || k;
    if (v === null || v === undefined || v === '') continue;

    if (Array.isArray(v)) {
      if (!v.length) continue;
      out.push([label + ' (' + v.length + ')', v.join(', ')]);
    } else if (typeof v === 'object') {
      const trozos = [];
      for (const k2 in v) {
        const v2 = v[k2];
        if (v2 === null || v2 === undefined || v2 === '') continue;
        if (Array.isArray(v2)) trozos.push(k2 + ': ' + v2.join(', '));
        else if (typeof v2 === 'object') trozos.push(k2 + ': ' + JSON.stringify(v2));
        else trozos.push(k2 + ': ' + v2);
      }
      if (trozos.length) out.push([label, trozos.join('   |   ')]);
    } else {
      out.push([label, String(v)]);
    }
  }
  return out;
}

function fecha_(d) { return Utilities.formatDate(d, CONFIG.TIMEZONE, 'yyyy-MM-dd'); }
function hora_(d) { return Utilities.formatDate(d, CONFIG.TIMEZONE, 'HH:mm'); }
function money_(n) { return '$' + Number(n || 0).toLocaleString('en-US'); }
function esc_(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ───────────────── Pruebas y mantenimiento ───────────────── */

/*
 * Fabrica un pedido completo y lo procesa como si viniera del sitio: tres
 * servicios, preferencias con todas las formas posibles, una línea por cotizar,
 * acentos y ñ. Es la forma de iterar sobre el FORMATO sin hacer un checkout real
 * en el navegador cada vez.
 *
 * Ejecutar → mirar el resultado en Drive → ajustar el código → implementación
 * nueva → repetir.
 */
function generarPedidoDePrueba() {
  const p = {
    schemaVersion: 2,
    submissionId: 'prueba-' + Utilities.getUuid(),
    createdAt: new Date().toISOString(),
    locale: 'es', source: 'web', currency: 'USD',
    guest: {
      reservationNumber: 'SB-PRUEBA-1',
      firstName: 'Ana', lastName: 'Rodríguez',
      email: '', phone: '+506 8888 8888',
      casa: 'casa-mango', checkInDate: '2026-12-02',
    },
    cart: [
      { lineId: 'private-chef:dinner:a1', service: 'private-chef', sku: 'dinner',
        title: 'Cena', titleEn: 'Dinner', kind: 'chef-service', qty: 1,
        unitPrice: 245, lineTotal: 245, byQuote: false, date: '2026-12-04',
        options: { guests: '6 personas' }, data: { guests: 6 } },
      { lineId: 'wellness-spa:deep:90', service: 'wellness-spa', sku: 'deep-tissue',
        title: 'Masaje de Tejido Profundo', titleEn: 'Deep Tissue Massage',
        kind: 'massage', qty: 2, unitPrice: 130, lineTotal: 260, byQuote: false,
        date: '', options: { duration: '90 min' }, data: { durationMin: 90 } },
      { lineId: 'transport:rav4', service: 'transport', sku: 'rav4',
        title: 'Toyota RAV4', titleEn: 'Toyota RAV4', kind: 'vehicle', qty: 1,
        unitPrice: 0, lineTotal: 0, byQuote: true, date: '2026-12-05',
        options: { days: '3 días' }, data: { days: 3 } },
    ],
    serviceForms: {
      'private-chef': {
        allergies: 'Alergia severa al maní',
        restrictions: { Vegetariano: 2, 'Sin gluten': 1 },
        dishes: { 'Día 1 — Cena': 'Pescado Entero · Casado' },
        notes: 'El chef puede llegar a las 5pm',
      },
      'wellness-spa': { allergies: 'Ninguna', notes: 'Preferimos por la tarde' },
    },
    totals: { itemCount: 4, subtotal: 505, quotePending: 1 },
    notes: 'Llegamos tarde el 2. Señal de teléfono limitada — mejor WhatsApp.',
  };
  Logger.log(procesarPedido_(p).getContent());
}

function generarSolicitudDePrueba() {
  const p = {
    schemaVersion: 2, type: 'request', source: 'kiosk',
    submissionId: 'prueba-' + Utilities.getUuid(),
    createdAt: new Date().toISOString(), locale: 'es',
    guest: { name: 'Juan Pérez', phone: '+506 7000 0000', casa: 'casa-ceiba' },
    request: { category: 'amenities', message: 'Faltan toallas en el baño de arriba.' },
  };
  Logger.log(procesarSolicitud_(p).getContent());
}

/* Borra el caché de ids. Usar solo si se movieron o renombraron a mano el maestro
 * o la carpeta Pedidos: el script los vuelve a buscar por nombre en el próximo
 * pedido y, si no están, los crea. */
function limpiarCache() {
  PropertiesService.getScriptProperties().deleteAllProperties();
  Logger.log('Caché de ids borrado.');
}

/* Diagnóstico: qué ve el script ahora mismo. */
function estado() {
  Logger.log('Carpeta raíz:    ' + carpetaRaiz_().getName());
  Logger.log('Carpeta Pedidos: ' + carpetaPedidos_().getName());
  const ss = maestro_();
  Logger.log('Maestro:         ' + ss.getName() + '  ' + ss.getUrl());
  Logger.log('Pestañas:        ' + ss.getSheets().map(function (h) { return h.getName(); }).join(', '));
  Logger.log('Zona horaria:    ' + Session.getScriptTimeZone());
  Logger.log('Cuota de correo: ' + MailApp.getRemainingDailyQuota());
  Logger.log('Secreto puesto:  ' + (CONFIG.SHARED_SECRET.indexOf('PEGAR') === -1));
}
