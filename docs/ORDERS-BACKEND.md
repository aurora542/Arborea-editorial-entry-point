# Orders backend — plan de conexión

**Léelo antes de tocar el carrito, el checkout o el envío del pedido.**

Última actualización: 2026-11-19 · Estado: **front listo, backend por conectar**

Las secciones 1–8 son el plan vigente. La sección 9 es el log histórico — se le
añade, no se reescribe.

---

## 1. Estado actual

El sitio **todavía no está en uso.** Se vuelve usable el día que esto se conecte.
Eso define el perfil de riesgo de todo el plan: no hay huéspedes, no hay pedidos
que perder, no hay carritos en `sessionStorage` ajenos, y ningún bundle viejo
cacheado puede postear nada. Los pasos de abajo se pueden ejecutar y rehacer sin
coordinar ventanas de deploy.

| Pieza | Estado |
|---|---|
| Primitivas de UI, registro de servicios, contexto del carrito | ✅ |
| Las 6 superficies conectadas al carrito | ✅ |
| Notas por experiencia signature (chef, fridge, spa, fishing) | ✅ |
| `/checkout/` — revisión del pedido | ✅ |
| Forma de línea optimizada para el backend (`titleEn`, `kind`, `byQuote`, `data`) | ✅ |
| Precios en fuente única (`src/data/pricing.js`) | ✅ |
| `/checkout/` — formulario del huésped y envío | ✅ (contra stub local) |
| `src/lib/orderPayload.js` | ✅ |
| Migración a Vercel | ❌ **paso 3** |
| Carpeta de Drive + proyecto de Apps Script | ❌ **paso 4 (cliente)** |
| `Code.gs` para el modelo nuevo | ❌ **paso 5** |

**El camino de envío existe y corre contra un stub local.** `/checkout/` recoge los
siete campos del huésped más la nota general, `buildOrderPayload()` arma el payload
del §4 y `submitOrder` lo resuelve localmente tras ~900 ms, volcando el JSON completo
en la consola del navegador. Para conectarlo de verdad se pone `USE_STUB = false` en
`orderApi.js`, que entonces postea a `/api/orders` — el route handler que llega con
Vercel en el paso 3.

El formulario viejo (`OrderCheckoutForm.jsx`, 275 líneas) y `useOrderCart.js` sí
estaban todavía en disco a pesar de lo que decía este documento; se borraron en esta
sesión.

## 2. Decisiones tomadas

1. **Una Google Sheet por reserva, una pestaña por pedido**, en una carpeta del
   Workspace del cliente. La concierge abre el archivo de una reserva y encuentra,
   pestaña por pestaña, todo lo que esa reserva pidió. **Sin plantilla:** el script
   crea y formatea todo, y se itera sobre el código hasta que el resultado guste.
2. **El número de reserva es la identidad.** Viene de Simple Booking, el PMS del
   cliente, y lo escribe el huésped en el checkout. Varios checkouts en sesiones
   distintas se acumulan en el mismo archivo. Confirmado por el dueño de producto el
   2026-11-19.
3. **La estructura se crea una vez y después solo recibe información.** La carpeta
   raíz, la subcarpeta `Pedidos` y el documento maestro no se vuelven a crear nunca:
   un checkout agrega una fila al maestro y una pestaña al archivo de su reserva. Ver
   el mecanismo en §5.
4. **La hoja es un documento de referencia, no una superficie de cálculo.** Las
   facturas se hacen en otro sistema. Totales precomputados y estáticos; sin
   fórmulas vivas y sin celdas de precio editables.
5. **El hosting se mueve a Vercel.** Da un servidor, lo que saca el secreto del
   bundle y elimina el truco de `text/plain` para esquivar CORS. Es además
   precondición para cobrar algún día en el sitio.
6. **Las notas existen en dos niveles:** una por experiencia signature y una general
   del pedido.
7. **Los precios viven en `src/data/pricing.js`**, inyectados al locale activo. Ya
   no pueden divergir entre idiomas.

## 3. Arquitectura destino

```
Navegador (Next.js en Vercel)
   │  POST /api/orders        ← JSON, mismo origen, sin CORS, sin secreto público
   ▼
Route handler de Next.js      ← valida; ORDERS_SHARED_SECRET vive en el servidor
   │  POST (secreto en el body)
   ▼
Apps Script Web App           ← propiedad de la cuenta Workspace del CLIENTE
   ├─ Registro de Checkouts   ← una fila por checkout + log de dedupe
   ├─ Sheet de la reserva     ← se busca o se crea; pestaña nueva por pedido
   └─ correo a operaciones    ← con el link al archivo
```

La capa de Apps Script es idéntica con o sin Vercel. Ir a Vercel primero significa
escribir `orderApi.js` una sola vez y probar el round-trip en vivo una sola vez.

### Restricciones retiradas

`output: "export"` obligaba a postear del navegador directo a Apps Script, lo que
obligaba a un secreto `NEXT_PUBLIC_*` visible en el bundle y a `Content-Type:
text/plain`. En Vercel nada de eso aplica. Esas dos reglas quedan **retiradas**.

## 4. Contrato del payload

Lo produce `buildOrderPayload()` en `src/lib/orderPayload.js`. `schemaVersion` está
para que el Apps Script pueda ramificar cuando esto cambie — es un sistema vivo y va
a cambiar.

```jsonc
{
  "schemaVersion": 2,
  "submissionId": "9f2c…",        // uuid, generado UNA vez por intento de checkout
  "createdAt":    "2026-11-19T18:52:00.000Z",
  "locale":       "en",           // "en" | "es" — en qué idioma pidió
  "currency":     "USD",

  "guest": {                      // 7 campos SIEMPRE presentes; 5 obligatorios
    "reservationNumber": "SB-10432",   // req · Simple Booking · LA llave de agrupación
    "firstName":   "Ana",              // req
    "lastName":    "Rodríguez",        // req
    "phone":       "+506 8888 8888",   // req
    "casa":        "casa-mango",       // req · slug de src/data/properties.js
    "email":       "ana@example.com",  // OPCIONAL — "" si el huésped lo omite
    "checkInDate": "2026-12-02"        // OPCIONAL — "" si el huésped lo omite
  },

  "cart": [
    {
      "lineId":    "wellness-spa:deep-tissue-massage:90-min",
      "service":   "wellness-spa", // id de src/data/services.js
      "sku":       "deep-tissue-massage",
      "title":     "Masaje de Tejido Profundo",  // lo que VIO el huésped
      "titleEn":   "Deep Tissue Massage",        // canónico, para la hoja
      "kind":      "massage",      // vocabulario en §5
      "qty":       2,
      "unitPrice": 130,
      "lineTotal": 260,            // qty * unitPrice, precomputado
      "byQuote":   false,          // true = "por cotizar", NO gratis
      "date":      "2026-12-04",   // fecha preferida opcional, "" si no
      "options":   { "duration": "90 min" },   // display, localizado
      "data":      { "durationMin": 90 }       // tipado, sin idioma
    }
  ],

  "serviceForms": {               // solo aparecen los servicios presentes
    "private-chef": {
      "dishes":       { "Day 1 — Dinner": "Whole Fish · Casado" },
      "restrictions": { "Vegetarian": 2, "Gluten-Free": 1 },
      "restrictionOther": "bajo en sodio",
      "allergies":    "alergia severa al maní",
      "preferences":  "sin cilantro",
      "notes":        "el chef puede llegar a las 5pm"
    },
    "full-fridge": {
      "adults": 4, "children": 2, "days": 5,
      "produce": ["dairy:milk", "fruits:mango"],   // lista COMPLETA — es la compra
      "cooking": "…", "groceries": "…", "snacksFor": ["kids"],
      "preferredSnacks": "…", "notes": "…"
    },
    "wellness-spa":  { "allergies": "…", "notes": "…" },
    "fishing-tours": { "notes": "…" }
  },

  "totals": {
    "itemCount":    5,
    "subtotal":     1240,   // suma solo de líneas con precio
    "quotePending": 1       // cuántas líneas byQuote
  },
  "notes": "Llegamos tarde el 2."   // general, del pedido
}
```

Reglas que se mantienen:

- **Un envío por checkout.** Chef + spa + un carro es un solo POST. No reintroducir
  envíos por servicio.
- **`submissionId` se genera una vez por intento y se reusa en el reintento.**
  Generarlo dentro del handler hace que un reintento tras fallo de red saque un id
  nuevo, derrote el dedupe y escriba el pedido dos veces. El viejo
  `OrderCheckoutForm` tenía exactamente ese bug.
- **`byQuote: true` significa "se cotiza", no gratis.** Transporte y tours lo
  producen. Nunca deben renderizarse ni sumarse como `$0`.
- **`titleEn` es la columna de la hoja; `title` es lo que vio el huésped.** 72 de
  los 80 ítems tienen texto distinto en español, así que sin `titleEn` el archivo de
  una reserva termina mitad en cada idioma.
- **Los precios vienen de `src/data/pricing.js`**, no de `t()`.
- **`email` y `checkInDate` son opcionales** y llegan como `""` cuando el huésped
  los omite — nunca `null` ni ausentes, así que el script puede escribirlos sin
  comprobar. El teléfono sí es obligatorio: es la vía de contacto garantizada, y por
  eso operaciones siempre puede responder aunque no haya correo.
- Los 5 obligatorios son **nº de reserva, nombre, apellido, teléfono y casa**.
  Decisión del dueño de producto el 2026-11-19.
- `serviceForms` se copia crudo y completo. **No** construirlo con
  `describeServiceForm()` de `src/lib/serviceForm.js` — ese es un formateador de UI y
  colapsa `produce` a un conteo (`COUNT_ONLY`). La lista de 40 ítems del supermercado
  llegaría a la hoja como "18 ítems seleccionados".
- Nunca copiar un objeto de `tours.activities` completo a una línea. `commission`,
  `contactName` y `whatsapp` son datos internos de margen que viajan en el bundle.
  `normalizeLine` hace whitelist precisamente por eso.

## 5. Estructura en Drive

Todo el formato y toda la estructura los **genera el script**. No hay plantilla: se
itera sobre `Code.gs` hasta que el resultado guste. El front no participa — no puede
dar formato a una hoja, y pasarle "pistas de presentación" acoplaría el checkout al
layout.

Lo único que se crea a mano es la carpeta raíz. Lo demás lo crea el script la primera
vez que corre, buscando por nombre y creando si no existe.

```
WelcomeOrders/                       ← creada a mano, una vez (paso 4)
├── Registro de Checkouts            ← creado una vez; luego AGREGA una fila
│     Documento único del negocio. Una fila por checkout.
│     SIN el contenido del pedido.
│
└── Pedidos/                         ← creada una vez
      ├── SB-10432 — Rodríguez — Casa Mango    ← una por reserva
      │     ├── Pedido 1 · 2026-11-19   ← cabecera + detalle completo
      │     ├── Pedido 2 · 2026-11-24   ← pestaña nueva, misma reserva
      │     ├── Consolidado            ← se reescribe en cada checkout
      │     └── Payload (oculta)       ← JSON crudo de cada pedido
      └── SB-10988 — Pérez — Casa Ceiba
            └── Pedido 1 · 2026-11-20
```

**Un archivo por número de reserva, una pestaña por pedido.** Si la misma reserva
vuelve a pedir, el script encuentra su archivo y agrega una pestaña. Esto reemplaza el
diseño anterior de bloques apilados en una sola pestaña, y con ello desaparece la
regla de "nunca ordenar esta hoja": cada pestaña es un pedido autocontenido y se puede
ordenar o filtrar sin romper nada.

### Nada se re-crea: todo es buscar-o-crear

**La carpeta raíz, la subcarpeta `Pedidos` y el documento maestro se crean una sola
vez y después solo reciben información.** Un checkout no crea estructura nueva salvo
la primera vez que aparece su reserva. Esto es requisito explícito del dueño de
producto y es también el modo de fallo más fácil de introducir: si la búsqueda por
nombre falla silenciosamente, el script crea un maestro nuevo en cada envío y quedan
veinte documentos con una fila cada uno.

Lo que lo garantiza, y que el paso 5 debe implementar así:

1. **`PropertiesService` como caché de ids.** Tras descubrir o crear el maestro y la
   subcarpeta, sus ids quedan guardados. Los checkouts siguientes van directo al id
   sin buscar por nombre.
2. **Validar el id cacheado antes de confiar en él.** Si el archivo fue borrado,
   movido a la papelera o el id ya no abre, se vuelve a buscar por nombre y solo se
   crea si de verdad no existe. Un id cacheado que apunta a la papelera no debe
   producir un archivo nuevo en silencio.
3. **Todo dentro del `LockService`.** Dos checkouts simultáneos podrían encontrar los
   dos que no hay maestro y crear cada uno el suyo. El lock serializa el buscar-o-crear
   completo, no solo la escritura.
4. **Lo mismo aplica al archivo de la reserva.** Se busca por su número de reserva
   normalizado; existe → se le agrega una pestaña; no existe → se crea. Nunca se
   sobrescribe una pestaña ya escrita.

Un solo `FOLDER_ID` en `CONFIG` es toda la configuración manual.

### `Registro de Checkouts` — el documento maestro

Una fila por checkout. **Deliberadamente sin el contenido del pedido**: es el registro
de que un checkout ocurrió y de quién lo hizo, no qué pidió. Para el detalle está su
archivo, enlazado en la última columna.

| Columna | Origen |
|---|---|
| Fecha | hora del servidor, zona Costa Rica |
| Hora | idem |
| Nº de reserva | `guest.reservationNumber` |
| Nombre / Apellido | `guest.firstName` / `guest.lastName` |
| Email / Teléfono | `guest.email` (puede venir vacío) / `guest.phone` |
| Casa | `guest.casa` |
| Fecha de ingreso | `guest.checkInDate` — puede venir vacía |
| Idioma | `locale` — en qué idioma pidió |
| Pedido # | cuántos checkouts lleva esa reserva |
| ID de envío | `submissionId`, para el dedupe |
| Archivo | link a la hoja de la reserva |

Si más adelante se quiere total o número de ítems aquí, es una columna más — pero por
ahora queda fuera a propósito.

### La pestaña de cada pedido

Nombre: `Pedido N · YYYY-MM-DD`. Contenido, de arriba abajo:

1. **Cabecera** con los mismos datos identificatorios que la fila del maestro, más la
   fecha y hora del pedido y una celda de **Estado** (desplegable: Pendiente /
   Confirmado / Entregado / Cancelado) para que la concierge marque su avance.
2. **Notas generales** del pedido, si las hay.
3. **Un bloque por servicio**, agrupado por `kind`: los ítems con cantidad, precio
   unitario y total, y debajo las **notas y preferencias de ese servicio** —
   completas, incluida la lista de productos del Full Fridge, que es literalmente la
   lista de compras.
4. **Totales**: subtotal e ítems por cotizar.

El objetivo del formato es **legibilidad y completitud**: la concierge tiene que poder
leerlo como una boleta y no puede faltar nada.

### `Consolidado` y `Payload`

- **`Consolidado`** — todos los ítems de todas las pestañas de pedido en una lista
  plana, reescrita en cada checkout. Es la vista "qué pidió esta reserva en total",
  útil cuando hay tres pedidos repartidos en tres pestañas. Viene del pedido explícito
  del dueño de producto; si al verla no aporta, se quita sin tocar nada más.
- **`Payload`** (oculta) — el JSON crudo de cada checkout. La garantía de que no se
  pierde nada aunque no exista columna para algo.

### Iterar sobre el formato

`Code.gs` incluirá una función **`generarPedidoDePrueba()`** que fabrica un pedido
completo (varios servicios, notas en los dos niveles, una línea por cotizar, acentos)
y lo escribe como si viniera del sitio. Sin ella, cada ajuste de formato exigiría
hacer un checkout completo en el navegador. Con ella el ciclo es: ajustar el script →
nueva implementación → correr la función → mirar el resultado.

### Vocabulario de `kind`

La hoja agrupa por este campo. Catorce valores, fijados por el código:

| Servicio | `kind` |
|---|---|
| `tours` | `activity` |
| `transport` | `vehicle` |
| `wellness-spa` | `massage`, `facial`, `addon`, `package` |
| `fishing-tours` | `charter` |
| `full-fridge` | `stocking-package`, `beverage` |
| `private-chef` | `chef-service`, `themed-night`, `beverage`, `bartender`, `dessert`, `bakery` |

### Dedupe y la llave del archivo

El log de dedupe por `submissionId` vive en el documento maestro (la columna existe en
cada fila), así que no hace falta una hoja índice aparte. Un reintento tras fallo de
red trae el mismo `submissionId` y el script debe reconocerlo y no escribir dos veces.

**Red de seguridad para el typo.** El número de reserva lo escribe el huésped y es la
llave del archivo, así que un dedazo crea un **archivo nuevo** para una reserva que ya
existe, y la concierge puede ver solo la mitad del pedido. Mitigaciones: normalizar
duro (mayúsculas, sin espacios ni guiones) antes de usarlo como llave; mostrarlo de
vuelta para que lo confirme antes de enviar; guardar `lastName` como llave secundaria
de reconciliación; y el maestro ordenado por reserva deja dos códigos casi idénticos
adyacentes, donde se detectan a ojo. El arreglo de fondo es validar contra la API de
Simple Booking.

**`service` + `sku` es la llave del producto, nunca `sku` solo.** El chef vende la
lista de bebidas del Full Fridge, así que un mismo producto aparece bajo dos
servicios. El sku del chef quedó namespaceado (`beverage-red-wine`), pero la regla se
mantiene por si vuelve a pasar.

## 6. No cambiar

1. **La costura es `orderApi.js` + `orderPayload.js`.** Si hay que editar algo bajo
   `src/components/sections/` para que el backend funcione, algo salió mal.
2. **No reintroducir envíos por servicio** ni botones de envío por página. Las
   páginas agregan al carrito; solo `/checkout/` envía.
3. **No añadir lógica de pago todavía.** Vercel lo habilita; no está en alcance.
4. **No cambiar la persistencia del carrito a `localStorage`.** Es decisión de
   producto que sea de sesión.
5. **No meter `commission` / `contactName` / `whatsapp` en el payload.**
6. **Generar `submissionId` una vez por intento de checkout.**
7. **No construir la hoja con `describeServiceForm()`** (§4).
8. **Añadir un campo a una línea de carrito significa añadirlo a `normalizeLine`.**
   Es un whitelist: un campo que un builder escribe y esa función no copia desaparece
   en silencio al commitear y al rehidratar, y parece que el builder no corrió.
9. **Un Apps Script Web App necesita un deployment nuevo** para que un cambio de
   código surta efecto. Guardar el script no basta. Es la forma más común de perder
   media hora depurando la capa equivocada.

## 7. Riesgos conocidos

**El secreto compartido.** En Vercel vive en el servidor y el navegador nunca lo ve.
Esto deja de ser un riesgo al completarse el paso 3; hasta entonces no hay envío, así
que tampoco hay exposición.

**Márgenes internos en el bundle público.** `tours.activities[].commission` (9
entradas: `"$20 per person"`, `"Flexible — negotiable by volume"`, `"Net rates —
monthly invoice"`) y `tours.activities[].pricing[]` (~38 strings, con
`"~$11–12 profit / adult"` y `"Net rate — you mark up"`) viajan en el bundle de JS.
`pricing[]` **no se renderiza en ningún componente** — son datos muertos que
cualquiera puede leer con devtools. El whitelist del carrito protege el payload, no el
bundle. **Pendiente de decisión del cliente:** borrarlos, o moverlos a un archivo
solo-servidor si se van a usar en una vista interna.

**La sección de transporte no está traducida.** El array `VEHICLES` es prosa inglesa
fija (`type`, `idealFor`, `badge`) y las etiquetas de especificaciones dicen
`"5 seats"` / `"2 bags"` con plurales ingleses a mano. Un huésped en español ve toda
esa tarjeta en inglés. Tarea aparte.

**No hay linter.** `npx eslint` no corre: ESLint 9 pide `eslint.config.js` y el
proyecto tiene `.eslintrc.json`, y `next lint` desapareció en Next 16. Preexistente.

**No hay suite de pruebas comiteada.** Las verificaciones de las sesiones de
noviembre (678 aserciones) se corrieron ad-hoc desde un scratchpad. Si se va a cobrar
por aquí, vale convertir al menos las de precio en algo versionado.

## 8. Plan paso a paso

Dos carriles. El mío es código; el del cliente son accesos y activos de Google, y es
el único con espera externa — **conviene arrancarlo el día uno** o se vuelve el cuello
de botella al final.

### Paso 1 — Contrato y esquema congelados ✅
Este documento. Sin código. **Listo cuando:** §4 y §5 están acordados.

### Paso 2 — Checkout: formulario, payload y envío ✅
Todo en código, **sin depender de ningún activo de Google**.
- Los 7 campos del huésped + notas generales, con `react-hook-form` (ya instalado;
  sin resolver, porque `@hookform/resolvers` se eliminó y no hay zod/yup — usar las
  reglas nativas).
- `src/lib/orderPayload.js` con `buildOrderPayload()` según §4.
- `submissionId` en un ref, generado una vez por intento.
- `orderApi.js` apuntando a un stub local, para que el flujo completo sea demostrable.
- ~15 llaves i18n en EN y ES, manteniendo las estructuras idénticas.
- Traducir el `By quote` que está hardcodeado en inglés en `CheckoutPage.jsx`.

**Listo cuando:** se arma un pedido real en el navegador y el JSON del payload se
puede inspeccionar completo, con varios servicios, notas en los dos niveles y una
línea `byQuote`.

### Paso 3 — Vercel
- **Código:** quitar `output: "export"` de `next.config.ts`, añadir
  `app/api/orders/route.ts` que valide y reenvíe con el secreto del servidor, y
  apuntar `orderApi.js` a `/api/orders`.
- **Cliente:** crear el proyecto en Vercel, conectar el repo, poner las variables en
  el entorno de **build**, migrar el DNS desde Hostinger.

**Listo cuando:** el sitio desplegado postea a su propio route handler y recibe
respuesta.

### Paso 4 — Activos de Google · **carril del cliente, arrancar ya**

> Las instrucciones detalladas para este paso están en
> [STEP-4-GOOGLE-SETUP.md](STEP-4-GOOGLE-SETUP.md), escritas para delegarse a alguien
> sin acceso al repo. Incluyen los nombres exactos de pestañas y el orden de columnas
> contra los que escribe el paso 5 — si cambian ahí, hay que cambiarlos aquí.
Mínimo a propósito: **solo dos cosas se crean a mano.** El documento maestro y la
subcarpeta `Pedidos` los crea el script la primera vez y los reutiliza siempre
después — ver "Nada se re-crea" en §5.

1. Carpeta **`WelcomeOrders`** en la raíz del Drive. **Hecho:** vive en *Mi unidad* de
   `concierge@arboreaexperiences.com`, ID `18K4EYRvXwBcvR9QEMsoQphYG1SnJFJLc`. No hay
   unidades compartidas en ese Workspace, así que los archivos pertenecen a la cuenta
   de concierge y se irían con ella si algún día se cierra; mientras siga abierta,
   funciona igual. Se puede compartir con otras cuentas si operaciones lo necesita.
2. Proyecto de **Apps Script en la cuenta del cliente**, con un stub que autoriza los
   scopes (Drive + Sheets + Gmail) y verifica los accesos. **Hecho:** proyecto
   `Arborea — Orders Backend`, cuenta efectiva `concierge@arboreaexperiences.com`,
   zona horaria `America/Costa_Rica`, cuota de correo 1500/día (Workspace de pago).
3. **Desplegar el Web App** ("Execute as: me", "Who has access: Anyone").
4. Confirmar el **formato del número de Simple Booking**, y si hay **API**.

**Destino de las notificaciones:** `concierge@arboreaexperiences.com`. No es
`operations@` — el `Code.gs` viejo (commit `2bdc081`) usaba esa dirección y está
obsoleta; este proyecto no pasa por operaciones.

**Listo cuando:** tengo el ID de la carpeta y la URL del Web App.

#### Estado: COMPLETO (2026-11-19)

| Dato | Valor |
|---|---|
| Carpeta | `WelcomeOrders`, Mi unidad de concierge |
| ID de carpeta | `18K4EYRvXwBcvR9QEMsoQphYG1SnJFJLc` |
| Proyecto | `Arborea — Orders Backend` |
| Cuenta efectiva | `concierge@arboreaexperiences.com` |
| Tipo de cuenta | Workspace de pago (cuota de correo 1500/día) |
| Zona horaria | `America/Costa_Rica`, verificada en ejecución |
| Web App | `Execute as: me` · `Who has access: Anyone` |
| URL `/exec` | `…/macros/s/AKfycbxgPZiV7YBu3v3rL-wl1OtIIknpqcxbtk6gefQA0oNh_MYQy9XvFhzpJBqeqjsHs8jf2A/exec` |
| Notificaciones a | `concierge@arboreaexperiences.com` |

La URL `/exec` se mantiene estable al publicar versiones nuevas **del mismo
despliegue**. Crear un despliegue nuevo en vez de una versión nueva genera otra URL y
deja el sitio apuntando a código viejo — ver la advertencia de §Errores.

En Vercel va como variable de entorno (`APPS_SCRIPT_URL`), leída solo desde el route
handler. Nunca en código de cliente ni en un `NEXT_PUBLIC_*`: el navegador no debe
conocer ni la URL ni el secreto.

#### Número de reserva — resuelto (2026-11-19)

**No hay API de Simple Booking.** Cerrado, no es un "más adelante": el número que
escribe el huésped es la única llave de agrupación que va a existir y nada puede
corregirlo después.

**El formato no está definido todavía** y se decide después de las pruebas. Durante
pruebas no se valida; el riesgo lo absorbe quien prueba.

Consecuencia para el paso 5 — **no asumir un formato, pero sí normalizar.** Son dos
campos distintos y mezclarlos es el error a evitar:

- `reservationNumber` — tal como lo escribió el huésped. Es lo que se muestra en el
  nombre del archivo, en el maestro y en el correo.
- una **llave normalizada** derivada de él — mayúsculas, sin espacios ni guiones ni
  puntuación (`SB-10432`, `sb 10432` y `SB10432` → `SB10432`). Es contra esta llave
  que se busca el archivo existente de la reserva.

Sin API esto es lo único que separa "dos pedidos de la misma reserva" de "dos
archivos con medio pedido cada uno". Cuando el formato se defina, se agrega la
validación encima sin tocar nada de lo anterior.

### Paso 5 — `Code.gs`
Crear la subcarpeta y el documento maestro si no existen; añadir la fila del
checkout al maestro; buscar o crear el archivo de la reserva; escribir la pestaña
`Pedido N` con su formato; reescribir `Consolidado`; guardar el JSON en `Payload`;
dedupe por `submissionId`; correo a operaciones con el link. Se conserva del script
actual el helper `json()` y el `LockService`. Incluye
**`generarPedidoDePrueba()`** para iterar el formato sin hacer un checkout completo.

**Listo cuando:** un POST del route handler crea o amplía el archivo correcto, y el
formato generado nos gusta.

### Paso 6 — Prueba en vivo
Chef + fridge + spa + un tour sin precio en un solo checkout; dos checkouts sobre la
misma reserva (debe reusar el archivo); reintento con el mismo `submissionId` (no debe
duplicar); acentos y ñ en las notas; y validación con la concierge sobre la hoja real.

### Dependencias
- El paso 2 no depende de nada externo — es por donde se arranca.
- El paso 3 va antes de terminar el 2 si se quiere evitar escribir `orderApi.js` dos
  veces; el stub local hace que el orden exacto no bloquee.
- El paso 5 depende del paso 4.
- El paso 6 depende de todo.

## 9. Progress log

Append an entry per session. Newest last.

### 2026-09-28 — analysis + docs
- Audited the whole order path. Findings: six independent page-local carts, two
  dead-end flows (Full Fridge's "Add to cart" button had no `onClick`; the tours
  `ActivityCard` had no cart at all), **no `.env` anywhere** so `submitOrder` was
  returning `missing-backend-url` and nothing had ever reached Google, and Chef/Spa
  were posting empty `name`/`casa`/`dateNeeded` which the Apps Script would have
  rejected regardless.
- Decisions taken with the product owner: one order per checkout; guest first name,
  last name, email, phone and casa all required at checkout; all prices shown as
  estimates subject to change; cart is session-only; backend deferred to a later
  session behind a mock.
- Wrote `CLAUDE.md` and this file.

### 2026-09-28 — phase 0.5: groundwork before the cart
Refactor limited to what the cart work actually needs. Build and `tsc --noEmit`
both clean afterwards.

- **Added `src/components/ui/`**: `QtyStepper`, `DateField`, `Chip`,
  `SelectableCard`. These replace 13 hand-rolled −/+ steppers, 6 one-off
  `type="date"` inputs and 15 duplicated local components (`Stepper` ×2,
  `RadioPill` ×2, `PackageCard` ×2, and five variants of the same text field).
  The old ones clamped inconsistently (some at 0, some at 1, chef's guest counter
  at 2) — `min`/`max` are now explicit props.
  - `DateField` also fixes a real bug shared by all six previous date inputs: they
    used `new Date().toISOString()` for `min`, which is UTC, so in Costa Rica
    (UTC-6) the minimum selectable date rolled over to tomorrow at 6pm local and
    blocked same-day requests. `todayLocal()` in that file is the fix.
- **Added `src/data/services.js`** — the six-service registry (`id`, `labelKey`,
  colour, `href`, icon). `id` is what the payload uses for `cart[].service` and the
  `serviceForms` keys, so treat the ids as part of the contract in §4.
  Added matching `services.*.label` keys to both locale files (EN + ES).
- **Deleted** `src/components/AOSInit.jsx` and `src/components/SplashScreen.jsx` —
  neither was imported anywhere (a previous commit removed the usage but left the
  files). Removed 6 dependencies with zero imports: `aos`, `gsap`,
  `framer-motion`, `lucide`, `date-fns`, `@hookform/resolvers`.
  - Kept `react-hook-form`: it was also unused, but the new checkout has five
    required fields with email/phone validation, which is exactly its job. Note
    `@hookform/resolvers` was dropped because no schema library (zod/yup) is
    installed — use RHF's built-in validation rules, not a resolver.
- **Deliberately not done:** the 54 inert `data-aos` attributes still in the JSX do
  nothing now that AOS is gone, but stripping them would add a large mechanical
  diff to files that are mid-edit. They get removed in phase 3 as those files are
  rewritten anyway.
- Left `OrderCheckoutForm.jsx`, `ChefCheckout`, `SpaCheckout` and Full Fridge's
  inline summary untouched on purpose — roughly 600 lines that get deleted in
  phases 3–4. Don't invest in cleaning them.

### 2026-09-28 — phase 1: the cart itself

- **`src/app/context/CartContext.jsx`** — one cart for the whole site, mounted in
  `layout.tsx` inside `I18nProvider`. API: `setLine` (upsert-replace), `addLine`
  (upsert-increment), `updateLine`, `setQty` (0 removes), `removeLine`,
  `clearService`, `clear`; `getLine`/`has`; derived `lines`, `linesByService`,
  `subtotal`, `count`, `lineCount`; `serviceForms` with
  `setServiceForm` (shallow merge) / `replaceServiceForm` / `getServiceForm`;
  plus `isOpen`/`openCart`/`closeCart`/`toggleCart` for the drawer, and `hydrated`.
- **`src/lib/sku.js`** — `slugify`, `skuOf(path, index, field)`, `lineIdOf`.
  `skuOf` resolves the item's **English** name out of `en.json` by dot path (numeric
  segments index arrays) and slugifies it, so an id never depends on the active
  locale and never shifts when an array is reordered. Falls back to
  `<last-path-segment>-<index>` when it can't resolve.

**Guarantees that matter to the backend**, verified against the real code this
session (ad-hoc, not a committed test suite — re-check if you change the context):

- `normalizeLine` is a strict whitelist. A line built from a `tours.activities`
  object keeps only the eight contract fields; `commission`, `contactName`,
  `whatsapp`, `image`, `priceValue` are dropped. Verified that what lands in
  `sessionStorage` has exactly
  `date, lineId, options, qty, service, sku, title, unitPrice`.
- `lineTotal` never exists in stored state — it is recomputed on every read, so a
  persisted cart can't carry a stale total.
- Lines whose `service` is not in `src/data/services.js` are dropped on hydration,
  so renaming a service id retires stale lines instead of leaking an unknown
  service into a payload.
- The persistence effect is gated on `hydrated`, so the empty first render cannot
  overwrite a saved cart. Corrupt or unreadable storage starts empty rather than
  throwing.
- `qty` is coerced to a positive integer and `unitPrice` to a non-negative number;
  invalid lines are rejected outright rather than stored half-formed.
- `linesByService` is ordered by `SERVICE_ORDER`, so the drawer, the checkout page
  and the payload always list services in the same sequence.
- 98 skus across the 13 priced/selectable i18n arrays were checked for collisions:
  all unique.

### 2026-09-29 — phase 2: cart UI

- **`src/components/cart/CartButton.jsx`** — floating pill, bottom-right, appears
  only once the cart has something in it. Deliberately *not* in the navbar: that
  header hides itself on scroll-down, and this button has to stay reachable while
  the guest scrolls a long service page.
- **`src/components/cart/CartDrawer.jsx`** — slide-over panel mounted once in the
  root layout. Grouped by service (colour + icon from the registry), per-line
  quantity stepper and remove, "Preferences saved" chip plus an Edit link per
  service group, estimated total, the estimates disclaimer, and the checkout CTA.
  Escape closes, Tab is trapped inside the panel, focus returns to the opener.
- **`src/app/checkout/page.jsx` + `components/sections/CheckoutPage.jsx`** — the
  order review half of the checkout, so the drawer's CTA has a real destination.
  The guest form and the single submit are still to come.
- **`src/lib/format.js`** — `money`, `formatDateLabel`, `describeLine`.
- Added `cart.*` and `checkout.*` i18n keys (EN + ES), appended as raw text so the
  rest of those files was not reformatted.
- Added `id="experiences"` to the in-house services section, so the empty-state
  CTA has an anchor.

Two integration details future work must respect:

- **`LenisProvider` now depends on the cart.** It reads `isOpen` and calls
  `lenis.stop()` / `.start()`, otherwise the page keeps gliding behind the open
  overlay. It also force-clears `document.body.style.pointerEvents`: Lenis sets
  that to `"none"` on every scroll and clears it 150ms later, so a drawer opened
  mid-scroll would otherwise be completely unclickable with no further scroll
  event coming to release it. That is also why `CartButton` sets
  `pointer-events-auto` explicitly — without it the button is dead to clicks for
  most of the time the guest is scrolling.
- **`options` values must read as labels on their own.** `describeLine` joins the
  *values* and never shows keys, so `{ days: 3 }` renders as a bare "3". Use
  `{ days: "3 days" }`, `{ duration: "90 min" }`, `{ guests: "6 guests" }`.

**Regression introduced and fixed in this phase — worth knowing about.** The drawer
overlay shipped with `pointer-events-auto` in the static part of its class list and
`pointer-events-none` in the ternary. Tailwind emits `.pointer-events-auto` *after*
`.pointer-events-none`, so with both classes present auto wins no matter what order
they appear in the attribute. The result was an invisible full-screen `z-[600]`
layer that swallowed every click on the site — navigation included. The same latent
conflict was in `CartButton`'s wrapper and the panel itself.

Rule that follows: **never split a Tailwind utility family across the static and
conditional halves of a `className`.** Emit exactly one class of a given family from
the ternary. This is silent — it type-checks, it builds, and the JSX reads as if it
works.

Verified: production build and `tsc --noEmit` clean; the prerendered HTML carries
`role="dialog"`, `aria-modal`, `inert` on the closed panel, `data-lenis-prevent` on
the scroll container, and no empty-state flash on `/checkout/`. `money`,
`formatDateLabel` and `describeLine` unit-checked (20 assertions) under
`TZ=America/Costa_Rica` — including proof that `new Date("2026-10-04")` formats as
"Oct 3" locally while `formatDateLabel` gives "Oct 4". Click-through interaction
(open/close, stepper, remove) was **not** machine-verified: no browser automation
was available in that session.

### 2026-09-29 — phase 3a: UX corrections + home page wired

The product owner clarified the intended flow, which **corrected two of my earlier
decisions**. Recorded here because both are easy to get wrong again:

1. **The cart button belongs at the top, always visible.** It was a floating
   bottom-right pill that only appeared once the cart had items. It is now a fixed
   top-right control (`z-450`, left of the hamburger) that is always present. It is
   still not *inside* `<Navbar>`'s header, because that header retracts on
   scroll-down and this must not disappear; it collapses to icon + count below `md`
   so it keeps the hamburger's footprint.
2. **The cart is the committed order, not the working state.** My earlier note in
   `CLAUDE.md` told future readers to mirror cart state directly from components.
   That is wrong for this product: each surface holds a local draft and commits on
   an explicit action. See the corrected section in `CLAUDE.md`.

Also: the drawer footer now has the two buttons the flow calls for — "Keep adding
experiences" (returns to `/#experiences` without clearing anything) and "Proceed
with my order" (`/checkout/`). `/checkout/` stays the only place guest details are
collected and the only place the order is submitted.

Wired this pass:

- **`ui/ActivityCard.jsx`** (home activities) — was completely orphaned, with local
  state and no cart at all. Now: quantity + optional date as a draft, one commit,
  then the card shows "In your order" / "Update order" / remove. Reads only
  whitelisted fields off the activity object, so `commission` / `contactName` /
  `whatsapp` never enter a line.
- **`sections/MulaRentalSection.jsx`** (home vehicles) — dropped its local `Set` +
  `configs` cart and the inline `OrderCheckoutForm`. `qty` is the number of
  **vehicles**; the day count is folded into `unitPrice` (`days × dailyRate`) and
  carried as `options.days`. That way the drawer's stepper means "two of this
  vehicle" instead of silently changing the rental length.
- Both replaced their bespoke steppers and date inputs with `QtyStepper` /
  `DateField`.

`OrderCheckoutForm.jsx` now has exactly one remaining consumer,
`FishingToursPage.jsx`; it gets deleted when that page is wired.

Verified: build and `tsc --noEmit` clean; utility-conflict scan clean across 13
files; 18 "Add to cart" controls present in the prerendered home page (12 activities
+ 6 vehicles); the transport section no longer renders an inline order form;
`inert` confirmed to serialise correctly (omitted when false, `inert=""` when true).
Click-through still unverified — no browser automation available.

### 2026-09-29 — phase 3b: spa, chef and full fridge wired

Fishing tours is **deliberately left unconnected** at the product owner's request.
It still uses the old `useOrderCart` hook and still renders `OrderCheckoutForm`,
which is why both of those files survive. Don't delete either until fishing is
migrated.

**`src/hooks/useDraft.js`** is the new shared page-local selection store. Unlike
`useOrderCart` it never stores labels and never folds quantity into a price — the
commit builds those from the i18n data. Nothing in it is persisted.

Each of the three pages now follows the same shape: the whole page is a draft, it
renders its own end-of-page summary, and one "Add to cart" commits. Every commit
does `clearService(id)` **then** adds the lines, so deselecting something and
re-committing cannot leave an orphan line behind. Verified that this sequence works
as intended (React applies the functional updaters in order) and that it leaves other
services' lines and `serviceForms` untouched.

- **`WellnessSpaPage`** — `SpaCheckout` (which used to POST directly) became
  `SpaSummary`. Massage duration becomes the `lineId` variant, so "Deep Tissue
  60 min" and "90 min" are distinct lines. The enhancements gate is now scoped to
  this page's draft: checking the global cart would have let a rental car unlock
  facial add-ons.
- **`FullFridgePage`** — the "Add to cart" button had no `onClick` at all and the
  questionnaire was never submitted anywhere; both now work. `updatePackageCart`
  is gone (it existed only to keep the old local cart in sync on every click).
  Produce selections switched from translated `"Category::Item"` strings to stable
  `category:item` ids derived from the English labels, matching the payload
  contract. Beverages became quantities instead of toggles.
  The package tier is the *nearest* match to the requested guests/days, so the exact
  numbers asked for are preserved in `options.requested`.
- **`PrivateChefPage`** — `ChefCheckout` became `ChefSummary`; the dietary form
  stays local and is handed up as structured data on commit, landing in
  `serviceForms["private-chef"]` instead of being flattened into zero-price lines.
  `changeDishQty` no longer does double duty: desserts/bakery are priced quantities,
  and the copy it used to write into `dishes` was never read back. Guest counts go in
  `options.guests`, never concatenated into the title.
  Dish picks stay in the guest's own language — they are prose for the chef, not ids.

Known remaining inconsistency: `PrivateChefPage` still has 5 hand-rolled steppers
and 2 one-off date inputs rather than `QtyStepper` / `DateField`. The other three
surfaces are fully migrated. Left alone because it is a purely visual change that
could not be verified in a browser this session.

Verified: `tsc --noEmit` and the production build clean, all 11 routes generated;
utility-conflict scan clean; each of the three pages renders exactly one "Add to
cart" and no longer renders the old "Submit order" form, while `/fishing-tours/`
still renders it; 32 chef skus and all spa skus unique. Click-through still not
machine-verified.

### 2026-10-01 — preference forms made visible, and a round-trip bug fixed

Prompted by the product owner asking whether the spa's allergies field was actually
being saved. It was — but there was no way to see it, and checking turned up a real
data-loss bug next to it.

**Preferences are now shown, not just acknowledged.** The drawer used to render a
bare "Preferences saved" chip. `src/lib/serviceForm.js` (`describeServiceForm`) turns
a `serviceForms[serviceId]` blob into ordered label/value rows, rendered in a
collapsed `<details>` in the drawer and expanded on `/checkout/`. The formatter is
shape-driven rather than key-driven, so it handles all three services without
special-casing: strings pass through, arrays join, `{option: count}` becomes
"Vegetarian (2)", and `{meal: [dishes]}` becomes "Breakfast: A, B". `produce` is
shown as a count — it is a list of 40+ slugs, which would be noise. Labels live in
`cart.formLabels.*` in both locales.

**Bug found and fixed: returning to a service page wiped the previous commit.** None
of the three in-house pages seeded their draft from the cart, so the drawer's "Edit"
link landed the guest on a blank page. Because every commit calls `clearService()`
first, selecting one new item there and pressing "Add to cart" silently dropped the
lines *and* the preferences already committed — the guest thinks they are adding a
third massage and ends up with only the new one.

Fixed with `useSeedDraftFromCart` in `src/hooks/useDraft.js` plus per-page restore:

- **Spa** — a `sku -> draft key` map, the exact inverse of `buildLines()`. Verified
  that every sku the commit can produce resolves back to the right draft key, with
  full coverage and no mismatches.
- **Full Fridge** — almost everything comes back from `serviceForms` (counts, produce
  ids, every questionnaire answer); only beverage quantities are read off the lines.
- **Chef** — each committed line is matched back to the control that made it; guest
  counts are recovered by parsing `options.guests` ("6 guests" -> 6).

All three guard on `hydrated` with a ref so they fire once and cannot overwrite edits
in progress — the same pattern as the home-page cards.

Also confirmed while testing: `serviceForms` survive navigation and rehydration, and
the `clearService`-before-`setServiceForm` ordering means a cleared allergies field
does not leave a stale value behind (a previously typed allergy really does
disappear if the guest empties the field and re-commits).

Noted: `FullFridgePage`'s `form.dietaryPreferences` is dead state — declared and read
in the `answered` derivation but never bound to any input. It is deliberately absent
from the committed payload.

### 2026-11-15 — planning session: the real backend

No code written. This session replanned the integration end to end and rewrote
sections 1–8 of this file. Decisions and measurements are in those sections; what
follows is what *changed* versus the previous plan, so a reader of the old version
knows what to unlearn.

- **Fishing tours is wired** and all four signature experiences have per-service
  notes. The old §1 said fishing was deliberately deferred. That work exists but is
  **uncommitted** (20 files, +3,130/−642).
- **`OrderCheckoutForm.jsx` and `useOrderCart.js` are orphaned**, so the app
  currently has *no* submit path at all, and `submitOrder` has no live caller.
- **There is no mock.** The old §3 described `orderApi.js` as resolving against a
  mock with a switch at the top of the file. It is 25 lines with a direct `fetch`.
- **No backward compatibility is needed** — reasoned in §1. Removes the old plan's
  "accept the flat shape for one release" requirement.
- **Model changed**: one Sheet per reservation in a Drive folder, keyed by the Simple
  Booking reservation number, rather than one master Orders/OrderItems book. A real
  `.xlsx` per order was considered and dropped — Apps Script cannot append to an
  xlsx, so accumulating into one would mean convert→append→export→replace on every
  checkout, which is racy and can corrupt the only copy.
- **The sheet is a reference document, not a billing surface.** Invoices happen in a
  separate system. Live formulas and editable price cells were briefly planned on the
  wrong premise and removed; precomputed totals stay.
- **Hosting moves to Vercel**, which withdraws the `text/plain` and public-secret
  constraints and unblocks payment later.
- **Prices measured**: 50 structured values per locale (0 divergences today), 102
  prose strings per locale carrying prices, 1 hardcoded `dailyRate: 200`. The old
  doc's "~65-entry migration" understated it by about 4×.

### 2026-11-19 — el front queda listo para conectar

Tres sesiones de trabajo sobre las líneas del carrito y los precios, más la
reescritura de este plan. Sin backend todavía.

- **Forma de línea optimizada para el backend**, aditiva: `titleEn` (canónico, vía
  `titleOf()` / `enString()` nuevos en `lib/sku.js`), `kind` (14 valores, §5),
  `byQuote` (explícito en vez de inferir de `unitPrice === 0`) y `data` (los mismos
  hechos tipados y sin idioma que `options` lleva como prosa localizada).
  `normalizeLine` los whitelistea. Verificado: los 15 paths i18n resuelven sin un
  solo vacío, y los captions de `describeLine` quedaron byte-idénticos en ambos
  idiomas. **72 de los 80 ítems tienen título distinto en español** — esa es la
  magnitud de lo que `titleEn` evita.
- Dos simplificaciones que los campos nuevos habilitaron: `isQtyAddOn` pasó de
  comparar prefijos de sku y reconstruir un array en cada llamada a un `Set.has(kind)`,
  y el seed del chef dejó de hacer `parseInt` sobre `"6 guests"` y `JSON.parse` sobre
  `options._dishes` — ese blob JSON dentro de `options` ya no existe.
- **Precios a fuente única.** Resultaron ser **98 valores por locale, no 50**: la
  lista de llaves del handoff viejo omitía `perPerson` y `total` (los tiers de pesca),
  subestimándolo 2×. Viven en `src/data/pricing.js`, inyectados al locale activo por
  `applyPrices()` en `I18nContext`; **ningún componente cambió**. Además 49 strings de
  prosa quedaron con tokens `{{p:path}}` y las constantes `DISH_PRICE` y `dailyRate`
  salieron de los componentes.
  - El emparejamiento por valor se descartó por inseguro: "$200 / day" de transporte
    se resolvía a un tier de pesca que también vale 200. Se usó criterio estructural
    (hermandad en el mismo objeto).
  - 44 strings se dejaron literales a propósito: `tours.activities[].pricing[]` es una
    tarjeta de tarifas interna con números que no existen en otra parte, y
    `wellnessSpa.pricing.*` son filas de display sin contraparte numérica.
  - Red de seguridad: línea base de los 98 precios y los 102 strings capturada antes
    de tocar nada; condición de merge que todos resolvieran byte-idénticos después. Se
    cumplió en ambos idiomas. Prueba de fuego: cambiar `basePrice` a 999 en un lugar
    actualiza la copia inglesa, la española y el valor del carrito a la vez.
- **Extras del desayuno eliminados** del private chef a petición del dueño de
  producto (eran seleccionables, no decorativos). Como solo el desayuno los tenía, se
  quitó también toda la función de extras de `MenuSection` en vez de dejarla huérfana.
  `extrasSubheading` ya era i18n muerto.
- **Unidades contables a i18n.** Nuevo `countLabel()` en `lib/format.js` con
  `cart.units.{day,adult,child,guest}` como `{one, other}` en ambos locales. Elimina
  los plurales ingleses escritos a mano en fridge, transporte y chef, y unifica chef
  con fishing. Se eligió `persona/personas` en español para que el caption de fishing
  no cambiara.
- **El sitio sigue sin usarse**, lo que retira del plan toda la cautela de
  "producción": no hay carritos ajenos ni bundles cacheados. Los fallbacks de
  retrocompatibilidad escritos para proteger a un huésped a mitad de sesión se
  eliminaron por ser código muerto.
- Verificación total de la jornada: **678 aserciones, 0 fallos**, en cuatro suites
  ad-hoc. No están comiteadas — ver §7.

### 2026-11-19 — estructura en Drive redefinida (sin plantilla)

El dueño de producto descartó la plantilla hecha a mano. El formato lo genera el
script y se itera sobre el código hasta que el resultado guste. Cambios respecto al
diseño anterior:

- **Un archivo por reserva, una pestaña por pedido**, en vez de bloques apilados en
  una sola pestaña. Con eso desaparece la regla de "nunca ordenar esta hoja": cada
  pestaña es un pedido autocontenido.
- **El documento maestro es solo un registro de checkouts** — fecha, hora, datos
  identificatorios del huésped y link a su archivo, explícitamente **sin el contenido
  del pedido**. Reemplaza el "índice maestro" que además llevaba totales.
- **El log de dedupe vive en el maestro** (una columna por fila), así que la hoja
  índice aparte desaparece.
- **El script crea la subcarpeta `Pedidos` y el documento maestro**, buscándolos por
  nombre y guardando sus ids en `PropertiesService`. El paso 4 se reduce a crear una
  carpeta y el proyecto de Apps Script: un solo `FOLDER_ID` en `CONFIG`.
- `Code.gs` incluirá **`generarPedidoDePrueba()`**, porque iterar el formato haciendo
  un checkout completo en el navegador cada vez no es viable.
- Las instrucciones delegables del paso 4 están en `STEP-4-GOOGLE-SETUP.md`.
- **Aclarado por el dueño de producto:** la carpeta raíz y el documento maestro **no
  se re-crean** — se crean una vez y después solo reciben filas. Documentado en §5
  como buscar-o-crear idempotente, con caché de ids en `PropertiesService`,
  validación del id cacheado contra la papelera, y el `LockService` abarcando el
  buscar-o-crear completo y no solo la escritura (dos checkouts simultáneos podrían
  crear cada uno su propio maestro).
- Confirmado que **"identificador" = número de reserva**, que es lo que nombra el
  archivo.

### 2026-11-19 — paso 2: el checkout envía

- **`src/lib/orderPayload.js`** — `buildOrderPayload()` produce el §4 exacto. Copia
  explícitamente los 13 campos de cada línea en vez de reenviar el objeto, así un
  campo añadido al carrito mañana no empieza a transmitirse en silencio; recalcula
  `lineTotal` en vez de confiar en el que traiga; ordena el carrito por
  `SERVICE_ORDER` para que el payload sea determinista; y descarta de `serviceForms`
  los servicios vacíos o ausentes del carrito. `normalizeReservationNumber()`
  normaliza **conservadoramente** — mayúsculas y espacios sí, guiones no: "SB-10432"
  se lee mejor que "SB10432" en un nombre de archivo, y sin conocer el formato de
  Simple Booking, quitar separadores podría colisionar dos números distintos.
- **`src/components/sections/GuestDetailsForm.jsx`** — los 7 campos requeridos más la
  nota, con las reglas nativas de `react-hook-form` (sin resolver: no hay zod/yup).
  El número de reserva va primero y a ancho completo porque es la llave bajo la que
  se archiva todo. `DateField` va con `min={null}` a propósito: el huésped puede
  estar a mitad de estadía cuando pide, así que su fecha de ingreso está en el pasado.
  Como `DateField` es un popover y no un `<input>`, se conecta por `setValue` y se
  valida a través de un campo oculto registrado.
- **`CheckoutPage`** — `submissionId` en un `useRef`, generado una vez por intento y
  **reusado mientras el intento no se resuelva**, de modo que un reintento tras fallo
  de red lleve el mismo id y el backend deduplique; se limpia solo al tener éxito.
  `newSubmissionId()` cae a un id propio si `crypto.randomUUID` no existe (contexto no
  seguro) — ese id es lo que evita pedidos duplicados y no puede ser lo que rompa el
  envío.
  - **El panel de éxito cortocircuita ANTES del chequeo de carrito vacío**, porque el
    carrito se limpia al enviar y `count` ya es 0 cuando se renderiza.
  - El estado de error muestra el código técnico en pequeño: es para nosotros, pero
    convierte "no funcionó" en algo diagnosticable.
- **`orderApi.js`** reescrito: stub local con volcado del payload a consola, y al lado
  el camino real a `/api/orders` ya escrito. Desapareció el secreto `NEXT_PUBLIC_*` y
  el `Content-Type: text/plain`, que solo existían para postear del navegador directo
  a Apps Script.
- **`By quote` traducido** — estaba hardcodeado en inglés 7 veces en 3 componentes.
  Ahora es `cart.byQuote` ("A cotizar" en español). 18 llaves nuevas de
  `checkout.form.*` en ambos locales, estructuras idénticas.
- **Borrados** `OrderCheckoutForm.jsx` y `useOrderCart.js` (311 líneas), que seguían
  en disco. El comentario obsoleto en `useDraft.js` que decía que fishing no estaba
  migrado también se corrigió.
- Verificado: **36 aserciones** sobre el builder (orden determinista, los 13 campos
  exactos, `commission` excluido, `lineTotal` recalculado sobre un valor stale,
  `produce` sin colapsar, totales excluyendo `byQuote`, carrito vacío sin explotar,
  round-trip JSON). Más: las 46 llaves `t()` del checkout resuelven a string en los
  dos locales, los nombres de campo del formulario coinciden exactamente con lo que
  lee el builder, `tsc` y build limpios, y el dev server sirve `/checkout/` con 200
  sin errores. **El click-through no está verificado por máquina** — no hay
  automatización de navegador en esta sesión.

### 2026-11-19 — campos obligatorios reducidos a cinco

Decisión del dueño de producto: obligatorios **nº de reserva, nombre, apellido,
teléfono y casa**. `email` y `checkInDate` pasan a opcionales; llegan como `""`.

Dos cosas que esto destapó:

- **En react-hook-form un `pattern` se evalúa también contra el string vacío.** Quitar
  `required` del email dejando su `pattern` habría rechazado dejarlo en blanco. Se
  cambió por `validate: (v) => !v.trim() || EMAIL_RE.test(v) || msg` — la guarda del
  vacío es el punto. Verificado con 11 casos (vacíos, `null`, basura, válidos).
- **`DateField` renderiza su propia etiqueta** cuando recibe `label`, así que
  envolverlo en el `<Field>` del formulario la dibujaba dos veces. Se le pasa
  `label={null}` y la etiqueta la gobierna el wrapper, que es quien también marca
  "(opcional)" y muestra errores.

Los campos opcionales se marcan en la UI en vez de marcar los obligatorios: son menos
y hace menos ruido. Nueva llave `checkout.form.optional` en ambos locales.
