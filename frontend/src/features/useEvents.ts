import { androidClient } from "../platform";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Message } from "../api/client";

import type { Activity, SendTyping } from "./activity";

export function useEvents(
  onMessage: (m: Message) => void,
  onReady: () => void,
) {
  const callbacks = useRef({ onMessage, onReady });
  callbacks.current = { onMessage, onReady };
  const [online, setOnline] = useState(false);
  const [activity, setActivity] = useState<Record<number, Activity>>({});
  const liveSocket = useRef<WebSocket | null>(null);
  const sendTyping = useCallback<SendTyping>((did, active) => {
    const socket = liveSocket.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "typing", dialog_id: did, active }));
    }
  }, []);
  useEffect(() => {
    let stopped = false,
      timer: ReturnType<typeof setTimeout>,
      current: WebSocket | null = null,
      delay = 500;
    function connect() {
      clearTimeout(timer);
      const unavailable = androidClient
        ? window.imsitForeground === false
        : !navigator.onLine;
      if (stopped || current || unavailable) return;
      let ready = false;
      const socket = new WebSocket(
        (location.protocol === "https:" ? "wss://" : "ws://") +
          location.host +
          "/api/events",
      );
      current = socket;
      socket.onmessage = (e) => {
        if (stopped || current !== socket) return;
        const event = JSON.parse(e.data);
        if (!ready) {
          ready = true;
          liveSocket.current = socket;
          delay = 500;
          setOnline(true);
          callbacks.current.onReady();
        }
        if (Array.isArray(event.activity)) {
          setActivity(
            Object.fromEntries(
              event.activity.map((a: Activity) => [a.dialog_id, a]),
            ),
          );
        }
        if (event.type === "message.created")
          callbacks.current.onMessage(event.message);
      };
      socket.onclose = (e) => {
        if (stopped || current !== socket) return;
        current = liveSocket.current = null;
        setActivity({});
        setOnline(false);
        if (e.code === 4401) {
          window.dispatchEvent(new Event("session-ended"));
          return;
        }
        if (
          androidClient ? window.imsitForeground !== false : navigator.onLine
        ) {
          timer = setTimeout(connect, delay);
          delay = Math.min(10000, delay * 2);
        }
      };
    }
    function disconnect() {
      clearTimeout(timer);
      const socket = current;
      current = liveSocket.current = null;
      setActivity({});
      socket?.close();
      setOnline(false);
    }
    function visibilityChanged() {
      if (window.imsitForeground === false) disconnect();
      else connect();
    }
    if (androidClient)
      window.addEventListener("imsit-visibility", visibilityChanged);
    window.addEventListener("online", connect);
    window.addEventListener("offline", androidClient ? connect : disconnect);
    connect();
    return () => {
      stopped = true;
      liveSocket.current = null;
      clearTimeout(timer);
      current?.close();
      window.removeEventListener("online", connect);
      window.removeEventListener(
        "offline",
        androidClient ? connect : disconnect,
      );
      if (androidClient)
        window.removeEventListener("imsit-visibility", visibilityChanged);
    };
  }, []);
  return { online, activity, sendTyping };
}
