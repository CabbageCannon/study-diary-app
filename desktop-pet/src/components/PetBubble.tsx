import { useState, type ReactNode } from "react";

interface PetBubbleProps {
  children: ReactNode;
  onClose: () => void;
  onHide: () => Promise<void>;
}

export function PetBubble({ children, onClose, onHide }: PetBubbleProps) {
  const [isHiding, setIsHiding] = useState(false);

  async function hidePet() {
    if (isHiding) return;
    setIsHiding(true);
    try {
      await onHide();
    } finally {
      setIsHiding(false);
    }
  }

  return (
    <section className="pet-bubble" onClick={(event) => event.stopPropagation()} aria-label="桌宠快捷面板">
      <div className="bubble-controls">
        <button aria-label="隐藏桌宠" className="bubble-hide" disabled={isHiding} onClick={() => void hidePet()} title="隐藏桌宠" type="button">—</button>
        <button aria-label="关闭快捷面板" className="bubble-close" onClick={onClose} title="关闭快捷面板" type="button">×</button>
      </div>
      {children}
    </section>
  );
}
