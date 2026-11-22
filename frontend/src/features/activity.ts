import { useCallback, useEffect, useRef } from "react";
import { clock } from "../api/client";

export interface Activity {
  dialog_id: number;
  online: boolean;
  typing: boolean;
  last_seen_at: string | null;
}

export function activityLabel(activity?: Activity) {
  if (!activity) return "Статус недоступен";
  if (activity.typing) return "Печатает…";
  if (activity.online) return "В сети";
  if (!activity.last_seen_at) return "Не в сети";
  const seen = new Date(activity.last_seen_at);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const day =
    seen.toDateString() === today.toDateString()
      ? "сегодня"
      : seen.toDateString() === yesterday.toDateString()
        ? "вчера"
        : seen.toLocaleDateString("ru-RU", {
            day: "numeric",
            month: "long",
            year: "numeric",
          });
  return "Был(а) в сети " + day + " в " + clock(activity.last_seen_at);
}

export type SendTyping = (did: number, active: boolean) => void;
export function useTyping(did: number, send: SendTyping) {
  const lastSignal = useRef<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const stop = useCallback(() => {
    clearTimeout(timer.current);
    if (lastSignal.current !== null) send(did, false);
    lastSignal.current = null;
  }, [did, send]);
  useEffect(() => stop, [stop]);
  function change(text: string) {
    if (!text.trim()) {
      stop();
      return;
    }
    const now = performance.now();
    if (lastSignal.current === null || now - lastSignal.current >= 1500) {
      send(did, true);
      lastSignal.current = now;
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(stop, 2500);
  }
  return { change, stop };
}
