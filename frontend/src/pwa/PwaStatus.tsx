import { useEffect, useState } from "react";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/ArrowClockwise";
import { SpinnerGapIcon } from "@phosphor-icons/react/SpinnerGap";
import { WifiSlashIcon } from "@phosphor-icons/react/WifiSlash";

import { usePwaUpdate } from "../contexts/PwaUpdateContext";

export function PwaStatus() {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [dismissed, setDismissed] = useState(false);
  const { applyUpdate, phase } = usePwaUpdate();

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

  useEffect(() => { if (phase === "available") setDismissed(false); }, [phase]);

  const showUpdate = !dismissed && ["available", "updating", "reloading", "restart"].includes(phase);
  const busy = phase === "updating" || phase === "reloading";
  const title = phase === "available" ? "发现新版本" : phase === "restart" ? "新版本已经下载" : phase === "reloading" ? "正在重新打开" : "正在安装更新";
  const note = phase === "available" ? "现在更新只需几秒。" : phase === "restart" ? "请关闭应用，再从主屏幕重新打开。" : "保持页面打开，很快就好。";

  return (
    <div className="pwa-status-layer" aria-live="polite">
      {!isOnline ? <p className="network-status network-status-offline"><WifiSlashIcon aria-hidden="true" size={17} weight="bold" />离线模式：未提交的草稿只保存在此设备。</p> : null}
      {showUpdate ? <aside aria-busy={busy} className="pwa-update-prompt" aria-label="应用更新可用"><div><strong>{title}</strong><span>{note}</span></div>{busy ? <SpinnerGapIcon aria-hidden="true" className="pwa-update-spinner" size={21} /> : <div><button className="button button-tertiary" onClick={() => setDismissed(true)} type="button">{phase === "restart" ? "知道了" : "稍后"}</button>{phase === "available" ? <button className="button button-primary" onClick={() => void applyUpdate()} type="button"><ArrowClockwiseIcon aria-hidden="true" size={16} weight="bold" />立即更新</button> : null}</div>}</aside> : null}
    </div>
  );
}
