/* ============================================================================
 * PASO 4 — Stub temporal de verificación de accesos.
 *
 * Este NO es el backend. Existe para dos cosas:
 *   1. Disparar la pantalla de permisos de Google y dejarlos autorizados.
 *   2. Comprobar, antes de que llegue el código real, que la cuenta puede hacer
 *      todo lo que el backend necesitará: leer la carpeta, crear subcarpetas,
 *      crear y mover hojas, y enviar correo.
 *
 * El backend real llega en el paso 5 y reemplaza todo este archivo.
 * (La implementación anterior de este archivo — un solo SHEET_ID con pestañas
 * Orders/Log — quedó obsoleta al cambiar al modelo de un archivo por reserva.
 * Está en git, commit 2bdc081, si hace falta consultarla.)
 *
 * Instrucciones:
 *   - Pegar como único contenido de `Código.gs` en el proyecto de Apps Script.
 *   - Ejecutar `verificarAccesos` una vez a mano desde el editor.
 *   - Copiar el registro de ejecución completo y devolverlo.
 *
 * FOLDER_ID apunta a la carpeta `WelcomeOrders` en Mi unidad de
 * concierge@arboreaexperiences.com, creada a mano en el paso 4.
 * ========================================================================== */

const CONFIG = {
  FOLDER_ID: '18K4EYRvXwBcvR9QEMsoQphYG1SnJFJLc',
  TIMEZONE:  'America/Costa_Rica',
};

function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, service: 'arborea-orders' }))
    .setMimeType(ContentService.MimeType.JSON);
}

/* Ejecutar ESTA función una vez a mano, desde el editor.
 * Crea un par de archivos de prueba y los borra al terminar: deja la carpeta
 * exactamente como estaba. */
function verificarAccesos() {
  let subcarpeta = null;
  let hoja = null;

  try {
    /* --- 1. Zona horaria -------------------------------------------------
     * Se verifica primero porque es el error más fácil de cometer (olvidar el
     * paso 3 de la guía) y el más difícil de notar después: el script corre
     * perfecto y las fechas de los pedidos salen con el día corrido. */
    const tz = Session.getScriptTimeZone();
    Logger.log('Zona horaria del proyecto: ' + tz);
    if (tz !== CONFIG.TIMEZONE) {
      Logger.log('*** ATENCION: la zona horaria deberia ser ' + CONFIG.TIMEZONE + '.');
      Logger.log('*** Corregir en Configuracion del proyecto antes de seguir.');
    } else {
      Logger.log('Zona horaria: OK');
    }
    Logger.log('Fecha/hora de ejemplo con esa zona: ' +
      Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm:ss'));

    /* --- 2. Identidad de la cuenta --------------------------------------
     * Los archivos que cree el script quedarán a nombre de esta cuenta. Tiene
     * que ser la del cliente, no una personal ni de desarrollo. */
    const correo = Session.getEffectiveUser().getEmail();
    Logger.log('Cuenta efectiva: ' + correo);

    /* --- 3. Lectura de la carpeta --------------------------------------- */
    const carpeta = DriveApp.getFolderById(CONFIG.FOLDER_ID);
    Logger.log('Carpeta: ' + carpeta.getName());
    Logger.log('URL de la carpeta: ' + carpeta.getUrl());

    /* Dónde vive la carpeta. Una carpeta en la raíz de una unidad compartida no
     * reporta padres; una en el Drive personal reporta "Mi unidad" o la carpeta
     * que la contiene. Sirve para contestar la pregunta de la entrega sin tener
     * que adivinar. */
    const padres = carpeta.getParents();
    if (padres.hasNext()) {
      Logger.log('Carpeta contenedora: ' + padres.next().getName());
    } else {
      Logger.log('Carpeta contenedora: ninguna (raiz de Mi unidad o de una unidad compartida)');
    }

    /* Debería estar vacía en este punto. Si ya tiene contenido, alguien creó
     * cosas a mano — justo lo que la guía pide no hacer, porque el script
     * encuentra `Pedidos` y el maestro POR NOMBRE. */
    if (carpeta.getFiles().hasNext() || carpeta.getFolders().hasNext()) {
      Logger.log('*** ATENCION: la carpeta no esta vacia.');
      Logger.log('*** El script busca "Pedidos" y "Registro de Checkouts" por nombre.');
      Logger.log('*** Revisar que no haya nada creado a mano con nombres parecidos.');
    } else {
      Logger.log('Carpeta vacia, como debe estar: OK');
    }

    /* --- 4. Crear subcarpetas ------------------------------------------- */
    subcarpeta = carpeta.createFolder('__prueba__');
    Logger.log('Puede crear subcarpetas: OK');

    /* --- 5. Crear, mover y escribir hojas -------------------------------
     * SpreadsheetApp.create() siempre nace en la raíz del Drive; el backend
     * tendrá que moverla, igual que aquí. Este es el paso que falla si la
     * carpeta vive en una unidad compartida con permisos restringidos. */
    hoja = SpreadsheetApp.create('__prueba__');
    DriveApp.getFileById(hoja.getId()).moveTo(subcarpeta);
    hoja.getSheets()[0].getRange('A1').setValue('prueba');
    Logger.log('Puede crear, mover y escribir hojas: OK');

    /* --- 6. Correo -------------------------------------------------------
     * No envía nada: solo confirma que el permiso está concedido y que queda
     * cuota. Workspace de pago da 1500/dia; Gmail gratuito, 100. */
    Logger.log('Cuota de correo restante hoy: ' + MailApp.getRemainingDailyQuota());

  } catch (err) {
    Logger.log('*** FALLO: ' + err.message);
    Logger.log('*** El mensaje de arriba dice exactamente que permiso o acceso falta.');
    throw err;

  } finally {
    /* Limpieza en `finally` para que los archivos de prueba no queden tirados
     * si algo falla a mitad de camino. */
    if (hoja) {
      try { DriveApp.getFileById(hoja.getId()).setTrashed(true); } catch (e) {}
    }
    if (subcarpeta) {
      try { subcarpeta.setTrashed(true); } catch (e) {}
    }
    Logger.log('Limpieza: OK — todo listo.');
  }
}
