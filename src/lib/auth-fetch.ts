/**
 * Cookie-session fetch helpers kept for compatibility with older call sites.
 * Session tokens are HttpOnly and must never be copied into localStorage.
 */
export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...options,
    credentials: options.credentials ?? "include",
  });
}

export async function authJsonFetch<T = unknown>(
  url: string,
  options: RequestInit = {},
): Promise<{ success: boolean; data?: T; error?: string }> {
  const headers = new Headers(options.headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await authFetch(url, { ...options, headers });
  if (response.headers.get("content-type")?.includes("application/json")) {
    return response.json() as Promise<{ success: boolean; data?: T; error?: string }>;
  }
  return { success: false, error: "Invalid response" };
}
