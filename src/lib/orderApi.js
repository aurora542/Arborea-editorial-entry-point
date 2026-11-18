export const BACKEND_URL = process.env.NEXT_PUBLIC_ORDERS_BACKEND_URL || "";
export const SHARED_SECRET = process.env.NEXT_PUBLIC_ORDERS_SHARED_SECRET || "";

/*
 * Shared POST. text/plain is intentional — it avoids the CORS preflight that an
 * application/json body would trigger against Apps Script (see ORDERS-BACKEND.md
 * §2). Do not change the Content-Type.
 *
 * Dev mock: with no backend URL configured and outside production, resolve after
 * ~1.2s as success so the whole flow can be demoed. In production a missing URL is
 * an error, never a silent success — that would drop real orders.
 */
async function post(payload) {
  if (!BACKEND_URL) {
    if (process.env.NODE_ENV !== "production") {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      return { ok: true, submissionId: payload?.submissionId, mock: true };
    }
    return { ok: false, error: "missing-backend-url" };
  }

  let response;
  try {
    response = await fetch(BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({ ...payload, secret: SHARED_SECRET }),
    });
  } catch (err) {
    return { ok: false, error: String(err) };
  }

  try {
    return await response.json();
  } catch {
    return { ok: false, error: `bad-response-${response.status}` };
  }
}

export function submitOrder(payload) {
  return post(payload);
}

export function submitRequest(payload) {
  return post(payload);
}
