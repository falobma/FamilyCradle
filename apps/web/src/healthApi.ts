type HealthErrorShape = {
  error?: {
    code?: string;
    message?: string;
    details?: { percentChange?: number; days?: number };
  };
};

export class HealthRequestError extends Error {
  readonly code: string;
  readonly details: { percentChange?: number; days?: number } | undefined;

  constructor(
    message: string,
    code: string,
    details?: { percentChange?: number; days?: number },
  ) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export async function healthApi<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const options: RequestInit = { method, credentials: "same-origin" };
  if (body !== undefined) {
    options.headers = { "content-type": "application/json" };
    options.body = JSON.stringify(body);
  }
  const response = await fetch(path, options);
  if (!response.ok) {
    const payload = (await response
      .json()
      .catch(() => null)) as HealthErrorShape | null;
    throw new HealthRequestError(
      payload?.error?.message ?? `Request failed (${response.status}).`,
      payload?.error?.code ?? "",
      payload?.error?.details,
    );
  }
  return response.status === 204
    ? (undefined as T)
    : ((await response.json()) as T);
}
