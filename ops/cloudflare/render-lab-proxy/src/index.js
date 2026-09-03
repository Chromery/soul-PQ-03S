const RENDER_LAB_ORIGIN = "http://localhost:8282";
const SOURCE_PDF_URL =
  "https://pq-soul.rainailab.com/api/properties/320129/documents/planimetria/download";

export default {
  async fetch(request, env) {
    const incomingUrl = new URL(request.url);
    const upstreamOrigin = env.UPSTREAM_ORIGIN || RENDER_LAB_ORIGIN;

    // Avoid sending this request through the private tunnel twice: the lab's
    // nginx endpoint proxies the same production URL and Cloudflare correctly
    // rejects that route as a loop when it originates from Workers VPC.
    if (upstreamOrigin === RENDER_LAB_ORIGIN && incomingUrl.pathname === "/render-lab/source.pdf") {
      return fetch(SOURCE_PDF_URL, {
        headers: { accept: "application/pdf" },
      });
    }

    const upstreamUrl = new URL(`${incomingUrl.pathname}${incomingUrl.search}`, upstreamOrigin);
    const headers = new Headers(request.headers);
    headers.delete("host");

    const init = {
      method: request.method,
      headers,
      redirect: "manual",
    };
    if (request.method !== "GET" && request.method !== "HEAD") {
      init.body = request.body;
    }

    try {
      const upstream = await env.RENDER_LAB_ORIGIN.fetch(new Request(upstreamUrl, init));
      const responseHeaders = new Headers(upstream.headers);
      const location = responseHeaders.get("location");
      if (location) {
        const redirectUrl = new URL(location, upstreamUrl);
        if (redirectUrl.origin === upstreamOrigin) {
          redirectUrl.protocol = incomingUrl.protocol;
          redirectUrl.host = incomingUrl.host;
          responseHeaders.set("location", redirectUrl.toString());
        }
      }

      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders,
      });
    } catch {
      return new Response("Ambiente di test temporaneamente non raggiungibile.", {
        status: 502,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
  },
};
