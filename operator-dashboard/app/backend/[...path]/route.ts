import { NextRequest } from "next/server";

const FORWARDED_REQUEST_HEADERS = ["accept", "content-type", "content-length", "cookie", "x-csrf-token"];
const FORWARDED_RESPONSE_HEADERS = ["cache-control", "content-disposition", "content-length", "content-type", "set-cookie"];

type ProxyRouteContext = {
  params: Promise<{ path: string[] }>;
};

export const dynamic = "force-dynamic";

/**
 * PUBLIC_INTERFACE
 * Proxies GET requests to the configured internal FastAPI service while keeping its address server-only.
 */
export async function GET(request: NextRequest, context: ProxyRouteContext): Promise<Response> {
  return proxyToBackend(request, context);
}

/**
 * PUBLIC_INTERFACE
 * Proxies POST requests, including CSRF-protected JSON and multipart uploads, to the internal FastAPI service.
 */
export async function POST(request: NextRequest, context: ProxyRouteContext): Promise<Response> {
  return proxyToBackend(request, context);
}

/**
 * PUBLIC_INTERFACE
 * Proxies PUT requests to the configured internal FastAPI service while preserving safe request headers.
 */
export async function PUT(request: NextRequest, context: ProxyRouteContext): Promise<Response> {
  return proxyToBackend(request, context);
}

/**
 * PUBLIC_INTERFACE
 * Proxies PATCH requests to the configured internal FastAPI service while preserving safe request headers.
 */
export async function PATCH(request: NextRequest, context: ProxyRouteContext): Promise<Response> {
  return proxyToBackend(request, context);
}

/**
 * PUBLIC_INTERFACE
 * Proxies DELETE requests to the configured internal FastAPI service while preserving the session cookie and CSRF header.
 */
export async function DELETE(request: NextRequest, context: ProxyRouteContext): Promise<Response> {
  return proxyToBackend(request, context);
}

/**
 * PUBLIC_INTERFACE
 * Proxies HEAD requests to the configured internal FastAPI service.
 */
export async function HEAD(request: NextRequest, context: ProxyRouteContext): Promise<Response> {
  return proxyToBackend(request, context);
}

/**
 * Resolves the backend destination at request time so standalone builds do not require a container-network URL.
 */
async function proxyToBackend(request: NextRequest, context: ProxyRouteContext): Promise<Response> {
  const backendInternalUrl = process.env.BACKEND_INTERNAL_URL;

  if (!backendInternalUrl) {
    return Response.json({ detail: "The dashboard backend connection is unavailable." }, { status: 503 });
  }

  const { path } = await context.params;
  let destination: URL;

  try {
    destination = new URL(backendInternalUrl);
  } catch {
    return Response.json({ detail: "The dashboard backend connection is unavailable." }, { status: 503 });
  }

  destination.pathname = `${destination.pathname.replace(/\/$/, "")}/${path.map(encodeURIComponent).join("/")}`;
  destination.search = request.nextUrl.search;

  const headers = new Headers();
  for (const headerName of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(headerName);
    if (value) {
      headers.set(headerName, value);
    }
  }

  try {
    const upstreamResponse = await fetch(destination, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      cache: "no-store",
      redirect: "manual"
    });

    const responseHeaders = new Headers();
    for (const headerName of FORWARDED_RESPONSE_HEADERS) {
      const value = upstreamResponse.headers.get(headerName);
      if (value) {
        responseHeaders.set(headerName, value);
      }
    }

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      headers: responseHeaders
    });
  } catch {
    return Response.json({ detail: "The dashboard backend connection is unavailable." }, { status: 503 });
  }
}
