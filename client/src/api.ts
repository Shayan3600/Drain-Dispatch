const origin =
  (import.meta as unknown as { env: Record<string, string> }).env
    .VITE_API_URL || "";
export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}
export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  // Bound reads; photo uploads and Gemini POST requests retain their own longer budgets.
  const isRead = ["GET", "HEAD"].includes(options?.method?.toUpperCase() || "GET");
  const timeout = isRead ? AbortSignal.timeout(15000) : undefined;
  const signal = timeout
    ? options?.signal ? AbortSignal.any([options.signal, timeout]) : timeout
    : options?.signal;
  let response: Response;
  try {
    response = await fetch(`${origin}/api${path}`, {
      ...options,
      signal,
      headers: {
        ...(options?.body && !(options.body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
        ...options?.headers,
      },
    });
  } catch (reason) {
    if (options?.signal?.aborted) throw reason;
    if (timeout?.aborted && !options?.signal?.aborted)
      throw new Error("The request timed out. Please try again.");
    throw new Error("The service is unavailable. Please try again.");
  }
  let data;
  try {
    data = await response.json();
  } catch (reason) {
    if (options?.signal?.aborted) throw reason;
    if (timeout?.aborted)
      throw new Error("The request timed out. Please try again.");
    if (response.ok)
      throw new Error("The service returned an unreadable response. Please try again.");
    data = null;
  }
  if (response.ok && data === null)
    throw new Error("The service returned an unreadable response. Please try again.");
  if (!response.ok)
    throw new ApiError(
      typeof data?.error?.message === "string" ? data.error.message
        : typeof data?.error === "string" ? data.error
          : "The service is unavailable. Please try again.",
      response.status,
    );
  return data as T;
}
export function post<T>(path: string, data: unknown) {
  return api<T>(path, { method: "POST", body: JSON.stringify(data) });
}
export function list<T>(value: T[] | Record<string, T[]>, key: string): T[] {
  return Array.isArray(value) ? value : value[key] || [];
}
export function date(value?: string) {
  return value
    ? new Date(value).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "Date unavailable";
}
