/*
 * The single exit point for anything the guest sends. Nothing else in the app talks
 * to the backend.
 *
 * Two payload kinds go through the same pipe:
 *   - orders   — the cart checkout, from the web or the kiosk
 *   - requests — quick guest requests, kiosk only (`/solicitudes/`)
 * The backend tells them apart by shape, so one transport serves both.
 *
 * STATE: running against a local stub (step 2 of docs/ORDERS-BACKEND.md). No Google
 * asset is wired yet, so submits resolve locally after a short delay and log the
 * exact payload. That makes the whole flow demoable and reviewable before any
 * backend exists.
 *
 * TO GO LIVE (step 3): set `USE_STUB` to false. The real path posts to this app's own
 * `/api/orders` route handler, which holds the shared secret server-side and forwards
 * to the Apps Script Web App. That route arrives with the Vercel migration, because a
 * static export has no server to put a secret in.
 *
 * Note there is deliberately no `NEXT_PUBLIC_*` secret here any more. The previous
 * version posted straight to Apps Script with the secret inlined in the client bundle
 * and `Content-Type: text/plain` to dodge a CORS preflight. Both of those stop being
 * necessary once the request is same-origin.
 */

const USE_STUB = true;

const ENDPOINT = "/api/orders";

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
