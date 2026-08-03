interface QuickActionsProps {
  onOpenDiary: () => void;
  onOpenInterview: () => void;
  onOpenAlgorithms: () => void;
  onOpenDashboard: () => void;
  onOpenSettings: () => void;
}

export function QuickActions({ onOpenDiary, onOpenInterview, onOpenAlgorithms, onOpenDashboard, onOpenSettings }: QuickActionsProps) {
  return <div className="quick-actions"><button onClick={onOpenDiary} type="button">学习日记</button><button onClick={onOpenInterview} type="button">八股训练</button><button onClick={onOpenAlgorithms} type="button">算法训练</button><button onClick={onOpenDashboard} type="button">今日概况</button><button onClick={onOpenSettings} type="button">桌宠设置</button></div>;
}
