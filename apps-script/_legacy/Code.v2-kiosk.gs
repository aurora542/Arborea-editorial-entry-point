/* ============================================================================
 * SUPERSEDED — conservado solo como referencia. NO desplegar.
 *
 * Backend que trajo la rama kiosk-v2. Funciona y está completo, pero implementa
 * el modelo de Drive que el dueño de producto reemplazó: UN solo Sheet para todo
 * el negocio con pestañas Pedidos / Pedidos — Ítems / Solicitudes / Log.
 *
 * El modelo vigente es un ARCHIVO POR RESERVA con una pestaña por pedido
 * (docs/ORDERS-BACKEND.md §5), y el cliente ya creó la carpeta para ese modelo.
 *
 * Lo que sí se reutiliza de aquí en el backend vigente: las plantillas de correo
 * (emailShell_, row_, block_), la validación por tipo y el patrón de dedupe.
 * ========================================================================== */

/**
 * Arbórea — Backend de pedidos y solicitudes de huéspedes
 * welcome.arboreaexperiences.com  →  Apps Script Web App  →  Sheet + Drive + email
 *
 * Backend del CONCIERGE (welcome). Independiente del Code.gs de ops.arboreaexperiences.com.
 * Sustituye el borrador apps-script/Code.gs de ESTE repo (nunca desplegado; ver ORDERS-BACKEND.md §1).
 * Contrato: docs/ORDERS-BACKEND.md §4, extendido en HANDOFF_KIOSK_CASA_CEIBA.md §4.
 *
 * Tipos de envío que acepta doPost:
 *   1. Pedido (contrato actual):      { submissionId, guest, cart[], serviceForms, totals, ... }
 *        - source "web"   → guest.firstName/lastName/email/phone/casa obligatorios
 *        - source "kiosk" → guest.name + guest.casa obligatorios, guest.phone opcional
 *   2. Solicitud del kiosk:           { type: "request", submissionId, guest, request: { category, message } }
 *   3. Pedido legado (payload plano): { service, name, casa, dateNeeded, items[] }
 *        Se acepta por una versión: el sitio es estático y un bundle viejo cacheado puede seguir enviándolo.
 *
 * ── INSTALACIÓN (una sola vez, con la cuenta operations@arboreaexperiences.com) ──
 *   1. Drive → carpeta "APP - Welcome" → Nuevo → Más → Google Apps Script → pegar este archivo completo.
 *   2. Revisar CONFIG.NOTIFY_EMAILS.
 *   3. Ejecutar setup() y autorizar. Crea el Sheet, la carpeta de Drive y el secreto,
 *      y los guarda en Propiedades del script. Copiar el secreto que aparece en el
 *      registro (Ver → Registros) — se usa como NEXT_PUBLIC_ORDERS_SHARED_SECRET.
 *      No hace falta transcribir IDs: quedan guardados en el script.
 *   4. Ejecutar testKioskRequest() y testKioskOrder(): deben aparecer filas y llegar emails.
 *   5. Implementar → Nueva implementación → Aplicación web
 *        Ejecutar como: Yo (operations@)   ·   Quién tiene acceso: Cualquier usuario
 *      Copiar la URL /exec → NEXT_PUBLIC_ORDERS_BACKEND_URL.
 *   6. Cambios futuros: Administrar implementaciones → editar la existente → Nueva versión.
 *      NO crear una implementación nueva (cambia la URL /exec).
 */

const CONFIG = {
  // Carpeta "APP - Welcome" en Drive. setup() crea ahí el Sheet y la carpeta de JSON.
  // Vacío = se crean en la raíz de Mi unidad.
  PARENT_FOLDER_ID: '',
  TIMEZONE: 'America/Costa_Rica',
  NOTIFY_EMAILS: ['operations@arboreaexperiences.com', 'concierge@arboreaexperiences.com'],
  SPREADSHEET_NAME: 'Arbórea — Pedidos y solicitudes de huéspedes',
  FOLDER_NAME: 'Arbórea — Pedidos huéspedes (JSON)',
  TABS: {
    ORDERS: 'Pedidos',
    ITEMS: 'Pedidos — Ítems',
    REQUESTS: 'Solicitudes',
    LOG: 'Log',
  },
  STATUS_VALUES: ['Nuevo', 'En proceso', 'Resuelto', 'Cancelado'],
};

/* Etiquetas en español para el equipo. Los ids salen de KIOSK_CONFIG.requestCategories
 * en el front. Un id desconocido no rompe nada: se muestra tal cual. */
const REQUEST_LABELS = {
  cleaning: 'Limpieza extra',
  amenities: 'Reposición de amenities',
  electricity: 'Electricidad',
  wildlife: 'Insectos o animales',
  checkout: 'Check-out tardío o check-in temprano',
  concierge: 'Recomendación o reserva',
  message: 'Mensaje libre',
};

const SERVICE_LABELS = {
  'private-chef': 'Chef privado',
  'full-fridge': 'Full fridge',
  'wellness-spa': 'Spa y bienestar',
  'fishing-tours': 'Pesca',
  tours: 'Tours',
  transport: 'Vehículos',
};

/* ─────────────────────────── Entradas HTTP ─────────────────────────── */

function doGet() {
  return json_({ ok: true, service: 'arborea-guest-orders', ts: new Date().toISOString() });
}

function doPost(e) {
  let payload;
  try {
    payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'bad-json' });
  }

  const props = getProps_();
  if (!props.secret || payload.secret !== props.secret) {
    return json_({ ok: false, error: 'unauthorized' });
  }

  const kind = detectKind_(payload);
  const invalid = validate_(kind, payload);
  if (invalid) return json_({ ok: false, error: invalid });

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(30000);
  } catch (err) {
    return json_({ ok: false, error: 'busy-retry' });
  }

  try {
    const ss = SpreadsheetApp.openById(props.sheetId);

    if (isProcessed_(ss, payload.submissionId)) {
      return json_({ ok: true, submissionId: payload.submissionId, dedup: true });
    }

    const stamp = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
    const fileUrl = saveJson_(props.folderId, kind, payload);

    if (kind === 'request') writeRequest_(ss, payload, stamp, fileUrl);
    else if (kind === 'order') writeOrder_(ss, payload, stamp, fileUrl);
    else writeLegacyOrder_(ss, payload, stamp, fileUrl);

    let mailStatus = 'ok';
    try {
      if (kind === 'request') mailRequest_(payload, stamp, fileUrl);
      else if (kind === 'order') mailOrder_(payload, stamp, fileUrl);
      else mailLegacy_(payload, stamp);
    } catch (err) {
      mailStatus = 'error: ' + String(err).slice(0, 200);
    }

    markProcessed_(ss, payload.submissionId, kind, stamp, mailStatus);
    return json_({ ok: true, submissionId: payload.submissionId });
  } catch (err) {
    return json_({ ok: false, error: String(err).slice(0, 300) });
  } finally {
    lock.releaseLock();
  }
}

/* ─────────────────────────── Clasificación y validación ─────────────────────────── */

function detectKind_(p) {
  if (p.type === 'request') return 'request';
  if (Array.isArray(p.cart)) return 'order';
  if (p.service && Array.isArray(p.items)) return 'legacy';
  return 'unknown';
}

function validate_(kind, p) {
  if (!p.submissionId) return 'missing-submissionId';
  const g = p.guest || {};

  if (kind === 'request') {
    if (!str_(g.name)) return 'missing-guest-name';
    if (!str_(g.casa)) return 'missing-casa';
    const r = p.request || {};
    if (!str_(r.category)) return 'missing-category';
    if (r.category === 'message' && !str_(r.message)) return 'missing-message';
    return null;
  }

  if (kind === 'order') {
    if (!p.cart.length) return 'empty-cart';
    if (p.source === 'kiosk') {
      if (!str_(g.name)) return 'missing-guest-name';
      if (!str_(g.casa)) return 'missing-casa';
      return null;
    }
    const required = ['firstName', 'lastName', 'email', 'phone', 'casa'];
    for (let i = 0; i < required.length; i++) {
      if (!str_(g[required[i]])) return 'missing-guest-' + required[i];
    }
    return null;
  }

  if (kind === 'legacy') {
    if (!p.name || !p.casa) return 'missing-legacy-fields';
    return null;
  }

  return 'unknown-payload';
}

/* ─────────────────────────── Escritura en el Sheet ─────────────────────────── */

const ORDER_HEADERS = [
  'Fecha y hora', 'ID', 'Origen', 'Casa', 'Nombre', 'Email', 'Teléfono / WhatsApp',
  'Servicios', 'Ítems', 'Total estimado (USD)', 'Notas', 'Idioma', 'JSON completo', 'Estado',
];

const ITEM_HEADERS = [
  'Fecha y hora', 'ID pedido', 'Casa', 'Servicio', 'SKU', 'Título', 'Cantidad',
  'Precio unitario', 'Total línea', 'Fecha preferida', 'Opciones',
];

const REQUEST_HEADERS = [
  'Fecha y hora', 'ID', 'Origen', 'Casa', 'Nombre', 'WhatsApp', 'Categoría',
  'Mensaje', 'Idioma', 'JSON completo', 'Estado',
];

function writeOrder_(ss, p, stamp, fileUrl) {
  const g = p.guest || {};
  const services = uniq_(p.cart.map(function (l) { return l.service; }))
    .map(serviceLabel_).join(', ');
  const totals = p.totals || {};

  appendWithStatus_(ensureTab_(ss, CONFIG.TABS.ORDERS, ORDER_HEADERS), [
    stamp,
    p.submissionId,
    p.source || 'web',
    casaLabel_(g.casa),
    guestName_(g),
    g.email || '',
    g.phone || '',
    services,
    totals.itemCount != null ? totals.itemCount : p.cart.length,
    totals.total != null ? totals.total : '',
    p.notes || '',
    p.locale || '',
    fileUrl,
    CONFIG.STATUS_VALUES[0],
  ]);

  const itemsSheet = ensureTab_(ss, CONFIG.TABS.ITEMS, ITEM_HEADERS);
  const rows = p.cart.map(function (l) {
    return [
      stamp, p.submissionId, casaLabel_(g.casa), serviceLabel_(l.service), l.sku || '',
      l.title || '', l.qty || '', l.unitPrice || '', l.lineTotal || '', l.date || '',
      l.options && Object.keys(l.options).length ? JSON.stringify(l.options) : '',
    ];
  });
  if (rows.length) {
    itemsSheet.getRange(itemsSheet.getLastRow() + 1, 1, rows.length, ITEM_HEADERS.length).setValues(rows);
  }
}

function writeRequest_(ss, p, stamp, fileUrl) {
  const g = p.guest || {};
  const r = p.request || {};
  appendWithStatus_(ensureTab_(ss, CONFIG.TABS.REQUESTS, REQUEST_HEADERS), [
    stamp,
    p.submissionId,
    p.source || 'kiosk',
    casaLabel_(g.casa),
    g.name || '',
    g.phone || '',
    requestLabel_(r.category),
    r.message || '',
    p.locale || '',
    fileUrl,
    CONFIG.STATUS_VALUES[0],
  ]);
}

function writeLegacyOrder_(ss, p, stamp, fileUrl) {
  const items = (p.items || []).map(function (it) {
    return it.price ? it.label + ' ($' + it.price + ')' : it.label;
  });
  appendWithStatus_(ensureTab_(ss, CONFIG.TABS.ORDERS, ORDER_HEADERS), [
    stamp, p.submissionId, 'web (legado)', casaLabel_(p.casa), p.name || '', '', '',
    p.service || '', items.length, p.total || '',
    [p.dateNeeded ? 'Fecha requerida: ' + p.dateNeeded : '', items.join(' · '), p.notes || '']
      .filter(Boolean).join('\n'),
    '', fileUrl, CONFIG.STATUS_VALUES[0],
  ]);
}

/* Agrega la fila y le pone el desplegable de Estado a la última columna. */
function appendWithStatus_(sheet, row) {
  sheet.appendRow(row);
  const r = sheet.getLastRow();
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(CONFIG.STATUS_VALUES, true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(r, row.length).setDataValidation(rule);
}

function ensureTab_(ss, name, headers) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 150);
    sheet.setColumnWidth(2, 260);
  }
  return sheet;
}

/* ─────────────────────────── Dedupe (Log) ─────────────────────────── */

function isProcessed_(ss, submissionId) {
  const sheet = ensureTab_(ss, CONFIG.TABS.LOG, ['ID', 'Tipo', 'Procesado el', 'Email']);
  if (sheet.getLastRow() < 2) return false;
  return Boolean(
    sheet.getRange('A2:A' + sheet.getLastRow())
      .createTextFinder(String(submissionId))
      .matchEntireCell(true)
      .findNext()
  );
}

function markProcessed_(ss, submissionId, kind, stamp, mailStatus) {
  ensureTab_(ss, CONFIG.TABS.LOG, ['ID', 'Tipo', 'Procesado el', 'Email'])
    .appendRow([submissionId, kind, stamp, mailStatus]);
}

/* ─────────────────────────── Drive: JSON íntegro ─────────────────────────── */

function saveJson_(folderId, kind, p) {
  const clean = JSON.parse(JSON.stringify(p));
  delete clean.secret;
  const casa = (clean.guest && clean.guest.casa) || clean.casa || 'sin-casa';
  const name = [kind, casa, p.submissionId].join('_') + '.json';
  const file = DriveApp.getFolderById(folderId)
    .createFile(name, JSON.stringify(clean, null, 2), 'application/json');
  return file.getUrl();
}

/* ─────────────────────────── Emails al front desk ─────────────────────────── */

function mailRequest_(p, stamp, fileUrl) {
  const g = p.guest || {};
  const r = p.request || {};
  const label = requestLabel_(r.category);
  const casa = casaLabel_(g.casa);

  const html = emailShell_(
    'Solicitud desde la tablet · ' + casa,
    label,
    [
      row_('Huésped', g.name),
      row_('Casa', casa),
      row_('WhatsApp', g.phone ? waLink_(g.phone, casa) : 'No lo dejó — responder en persona o llamando a la casa'),
      row_('Enviado', stamp + ' (CR)'),
    ].join('')
      + (r.message ? block_('Mensaje', r.message) : '')
      + footer_(fileUrl)
  );

  MailApp.sendEmail({
    to: CONFIG.NOTIFY_EMAILS.join(','),
    subject: '[' + casa + '] ' + label + ' — ' + (g.name || 'Huésped'),
    htmlBody: html,
    name: 'Arbórea · Huéspedes',
  });
}

function mailOrder_(p, stamp, fileUrl) {
  const g = p.guest || {};
  const casa = casaLabel_(g.casa);
  const name = guestName_(g);
  const isKiosk = p.source === 'kiosk';

  // Agrupar líneas por servicio
  const groups = {};
  p.cart.forEach(function (l) {
    (groups[l.service] = groups[l.service] || []).push(l);
  });

  let body = [
    row_('Huésped', name),
    row_('Casa', casa),
    row_('Origen', isKiosk ? 'Tablet de la casa' : 'Sitio web'),
    g.email ? row_('Email', g.email) : '',
    row_('Teléfono / WhatsApp', g.phone ? waLink_(g.phone, casa) : 'No lo dejó'),
    row_('Enviado', stamp + ' (CR)'),
  ].join('');

  Object.keys(groups).forEach(function (service) {
    const lines = groups[service];
    let rows = '';
    lines.forEach(function (l) {
      const extra = [l.date ? 'Fecha: ' + l.date : '', optionsText_(l.options)].filter(Boolean).join(' · ');
      rows += '<tr>'
        + td_(escape_(l.title) + (extra ? '<br><span style="color:#7D8584;font-size:12px">' + escape_(extra) + '</span>' : ''))
        + td_(String(l.qty || 1), 'center')
        + td_(money_(l.lineTotal), 'right')
        + '</tr>';
    });
    body += '<h3 style="margin:24px 0 8px;font-size:15px">' + escape_(serviceLabel_(service)) + '</h3>'
      + '<table style="width:100%;border-collapse:collapse">' + rows + '</table>';

    const form = p.serviceForms && p.serviceForms[service];
    if (form && Object.keys(form).length) {
      body += '<div style="margin:8px 0 0;padding:10px 12px;background:#F4F1EA;border-radius:6px;font-size:13px">'
        + '<strong>Preferencias</strong><br>' + formText_(form) + '</div>';
    }
  });

  const totals = p.totals || {};
  body += '<p style="margin:20px 0 0;font-size:15px"><strong>Total estimado: ' + money_(totals.total) + '</strong>'
    + ' <span style="color:#7D8584;font-size:12px">(sujeto a confirmación)</span></p>'
    + (p.notes ? block_('Notas del huésped', p.notes) : '')
    + footer_(fileUrl);

  const services = Object.keys(groups).map(serviceLabel_).join(', ');
  MailApp.sendEmail({
    to: CONFIG.NOTIFY_EMAILS.join(','),
    subject: '[' + casa + '] Pedido' + (isKiosk ? ' desde la tablet' : '') + ': ' + services + ' — ' + name,
    htmlBody: emailShell_(isKiosk ? 'Pedido desde la tablet · ' + casa : 'Pedido web · ' + casa, services, body),
    name: 'Arbórea · Huéspedes',
  });
}

function mailLegacy_(p, stamp) {
  const items = (p.items || []).map(function (it) {
    return escape_(it.label) + (it.price ? ' — ' + money_(it.price) : '');
  }).join('<br>');
  MailApp.sendEmail({
    to: CONFIG.NOTIFY_EMAILS.join(','),
    subject: '[' + casaLabel_(p.casa) + '] Pedido (formato viejo): ' + (p.service || '') + ' — ' + (p.name || ''),
    htmlBody: emailShell_('Pedido web (formato viejo)', p.service || '',
      row_('Huésped', p.name) + row_('Casa', casaLabel_(p.casa)) + row_('Fecha requerida', p.dateNeeded)
      + row_('Enviado', stamp + ' (CR)') + block_('Ítems', items, true)
      + (p.notes ? block_('Notas', p.notes) : '')),
    name: 'Arbórea · Huéspedes',
  });
}

/* ─────────────────────────── Helpers de email ─────────────────────────── */

function emailShell_(eyebrow, title, inner) {
  return '<div style="font-family:Arial,Helvetica,sans-serif;color:#222E2C;max-width:640px">'
    + '<p style="color:#7D8584;font-size:12px;letter-spacing:.08em;text-transform:uppercase;margin:0 0 4px">'
    + escape_(eyebrow) + '</p>'
    + '<h2 style="margin:0 0 16px;font-size:20px">' + escape_(title) + '</h2>'
    + inner + '</div>';
}

function row_(label, value) {
  if (value == null || value === '') return '';
  return '<p style="margin:0 0 4px;font-size:14px"><strong>' + escape_(label) + ':</strong> '
    + (String(value).indexOf('<a ') === 0 ? value : escape_(value)) + '</p>';
}

function block_(label, text, isHtml) {
  return '<p style="margin:16px 0 0;font-size:14px"><strong>' + escape_(label) + ':</strong><br>'
    + (isHtml ? text : escape_(text).replace(/\n/g, '<br>')) + '</p>';
}

function td_(html, align) {
  return '<td style="padding:6px 10px;border-bottom:1px solid #eee;font-size:13px;text-align:'
    + (align || 'left') + '">' + html + '</td>';
}

function footer_(fileUrl) {
  return '<p style="margin:24px 0 0;font-size:12px;color:#7D8584">Actualizar el estado en el Sheet. '
    + 'Registro completo: <a href="' + fileUrl + '">JSON en Drive</a></p>';
}

/* wa.me con mensaje inicial, para que el front desk responda con un toque.
 * 8 dígitos = número de Costa Rica sin prefijo → se le agrega 506. */
function waLink_(phone, casa) {
  let digits = String(phone).replace(/\D/g, '');
  if (digits.length === 8) digits = '506' + digits;
  const text = encodeURIComponent('Hola, le escribimos de Arbórea sobre su solicitud en ' + casa + '.');
  return '<a href="https://wa.me/' + digits + '?text=' + text + '">' + escape_(phone) + ' — responder por WhatsApp</a>';
}

function optionsText_(options) {
  if (!options || typeof options !== 'object') return '';
  return Object.keys(options).map(function (k) { return k + ': ' + options[k]; }).join(', ');
}

/* Render legible y genérico de serviceForms (objetos, arreglos y conteos anidados). */
function formText_(obj, depth) {
  depth = depth || 0;
  return Object.keys(obj).map(function (k) {
    const v = obj[k];
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) return '';
    let val;
    if (Array.isArray(v)) val = escape_(v.join(', '));
    else if (typeof v === 'object') val = '<br>' + formText_(v, depth + 1);
    else val = escape_(String(v));
    return '<span style="padding-left:' + (depth * 12) + 'px">' + escape_(k) + ': ' + val + '</span>';
  }).filter(Boolean).join('<br>');
}

/* ─────────────────────────── Helpers generales ─────────────────────────── */

function getProps_() {
  const p = PropertiesService.getScriptProperties();
  return {
    sheetId: p.getProperty('SHEET_ID'),
    folderId: p.getProperty('FOLDER_ID'),
    secret: p.getProperty('SHARED_SECRET'),
  };
}

function guestName_(g) {
  return str_(g.name) || [g.firstName, g.lastName].filter(Boolean).join(' ');
}

/* "casa-ceiba" → "Casa Ceiba" */
function casaLabel_(slug) {
  if (!slug) return '';
  return String(slug).split('-').map(function (w) {
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(' ');
}

function serviceLabel_(id) { return SERVICE_LABELS[id] || id || ''; }
function requestLabel_(id) { return REQUEST_LABELS[id] || id || ''; }

function money_(n) {
  const v = Number(n);
  return Number.isFinite(v) ? '$' + v.toLocaleString('en-US') : '—';
}

function str_(v) { return typeof v === 'string' ? v.trim() : ''; }

function uniq_(arr) {
  return arr.filter(function (v, i) { return arr.indexOf(v) === i; });
}

function escape_(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ─────────────────────────── Instalación y pruebas ─────────────────────────── */

/** Ejecutar una vez. Es idempotente: si ya existe algo, lo reutiliza. */
function setup() {
  const props = PropertiesService.getScriptProperties();

  const parent = CONFIG.PARENT_FOLDER_ID
    ? DriveApp.getFolderById(CONFIG.PARENT_FOLDER_ID)
    : DriveApp.getFileById(ScriptApp.getScriptId()).getParents().next();

  let sheetId = props.getProperty('SHEET_ID');
  if (!sheetId) {
    // Si el script está vinculado a un Sheet, usar ese; si no, crear uno nuevo.
    const active = SpreadsheetApp.getActiveSpreadsheet();
    sheetId = active ? active.getId() : SpreadsheetApp.create(CONFIG.SPREADSHEET_NAME).getId();
    if (!active && parent) DriveApp.getFileById(sheetId).moveTo(parent);
    props.setProperty('SHEET_ID', sheetId);
  }

  let folderId = props.getProperty('FOLDER_ID');
  if (!folderId) {
    folderId = (parent ? parent.createFolder(CONFIG.FOLDER_NAME) : DriveApp.createFolder(CONFIG.FOLDER_NAME)).getId();
    props.setProperty('FOLDER_ID', folderId);
  }

  let secret = props.getProperty('SHARED_SECRET');
  if (!secret) {
    secret = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
    props.setProperty('SHARED_SECRET', secret);
  }

  const ss = SpreadsheetApp.openById(sheetId);
  ensureTab_(ss, CONFIG.TABS.REQUESTS, REQUEST_HEADERS);
  ensureTab_(ss, CONFIG.TABS.ORDERS, ORDER_HEADERS);
  ensureTab_(ss, CONFIG.TABS.ITEMS, ITEM_HEADERS);
  ensureTab_(ss, CONFIG.TABS.LOG, ['ID', 'Tipo', 'Procesado el', 'Email']);

  // Borrar la hoja vacía por defecto que crea SpreadsheetApp.create
  ss.getSheets().forEach(function (s) {
    const known = Object.keys(CONFIG.TABS).map(function (k) { return CONFIG.TABS[k]; });
    if (known.indexOf(s.getName()) === -1 && s.getLastRow() === 0 && ss.getSheets().length > 1) {
      ss.deleteSheet(s);
    }
  });

  Logger.log('Sheet:   ' + ss.getUrl());
  Logger.log('Carpeta: ' + DriveApp.getFolderById(folderId).getUrl());
  Logger.log('NEXT_PUBLIC_ORDERS_SHARED_SECRET=' + secret);
}

function testKioskRequest() {
  runTest_({
    type: 'request',
    source: 'kiosk',
    submissionId: 'test-' + Utilities.getUuid(),
    createdAt: new Date().toISOString(),
    locale: 'es',
    guest: { name: 'Prueba Kiosk', phone: '', casa: 'casa-ceiba' },
    request: { category: 'amenities', message: 'Se acabó el café y el papel higiénico.' },
  });
}

function testKioskOrder() {
  runTest_({
    source: 'kiosk',
    submissionId: 'test-' + Utilities.getUuid(),
    createdAt: new Date().toISOString(),
    locale: 'es',
    currency: 'USD',
    guest: { name: 'Prueba Kiosk', phone: '8888 8888', casa: 'casa-ceiba' },
    cart: [{
      lineId: 'wellness-spa:massage-deep-tissue:90-min', service: 'wellness-spa',
      sku: 'massage-deep-tissue', title: 'Deep Tissue Massage', qty: 2, unitPrice: 130,
      lineTotal: 260, date: '', options: { duration: '90 min' },
    }],
    serviceForms: { 'wellness-spa': { allergies: 'Ninguna' } },
    totals: { itemCount: 2, subtotal: 260, total: 260 },
    notes: 'Pedido de prueba desde testKioskOrder().',
  });
}

function testWebOrder() {
  runTest_({
    source: 'web',
    submissionId: 'test-' + Utilities.getUuid(),
    createdAt: new Date().toISOString(),
    locale: 'en',
    currency: 'USD',
    guest: { firstName: 'Ana', lastName: 'Prueba', email: 'ana@example.com', phone: '+506 8888 8888', casa: 'casa-mango' },
    cart: [{
      lineId: 'private-chef:dinner:1', service: 'private-chef', sku: 'dinner', title: 'Dinner',
      qty: 1, unitPrice: 120, lineTotal: 120, date: '2026-10-10', options: {},
    }],
    serviceForms: { 'private-chef': { restrictions: { Vegetarian: 1 }, allergies: '' } },
    totals: { itemCount: 1, subtotal: 120, total: 120 },
    notes: '',
  });
}

function runTest_(payload) {
  payload.secret = getProps_().secret;
  const out = doPost({ postData: { contents: JSON.stringify(payload) } });
  Logger.log(out.getContent());
}
