import { useEffect, useRef, useState, type ReactNode } from "react";

interface ExpandableSectionProps {
  label: string;
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
}

const HOVER_OPEN_DELAY_MS = 100;
const HOVER_CLOSE_DELAY_MS = 150;

function supportsHover() {
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

export function ExpandableSection({ label, children, className = "", defaultOpen = false }: ExpandableSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [pinned, setPinned] = useState(defaultOpen);
  const timerRef = useRef<number | null>(null);

  function clearTimer() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function scheduleOpen() {
    if (!supportsHover()) return;
    clearTimer();
    timerRef.current = window.setTimeout(() => setOpen(true), HOVER_OPEN_DELAY_MS);
  }

  function scheduleClose() {
    if (pinned || !supportsHover()) return;
    clearTimer();
    timerRef.current = window.setTimeout(() => setOpen(false), HOVER_CLOSE_DELAY_MS);
  }

  useEffect(() => () => clearTimer(), []);

  return (
    <section className={`expandable-section ${open ? "expandable-section-open" : ""} ${className}`} onPointerEnter={scheduleOpen} onPointerLeave={scheduleClose}>
      <button
        className="expandable-section-trigger"
        type="button"
        aria-expanded={open}
        onClick={() => {
          clearTimer();
          if (open && !pinned) {
            setPinned(true);
            return;
          }
          const next = !open;
          setOpen(next);
          setPinned(next);
        }}
      >
        {label}
      </button>
      <div className="expandable-section-content"><div>{children}</div></div>
    </section>
  );
}
