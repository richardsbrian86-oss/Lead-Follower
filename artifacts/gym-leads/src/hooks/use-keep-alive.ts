import { useEffect } from "react";

const PING_INTERVAL_MS = 4 * 60 * 1000;
const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

export function useKeepAlive() {
  useEffect(() => {
    const ping = () => {
      fetch(`${BASE_URL}/api/healthz`, { method: "GET" }).catch(() => {});
    };

    ping();
    const id = setInterval(ping, PING_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);
}
