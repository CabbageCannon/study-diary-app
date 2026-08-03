import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface PopoverMenuProps {
  label: string;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}

interface Position {
  top: number;
  left: number;
}

const OPEN_DELAY_MS = 100;
const CLOSE_DELAY_MS = 150;

function supportsHover() {
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

export function PopoverMenu({ label, children, className = "", disabled = false }: PopoverMenuProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [position, setPosition] = useState<Position>({ top: 0, left: 0 });

  function clearTimer() {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function close() {
    clearTimer();
    setOpen(false);
    setPinned(false);
  }

  function scheduleOpen() {
    if (disabled || !supportsHover()) return;
    clearTimer();
    timerRef.current = window.setTimeout(() => setOpen(true), OPEN_DELAY_MS);
  }

  function scheduleClose() {
    if (pinned || !supportsHover()) return;
    clearTimer();
    timerRef.current = window.setTimeout(close, CLOSE_DELAY_MS);
  }

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const updatePosition = () => {
      const trigger = triggerRef.current?.getBoundingClientRect();
      const menu = menuRef.current?.getBoundingClientRect();
      if (!trigger || !menu) return;
      const viewportPadding = 10;
      const placeAbove = window.innerHeight - trigger.bottom < menu.height + viewportPadding && trigger.top > menu.height;
      setPosition({
        top: placeAbove ? trigger.top - menu.height - 6 : trigger.bottom + 6,
        left: Math.max(viewportPadding, Math.min(trigger.right - menu.width, window.innerWidth - menu.width - viewportPadding)),
      });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => () => clearTimer(), []);

  const menu = open ? createPortal(
    <div
      className="popover-menu-panel"
      ref={menuRef}
      role="menu"
      style={{ top: position.top, left: position.left }}
      onPointerEnter={clearTimer}
      onPointerLeave={scheduleClose}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest("button")) close();
      }}
    >
      {children}
    </div>,
    document.body,
  ) : null;

  return (
    <span className={`popover-menu ${className}`} onPointerEnter={scheduleOpen} onPointerLeave={scheduleClose}>
      <button
        className="popover-menu-trigger"
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
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
      {menu}
    </span>
  );
}
