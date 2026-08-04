import type { ReactNode } from "react";

interface PetBubbleProps {
  children: ReactNode;
  onClose: () => void;
}

export function PetBubble({ children, onClose }: PetBubbleProps) {
  return <section className="pet-bubble" onClick={(event) => event.stopPropagation()} aria-label="桌宠快捷面板"><button className="bubble-close" aria-label="关闭快捷面板" onClick={onClose} type="button">×</button>{children}</section>;
}
