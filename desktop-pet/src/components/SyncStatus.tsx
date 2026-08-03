interface SyncStatusProps {
  pendingCount: number;
  isSyncing: boolean;
  error: string;
}

export function SyncStatus({ pendingCount, isSyncing, error }: SyncStatusProps) {
  if (error) return <p className="sync-status sync-status-error" role="status">{error}</p>;
  if (isSyncing) return <p className="sync-status">正在同步学习记录…</p>;
  if (pendingCount) return <p className="sync-status">{pendingCount} 个学习事件待同步</p>;
  return <p className="sync-status">学习记录已同步</p>;
}
