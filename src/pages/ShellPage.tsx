import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { getWsUrl, type User } from "../lib/api";
import type { ConnectionConfig } from "../vite-env";

export type ShellOutletContext = {
  live: boolean;
  user: User;
  onLogout: () => Promise<void>;
};

export default function ShellPage({
  user,
  config,
  onLogout,
}: {
  user: User;
  config: ConnectionConfig;
  onLogout: () => Promise<void>;
  onOpenSetup: () => void;
}) {
  const [live, setLive] = useState(false);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let closed = false;

    function connect() {
      if (closed) return;
      try {
        ws = new WebSocket(getWsUrl());
        ws.onopen = () => setLive(true);
        ws.onclose = () => {
          setLive(false);
          if (!closed) setTimeout(connect, 2000);
        };
        ws.onerror = () => ws?.close();
        timer = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, 20000);
      } catch {
        setLive(false);
        setTimeout(connect, 2000);
      }
    }

    connect();
    return () => {
      closed = true;
      if (timer) clearInterval(timer);
      ws?.close();
    };
  }, [config.hostUrl]);

  return (
    <div className="shell">
      <main className="main">
        <Outlet context={{ live, user, onLogout } as ShellOutletContext} />
      </main>
    </div>
  );
}
