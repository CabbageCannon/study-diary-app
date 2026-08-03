import { ConfirmActionDialog } from "../interview/ConfirmActionDialog";

interface RefreshDailyRecommendationDialogProps {
  open: boolean;
  isRefreshing: boolean;
  hasExistingLearning: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function RefreshDailyRecommendationDialog({ open, isRefreshing, hasExistingLearning, onCancel, onConfirm }: RefreshDailyRecommendationDialogProps) {
  return <ConfirmActionDialog confirmLabel="刷新今日推荐" description={hasExistingLearning ? "刷新只会更换首页推荐，之前的训练和记录仍会保留。" : "这会按最新训练设置重新生成今天的主推荐和继续刷列表。"} isConfirming={isRefreshing} onCancel={onCancel} onConfirm={onConfirm} open={open} title="刷新今天的推荐" />;
}
