/*
 * The single exit point for anything the guest sends. Nothing else in the app talks
 * to the backend.
 *
 * Two payload kinds go through the same pipe:
 *   - orders   — the cart checkout, from the web or the kiosk
 *   - requests — quick guest requests, kiosk only (`/solicitudes/`)
 * The backend tells them apart by shape, so one transport serves both.
 *
 * STATE: live against the app's own `/api/orders/` route handler, which holds the
 * shared secret server-side and forwards to the Apps Script Web App. Flip `USE_STUB`
 * back to true to work on the UI without a backend — it resolves locally and logs
 * the exact payload to the console.
 *
 * Note the route handler ALSO mocks when `ORDERS_BACKEND_URL` is unset in
 * development, so `npm run dev` works with no configuration at all. In production an
 * unset URL is a loud 503, never a silent success — a swallowed order is invisible.
 *
 * Note there is deliberately no `NEXT_PUBLIC_*` secret here any more. The previous
 * version posted straight to Apps Script with the secret inlined in the client bundle
 * and `Content-Type: text/plain` to dodge a CORS preflight. Both of those stop being
 * necessary once the request is same-origin.
 */

const USE_STUB = false;

/* Trailing slash on purpose: `trailingSlash: true` in next.config.ts makes Next
 * answer `/api/orders` with a 308 to `/api/orders/`. A POST survives a 308 with its
 * body intact, but it pays an extra round trip on every single order. */
const ENDPOINT = "/api/orders/";

const STUB_DELAY_MS = 900;

async function submitToStub(payload) {
  if (typeof console !== "undefined") {
    const kind = payload.type === "request" ? "REQUEST" : "ORDER";
    console.groupCollapsed(`[orderApi · STUB] ${kind} ${payload.submissionId}`);
    console.log("payload:", payload);
    console.log("json:", JSON.stringify(payload, null, 2));
    console.groupEnd();
  }

  await new Promise((resolve) => setTimeout(resolve, STUB_DELAY_MS));
  return { ok: true, submissionId: payload.submissionId, stub: true };
}

async function submitToApi(payload) {
  let response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    /* Network-level failure: the guest can retry, and because `submissionId` is
     * stable across retries the backend dedupes rather than duplicating. */
    return { ok: false, error: `network: ${String(err)}` };
  }

  try {
    const body = await response.json();
    if (!response.ok) {
      return { ok: false, error: body?.error || `http-${response.status}` };
    }
    return body;
  } catch {
    return { ok: false, error: `bad-response-${response.status}` };
  }
}

async function post(payload) {
  if (!payload?.submissionId) {
    return { ok: false, error: "missing-submission-id" };
  }
  return USE_STUB ? submitToStub(payload) : submitToApi(payload);
}

/**
 * @returns `{ ok: true, submissionId }` or `{ ok: false, error }`. Never throws —
 *   the caller renders the error state off `ok`.
 */
export function submitOrder(payload) {
  return post(payload);
}

/** Kiosk-only quick request. Same transport, different payload shape. */
export function submitRequest(payload) {
  return post(payload);
}
