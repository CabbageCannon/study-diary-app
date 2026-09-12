import { useEffect, useState } from "react";
import { WifiSlashIcon } from "@phosphor-icons/react/WifiSlash";

export function PwaStatus() {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, []);

  return (
    <div className="pwa-status-layer" aria-live="polite">
      {!isOnline ? <p className="network-status network-status-offline"><WifiSlashIcon aria-hidden="true" size={17} weight="bold" />离线模式：未提交的草稿只保存在此设备。</p> : null}
    </div>
  );
}
