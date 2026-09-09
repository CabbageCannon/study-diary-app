import { useEffect, useState } from "react";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/ArrowClockwise";
import { WifiSlashIcon } from "@phosphor-icons/react/WifiSlash";
import { registerSW } from "virtual:pwa-register";

export function PwaStatus() {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [updateReady, setUpdateReady] = useState(false);
  const [updateServiceWorker, setUpdateServiceWorker] = useState<((reloadPage?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    const online = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    const update = registerSW({
      immediate: true,
      onNeedRefresh() {
        setUpdateReady(true);
      },
    });
    setUpdateServiceWorker(() => update);
    return () => {
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, []);

  return (
    <div className="pwa-status-layer" aria-live="polite">
      {!isOnline ? <p className="network-status network-status-offline"><WifiSlashIcon aria-hidden="true" size={17} weight="bold" />离线模式：未提交的草稿只保存在此设备。</p> : null}
      {updateReady ? <aside className="pwa-update-prompt" aria-label="应用更新可用"><div><strong>新版本已准备好</strong><span>完成当前操作后再更新。</span></div><div><button className="button button-tertiary" onClick={() => setUpdateReady(false)} type="button">稍后</button><button className="button button-primary" onClick={() => void updateServiceWorker?.(true)} type="button"><ArrowClockwiseIcon aria-hidden="true" size={16} weight="bold" />立即更新</button></div></aside> : null}
    </div>
  );
}
