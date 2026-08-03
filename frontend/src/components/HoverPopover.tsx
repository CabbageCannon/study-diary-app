import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from "react";

interface PopoverPosition {
  top: number;
  left: number;
}

export interface HoverPopoverTriggerProps {
  ref: RefObject<HTMLButtonElement | null>;
  expanded: boolean;
  onClick: () => void;
  onFocus: () => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
}

interface HoverPopoverProps {
  className?: string;
  panelAriaLabel: string;
  panelClassName?: string;
  panelRole?: "dialog" | "listbox" | "menu";
  disabled?: boolean;
  renderTrigger: (props: HoverPopoverTriggerProps) => ReactNode;
  children: (controls: { close: () => void }) => ReactNode;
}

const OPEN_DELAY_MS = 100;
const CLOSE_DELAY_MS = 160;
const HOVER_POPOVER_OPEN_EVENT = "study-diary:hover-popover-open";

function supportsHover() {
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

export function HoverPopover({
  className = "",
  panelAriaLabel,
  panelClassName = "",
  panelRole = "dialog",
  disabled = false,
  renderTrigger,
  children,
}: HoverPopoverProps) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const popoverIdRef = useRef(Symbol("hover-popover"));
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [position, setPosition] = useState<PopoverPosition>({ top: 0, left: 0 });

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

  function announceOpening() {
    document.dispatchEvent(new CustomEvent(HOVER_POPOVER_OPEN_EVENT, { detail: popoverIdRef.current }));
  }

  function openFromHover() {
    if (disabled || !supportsHover()) {
      return;
    }
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      announceOpening();
      setOpen(true);
      setPinned(false);
    }, OPEN_DELAY_MS);
  }

  function closeFromHover() {
    if (pinned || !supportsHover()) {
      return;
    }
    clearTimer();
    timerRef.current = window.setTimeout(close, CLOSE_DELAY_MS);
  }

  function toggleFromClick() {
    clearTimer();
    if (open && !pinned) {
      setPinned(true);
      return;
    }
    const nextOpen = !open;
    if (nextOpen) {
      announceOpening();
    }
    setOpen(nextOpen);
    setPinned(nextOpen);
  }

  function openFromFocus() {
    if (disabled) {
      return;
    }
    clearTimer();
    announceOpening();
    setOpen(true);
    setPinned(true);
  }

  function openFromKeyboard(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (disabled || !["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) {
      return;
    }
    event.preventDefault();
    clearTimer();
    announceOpening();
    setOpen(true);
    setPinned(true);
    window.requestAnimationFrame(() => panelRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus());
  }

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !panelRef.current) {
      return;
    }

    const updatePosition = () => {
      const trigger = triggerRef.current?.getBoundingClientRect();
      const panel = panelRef.current?.getBoundingClientRect();
      if (!trigger || !panel) {
        return;
      }

      const viewportPadding = 12;
      const placeAbove = window.innerHeight - trigger.bottom < panel.height + viewportPadding && trigger.top > panel.height + viewportPadding;
      setPosition({
        top: placeAbove ? trigger.top - panel.height - 8 : trigger.bottom + 8,
        left: Math.max(viewportPadding, Math.min(trigger.left, window.innerWidth - panel.width - viewportPadding)),
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
    const closeWhenAnotherPopoverOpens = (event: Event) => {
      if ((event as CustomEvent<symbol>).detail !== popoverIdRef.current) {
        close();
      }
    };
    document.addEventListener(HOVER_POPOVER_OPEN_EVENT, closeWhenAnotherPopoverOpens);
    return () => document.removeEventListener(HOVER_POPOVER_OPEN_EVENT, closeWhenAnotherPopoverOpens);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        close();
      }
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

  const panel = open ? createPortal(
    <div
      aria-label={panelAriaLabel}
      className={`hover-popover-panel ${panelClassName}`}
      ref={panelRef}
      role={panelRole}
      style={{ top: position.top, left: position.left }}
      onPointerEnter={clearTimer}
      onPointerLeave={closeFromHover}
    >
      {children({ close })}
    </div>,
    document.body,
  ) : null;

  return (
    <span className={`hover-popover ${className}`} onPointerEnter={openFromHover} onPointerLeave={closeFromHover}>
      {renderTrigger({ ref: triggerRef, expanded: open, onClick: toggleFromClick, onFocus: openFromFocus, onKeyDown: openFromKeyboard })}
      {panel}
    </span>
  );
}
