import { NextResponse } from "next/server";

/*
 * The server side of order submission. Everything the guest sends — cart checkouts
 * from the web or the kiosk, and kiosk quick requests — comes through here.
 *
 * Its whole reason to exist is the shared secret. Under the old static export there
 * was no server, so the browser posted straight to Apps Script with the secret
 * inlined in the JS bundle, where anyone could read it. Here the secret never leaves
 * the server and the browser only ever talks to its own origin.
 *
 * It deliberately does NOT validate the payload's business shape. Apps Script is the
 * authority on that and validates again; duplicating the rules here would mean two
 * places to keep in sync and a second thing to forget. What it does check is cheap
 * and structural: is this JSON, is it a plausible size, does it carry a submissionId.
 */

/* Node, not Edge: the Apps Script Web App answers a POST with a 302 to
 * script.googleusercontent.com, and following that redirect reliably (preserving the
 * response body) is better-trodden on the Node runtime. */
export const runtime = "nodejs";

/* A POST is never cached, but being explicit keeps a future config change from
 * quietly turning this into a static response. */
export const dynamic = "force-dynamic";

/*
 * Apps Script is slow on the first order of a reservation: it finds-or-creates the
 * folder, copies a spreadsheet, writes several tabs and sends mail. Ten-plus seconds
 * is normal. Vercel's default function timeout is shorter than that, so an order
 * would fail intermittently and only for new reservations — the worst kind of bug to
 * reproduce. Sixty seconds is far more than it needs and costs nothing when unused.
 */
export const maxDuration = 60;

/* Generous for an order (a Full Fridge produce list plus chef dish picks is a few KB)
 * and small enough that the endpoint cannot be used to push megabytes at Apps Script.
 * The endpoint is public by necessity, so it gets a ceiling. */
const MAX_BODY_BYTES = 256 * 1024;

export async function POST(request: Request) {
  const backendUrl = process.env.ORDERS_BACKEND_URL;
  const sharedSecret = process.env.ORDERS_SHARED_SECRET;

  const raw = await request.text();

  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "payload-too-large" }, { status: 413 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid-json" }, { status: 400 });
  }

  if (!payload || typeof payload !== "object" || !payload.submissionId) {
    /* Without it the backend cannot dedupe, so a retry after a network error would
     * write the order twice. Refusing here is safer than letting it through. */
    return NextResponse.json({ ok: false, error: "missing-submission-id" }, { status: 400 });
  }

  if (!backendUrl) {
    /* In development, resolve as success so the flow can be exercised without any
     * Google asset. In production, fail loudly: a silent success here would swallow
     * a real guest's order and nobody would ever know. */
    if (process.env.NODE_ENV !== "production") {
      return NextResponse.json({
        ok: true,
        submissionId: payload.submissionId,
        mock: true,
      });
    }
    return NextResponse.json(
      { ok: false, error: "backend-not-configured" },
      { status: 503 }
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(backendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      /* The secret is added here and only here. It is never sent to the browser and
       * never appears in the payload the client builds. */
      body: JSON.stringify({ ...payload, secret: sharedSecret ?? "" }),
      redirect: "follow",
      cache: "no-store",
    });
  } catch (err) {
    console.error("[api/orders] upstream fetch failed", err);
    return NextResponse.json({ ok: false, error: "upstream-unreachable" }, { status: 502 });
  }

  const text = await upstream.text();

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    /* Apps Script answers with an HTML error page when the deployment is wrong — the
     * classic one being a Web App set to "Anyone with a Google account" instead of
     * "Anyone", which returns a sign-in page. Log enough to recognise that without
     * echoing a whole HTML document back to the guest's browser. */
    console.error(
      "[api/orders] non-JSON from Apps Script",
      upstream.status,
      text.slice(0, 300)
    );
    return NextResponse.json(
      { ok: false, error: `upstream-not-json-${upstream.status}` },
      { status: 502 }
    );
  }

  /* Apps Script answers 200 even for its own logical failures, so the verdict lives
   * in the body, not the status code. Pass it through as-is. */
  return NextResponse.json(body, { status: upstream.ok ? 200 : 502 });
}

/* A GET is useful for checking the route is deployed and whether the environment is
 * wired, without sending anything. It never reveals the secret — only whether one
 * is present. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "api/orders",
    backendConfigured: Boolean(process.env.ORDERS_BACKEND_URL),
    secretConfigured: Boolean(process.env.ORDERS_SHARED_SECRET),
  });
}
