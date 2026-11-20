# Paso 4 — Activos de Google · briefing para un asistente

> **Cómo usar este archivo:** pégalo completo como primer mensaje en un chat nuevo de
> Claude. Está escrito para que ese asistente no necesite acceso al repositorio ni
> contexto previo. Al final hay una lista exacta de lo que debe devolverte.

---

## Contexto

Estoy construyendo el micrositio de bienvenida de **Arbórea Experiences**, un conjunto
de casas de alquiler en la Península de Osa, Costa Rica. Los huéspedes navegan
servicios internos (chef privado, llenado de refrigerador, spa, pesca), tours de
terceros y renta de vehículos, y envían **un solo pedido de concierge**. No se cobra
dinero en ningún punto: un pedido es una solicitud que operaciones confirma por
WhatsApp o correo.

El front-end está terminado. Falta conectar el backend, y el backend es **Google Apps
Script escribiendo en Google Sheets**. Tu trabajo es ayudarme a preparar los accesos de
Google. **No vas a escribir el código del Apps Script** — ese lo entrega otro
desarrollador en el paso siguiente.

**Este paso es deliberadamente mínimo.** Todo el formato y toda la estructura de las
hojas los genera el script automáticamente, y los vamos a ir ajustando hasta que nos
guste el resultado. No hay plantillas que construir a mano y no hay hojas que
maquetar. Lo único que se crea manualmente es **una carpeta** y **un proyecto de Apps
Script**.

### El modelo de datos

```
WelcomeOrders/                       ← se crea A MANO, una sola vez
├── Registro de Checkouts            ← el script la crea UNA vez; después
│     Un documento único para todo el negocio.   solo le AGREGA una fila
│     Una fila por cada checkout completado:     por cada checkout
│     fecha, hora, número de reserva, datos
│     del huésped y link a su archivo. SIN el
│     contenido del pedido.
│
└── Pedidos/                         ← el script la crea UNA vez
      ├── SB-10432 — Rodríguez — Casa Mango   ← una por reserva, la primera
      │     ├── Pedido 1                         vez que esa reserva pide
      │     ├── Pedido 2                      ← pestaña nueva si vuelve a pedir
      │     └── …
      └── SB-10988 — Pérez — Casa Ceiba
            └── Pedido 1
```

Un **archivo por número de reserva**, y dentro, una **pestaña por cada pedido**. El
número de reserva viene de **Simple Booking**, el PMS del cliente, y lo escribe el
huésped en el checkout. Si la misma reserva vuelve a pedir días después, el script
encuentra su archivo y le agrega una pestaña nueva.

La concierge abre el archivo de una reserva y ve, pestaña por pestaña, todo lo que esa
reserva pidió.

### Restricción importante

La cuenta dueña de todo esto debe ser la **cuenta de Google Workspace del cliente**,
no una cuenta personal ni de desarrollo. Los archivos que crea el script quedan a
nombre de quien lo despliega, y los pedidos del negocio no pueden vivir en una cuenta
ajena que algún día se cierre. Tengo acceso a esa cuenta y puedo configurarla.

---

## Lo que hay que crear (solo 2 cosas)

### 1 — La carpeta

Crear una carpeta llamada **`WelcomeOrders`** en la raíz del Drive de la cuenta del
cliente.

> **Recomendación:** si el Workspace tiene **unidades compartidas** (Shared Drives),
> crearla en la raíz de una unidad compartida en vez del Drive personal. Los archivos
> de una unidad compartida pertenecen a la organización y sobreviven si se cierra la
> cuenta de un empleado; los de un Drive personal se van con la cuenta. Funciona igual
> de las dos formas, así que es decisión del cliente — pero vale la pena preguntar.

No hay que crear nada dentro. La subcarpeta `Pedidos` y el documento maestro los crea
el script **la primera vez que corre, y una sola vez**: en los checkouts siguientes los
encuentra y les agrega información. No se crea una carpeta ni un maestro nuevo por
pedido — si en algún momento ves que aparecen duplicados, es un bug y hay que
reportarlo.

**Necesito de aquí:** el **ID de la carpeta**. Se saca de la URL al abrirla:
`https://drive.google.com/drive/folders/XXXXXXXXXXXX` → el ID es `XXXXXXXXXXXX`.

---

### 2 — El proyecto de Apps Script

1. Ir a [script.google.com](https://script.google.com) **con la cuenta del cliente** y
   crear un **proyecto nuevo e independiente** (no vinculado a ninguna hoja).
2. Nombrarlo **`Arborea — Orders Backend`**.
3. En **Configuración del proyecto**, poner la zona horaria en **America/Costa_Rica**.
   Si no, las fechas y horas de los pedidos van a salir corridas.
4. Pegar **este stub** como único contenido de `Código.gs`. No es el backend real:
   existe para disparar la pantalla de permisos de Google y comprobar que los accesos
   funcionan antes de que llegue el código de verdad.

```javascript
/* Stub temporal. El backend real llega en el paso 5 y reemplaza todo esto. */
const CONFIG = {
  FOLDER_ID: 'PEGAR_ID_DE_LA_CARPETA',
  TIMEZONE:  'America/Costa_Rica',
};

function doGet() {
  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, service: 'arborea-orders' }))
    .setMimeType(ContentService.MimeType.JSON);
}

/* Ejecutar ESTA función una vez a mano, desde el editor, para autorizar los permisos
 * y confirmar que el script puede hacer todo lo que necesita: leer la carpeta, crear
 * carpetas, crear hojas y enviar correo. Crea un par de archivos de prueba y los
 * borra al terminar. */
function verificarAccesos() {
  const carpeta = DriveApp.getFolderById(CONFIG.FOLDER_ID);
  Logger.log('Carpeta: ' + carpeta.getName());

  const subcarpeta = carpeta.createFolder('__prueba__');
  Logger.log('Puede crear subcarpetas: OK');

  const hoja = SpreadsheetApp.create('__prueba__');
  DriveApp.getFileById(hoja.getId()).moveTo(subcarpeta);
  hoja.getSheets()[0].getRange('A1').setValue('prueba');
  Logger.log('Puede crear y mover hojas: OK');

  const correo = Session.getEffectiveUser().getEmail();
  Logger.log('Cuenta efectiva: ' + correo);
  Logger.log('Cuota de correo restante hoy: ' + MailApp.getRemainingDailyQuota());

  /* Limpieza: deja la carpeta como estaba. */
  DriveApp.getFileById(hoja.getId()).setTrashed(true);
  subcarpeta.setTrashed(true);
  Logger.log('Limpieza: OK — todo listo.');
}
```

5. Rellenar `FOLDER_ID`.
6. Ejecutar **`verificarAccesos`** desde el editor. Google va a pedir permisos:
   - Aparecerá una advertencia de **"Google no ha verificado esta aplicación"**. Es
     normal y esperado para un script propio. Hay que entrar en **Configuración
     avanzada → Ir a Arborea — Orders Backend (no seguro)**.
   - Aceptar los permisos de **Drive**, **Hojas de cálculo** y **Gmail**.
7. Revisar el registro de ejecución. Debe terminar en `Limpieza: OK — todo listo.` Si
   falla antes, el mensaje de error dice exactamente qué permiso o acceso falta.
8. **Implementar → Nueva implementación → Aplicación web**, con:
   - Ejecutar como: **Yo** (la cuenta del cliente)
   - Quién tiene acceso: **Cualquier persona**
9. Copiar la **URL de la aplicación web** (termina en `/exec`).
10. Abrir esa URL en el navegador. Debe devolver
    `{"ok":true,"service":"arborea-orders"}`. Si pide iniciar sesión o da error, el
    paso 8 quedó mal configurado — revisar que "Quién tiene acceso" sea
    *Cualquier persona* y no *Cualquier persona con una cuenta de Google*.

> **Sobre "Cualquier persona":** suena permisivo y lo es, pero es necesario — el
> servidor que va a postear los pedidos no tiene identidad de Google. La protección
> real es un secreto compartido que vive en el servidor y que el navegador nunca ve,
> más validación dentro del script. No hay dinero en juego: el peor caso es ruido.

---

## Lo que tienes que devolverme

Pégame esto tal cual, relleno:

```
ID de la carpeta:      ...
URL de la app web:     https://script.google.com/macros/s/.../exec
Cuenta efectiva:       ...          (el correo que imprimió verificarAccesos)
Tipo de cuenta:        Workspace de pago / Gmail gratuito
Cuota de correo:       ...          (el número que imprimió verificarAccesos)
¿La carpeta quedó en una unidad compartida o en el Drive personal?
Correos de notificación para operaciones:  ...
Registro completo de verificarAccesos (pegar tal cual)
```

Y las dos preguntas abiertas, si logras averiguarlas:

1. **¿Qué formato tiene el número de reserva de Simple Booking?** ¿Solo dígitos, lleva
   prefijo de letras, longitud fija? Con eso se valida el campo en el checkout y se
   atrapan dedazos al escribir. No bloquea nada, pero cada dedazo que no se atrapa
   crea un archivo duplicado para una reserva que ya existía, y la concierge puede
   terminar viendo solo la mitad del pedido.
2. **¿El cliente tiene acceso a la API de Simple Booking?** Si la hay, más adelante se
   puede validar el número contra el PMS y traer la casa y la fecha de ingreso
   automáticamente en vez de pedírselas al huésped. Eso elimina el problema de los
   dedazos de raíz.

---

## Errores que cuestan tiempo

- **Un Apps Script Web App necesita una implementación NUEVA para que un cambio de
  código surta efecto.** Guardar el script no basta. Es la forma más común de perder
  media hora depurando la capa equivocada. En las siguientes se usa **Administrar
  implementaciones → (editar) → Versión: Nueva**.
- **La zona horaria** del proyecto tiene que ser Costa Rica (paso 3), o las fechas de
  los pedidos saldrán con el día corrido.
- **No crear nada dentro de la carpeta.** La subcarpeta `Pedidos` y el documento
  maestro los crea el script la primera vez y los vuelve a encontrar **por nombre** en
  cada checkout siguiente. Un archivo creado a mano con un nombre parecido
  (`Pedidos 2`, `Registro de Checkouts copia`) puede confundirlo y hacer que escriba en
  el lugar equivocado. **No renombrar ni mover** esos dos una vez creados.
- **No confundir "Cualquier persona" con "Cualquier persona con una cuenta de
  Google".** La segunda rompe el envío.

## Qué NO hay que hacer en este paso

- No escribir la lógica del backend (`doPost`, escritura en las hojas, correos de
  notificación, formato de las celdas). Eso es el paso 5 y lo entrega el otro
  desarrollador.
- No crear plantillas, ni maquetar hojas, ni definir columnas. **Todo el formato lo
  genera el script** y se va a ajustar iterando sobre el código hasta que el resultado
  guste. Si en algún momento te piden "preparar la hoja", la respuesta es que no hace
  falta.
- No crear hojas por reserva a mano. Las crea el script.
- No configurar nada en Vercel ni tocar el DNS — ese es otro paso, en paralelo.
