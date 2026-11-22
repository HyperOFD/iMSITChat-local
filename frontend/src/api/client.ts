export interface Peer {
  id: number;
  username: string;
}
export interface User extends Peer {
  role: "user" | "admin";
}
export interface Message {
  id: number;
  dialog_id: number;
  sender_id: number;
  body: string;
  created_at: string;
}
export interface Dialog {
  id: number;
  peer: Peer;
  last_message: Message | null;
}
export interface History {
  items: Message[];
  has_more: boolean;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}
export function api(path: "/logout", body: object): Promise<void>;
export function api<T>(path: string, body?: unknown): Promise<T>;
export async function api<T>(path: string, body?: unknown): Promise<T | void> {
  const response = await fetch(
    "/api" + path,
    body === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Imsit-Request": "1",
          },
          body: JSON.stringify(body),
        },
  ).catch(() => {
    throw new ApiError(0, "Нет связи с сервером. Повторите попытку.");
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 && path !== "/login" && path !== "/me")
      window.dispatchEvent(new Event("session-ended"));
    throw new ApiError(
      response.status,
      data.error?.message ?? "Сервер временно недоступен.",
      data.error?.fields,
    );
  }
  return response.status === 204 ? undefined : response.json();
}
export const explain = (reason: unknown) =>
  reason instanceof Error ? reason.message : "Не удалось выполнить запрос.";
export function mergeMessages(...groups: Message[][]) {
  const unique = new Map(groups.flat().map((m) => [m.id, m]));
  return Array.from(unique.values()).sort((a, b) => a.id - b.id);
}
export const clock = (value: string) =>
  new Date(value).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
export const dateLabel = (value: string) =>
  new Date(value).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
