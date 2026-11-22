import { Settings2 } from "lucide-react";

import { androidClient } from "../platform";

export function ServerSettings({ compact = false }: { compact?: boolean }) {
  if (!androidClient) return null;
  return (
    <a
      className={compact ? "icon-btn" : "server-settings"}
      href="imsitchat://server"
      aria-label="Адрес сервера"
    >
      <Settings2 size={compact ? 18 : 15} aria-hidden="true" />
      {!compact && "Адрес сервера"}
    </a>
  );
}
