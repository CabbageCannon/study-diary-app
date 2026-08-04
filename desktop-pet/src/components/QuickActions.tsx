import { useState } from "react";

import type { StudyRouteKey } from "../services/appLinks";

interface QuickActionsProps {
  onOpenRoute: (route: StudyRouteKey) => Promise<void>;
  onOpenLocalSettings: () => void;
  onRouteOpened: () => void;
}

const actions: Array<{ key: StudyRouteKey; label: string }> = [
  { key: "diary", label: "学习日记" },
  { key: "interview", label: "八股训练" },
  { key: "algorithms", label: "算法训练" },
];

export function QuickActions({ onOpenRoute, onOpenLocalSettings, onRouteOpened }: QuickActionsProps) {
  const [opening, setOpening] = useState<StudyRouteKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleOpen(route: StudyRouteKey) {
    if (opening) return;
    setOpening(route);
    setError(null);
    try {
      await onOpenRoute(route);
      onRouteOpened();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      console.error("[desktop-pet] Failed to open study route.", reason);
      setError(message);
    } finally {
      setOpening(null);
    }
  }

  return (
    <div className="quick-actions">
      {actions.map((action) => (
        <button disabled={opening !== null} key={action.key} onClick={() => void handleOpen(action.key)} type="button">
          {opening === action.key ? "正在打开…" : action.label}
        </button>
      ))}
      <button disabled={opening !== null} onClick={onOpenLocalSettings} type="button">本地设置</button>
      {error ? <p className="quick-actions-error" role="status">{error}</p> : null}
    </div>
  );
}
