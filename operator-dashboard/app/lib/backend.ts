import type { SessionState } from "./types";

const BACKEND_PREFIX = "/backend";

export class BackendRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "BackendRequestError";
    this.status = status;
  }
}

let csrfToken: string | null = null;

/**
 * PUBLIC_INTERFACE
 * Obtains and caches the session-bound CSRF value from the backend API.
 */
export async function getCsrfToken(): Promise<string> {
  if (csrfToken) {
    return csrfToken;
  }

  const response = await fetch(`${BACKEND_PREFIX}/api/auth/csrf`, {
    credentials: "same-origin",
    cache: "no-store"
  });
  const payload = await decodePayload(response);

  if (!response.ok) {
    throw new BackendRequestError(errorMessage(payload), response.status);
  }

  const token = readToken(payload);
  if (!token) {
    throw new BackendRequestError("The backend did not provide a CSRF token.", response.status);
  }

  csrfToken = token;
  return token;
}

/**
 * PUBLIC_INTERFACE
 * Clears the cached CSRF value after logout or a rejected session.
 */
export function clearCsrfToken(): void {
  csrfToken = null;
}

/**
 * PUBLIC_INTERFACE
 * Sends a same-origin request through the dashboard proxy and decodes safe API failures.
 */
export async function backendRequest<T>(
  path: string,
  options: RequestInit = {},
  requireCsrf = false
): Promise<T> {
  const headers = new Headers(options.headers);

  if (requireCsrf) {
    headers.set("X-CSRF-Token", await getCsrfToken());
  }

  const response = await fetch(`${BACKEND_PREFIX}${path}`, {
    ...options,
    headers,
    credentials: "same-origin",
    cache: "no-store"
  });
  const payload = await decodePayload(response);

  if (!response.ok) {
    if (response.status === 401) {
      clearCsrfToken();
    }
    throw new BackendRequestError(errorMessage(payload), response.status);
  }

  return payload as T;
}

/**
 * PUBLIC_INTERFACE
 * Retrieves authenticated session state without rendering protected data prematurely.
 */
export async function getSession(): Promise<SessionState> {
  return backendRequest<SessionState>("/api/auth/session");
}

/**
 * PUBLIC_INTERFACE
 * Creates an authenticated session using a CSRF-protected JSON request.
 */
export async function login(username: string, password: string): Promise<SessionState> {
  const token = await getCsrfToken();
  const session = await backendRequest<SessionState>(
    "/api/auth/login",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": token
      },
      body: JSON.stringify({ username, password })
    },
    false
  );

  csrfToken = session.csrf_token ?? token;
  return session;
}

/**
 * PUBLIC_INTERFACE
 * Ends the active authenticated session and clears browser-local request state.
 */
export async function logout(): Promise<void> {
  await backendRequest<void>("/api/auth/logout", { method: "POST" }, true);
  clearCsrfToken();
}

async function decodePayload(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return null;
  }

  try {
    return await response.json();
  } catch {
    return null;
  }
}

function readToken(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const possibleToken = (payload as Record<string, unknown>).csrf_token ?? (payload as Record<string, unknown>).token;
  return typeof possibleToken === "string" && possibleToken.length > 0 ? possibleToken : null;
}

function errorMessage(payload: unknown): string {
  if (payload && typeof payload === "object" && typeof (payload as Record<string, unknown>).detail === "string") {
    return (payload as Record<string, unknown>).detail as string;
  }

  return "The requested backend operation could not be completed.";
}
