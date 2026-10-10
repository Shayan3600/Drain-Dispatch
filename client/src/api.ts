const origin =
  (import.meta as unknown as { env: Record<string, string> }).env
    .VITE_API_URL || "";
export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${origin}/api${path}`, {
    ...options,
    headers: {
      ...(options?.body && !(options.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...options?.headers,
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      data?.error?.message ||
        data?.error ||
        "The service is unavailable. Please try again.",
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
