import { type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";

interface SwipeRoutePagerProps {
  ariaLabel: string;
  children: ReactNode;
  className: string;
  contentClassName: string;
  pages: readonly ReactNode[];
  routes: readonly string[];
}

interface SwipeGesture {
  axis: "pending" | "horizontal" | "vertical";
  direction: -1 | 1;
  distance: number;
  lastClientX: number;
  lastTime: number;
  pointerId: number;
  scrollY: number;
  startX: number;
  startY: number;
  targetIndex: number;
  velocity: number;
  width: number;
}

function isInteractive(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("a, button, input, textarea, select, [contenteditable='true'], [data-no-page-swipe]"));
}

function nextFrame() {
  return new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
}

export function SwipeRoutePager({ ariaLabel, children, className, contentClassName, pages, routes }: SwipeRoutePagerProps) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const activeIndex = Math.max(0, routes.indexOf(pathname));
  const [displayedIndex, setDisplayedIndex] = useState(activeIndex);
  const [targetIndex, setTargetIndex] = useState<number | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const currentRef = useRef<HTMLDivElement | null>(null);
  const targetRef = useRef<HTMLDivElement | null>(null);
  const gestureRef = useRef<SwipeGesture | null>(null);
  const settlingRef = useRef(false);

  function positionPanels(gesture: SwipeGesture) {
    const current = currentRef.current;
    const target = targetRef.current;
    const targetStart = -gesture.direction * gesture.width;
    const progress = Math.min(1, Math.abs(gesture.distance) / gesture.width);
    if (current) {
      current.style.transform = `translate3d(${gesture.distance}px, 0, 0)`;
      current.style.opacity = String(1 - progress * 0.08);
    }
    if (target) {
      target.style.transform = `translate3d(${targetStart + gesture.distance}px, 0, 0)`;
      target.style.opacity = String(0.88 + progress * 0.12);
    }
  }

  function clearPanels() {
    for (const panel of [currentRef.current, targetRef.current]) {
      if (!panel) continue;
      panel.getAnimations().forEach((animation) => animation.cancel());
      panel.style.removeProperty("transform");
      panel.style.removeProperty("opacity");
    }
    viewportRef.current?.removeAttribute("data-dragging");
  }

  useLayoutEffect(() => {
    const gesture = gestureRef.current;
    if (targetIndex === null || !gesture) return;
    positionPanels(gesture);
  }, [targetIndex]);

  useLayoutEffect(() => {
    if (!settlingRef.current && displayedIndex !== activeIndex) setDisplayedIndex(activeIndex);
  }, [activeIndex, displayedIndex]);

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const holdVerticalPosition = (event: TouchEvent) => {
      if (gestureRef.current?.axis === "horizontal" && event.cancelable) event.preventDefault();
    };
    workspace.addEventListener("touchmove", holdVerticalPosition, { passive: false });
    return () => workspace.removeEventListener("touchmove", holdVerticalPosition);
  }, []);

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || event.pointerType === "mouse" || settlingRef.current || isInteractive(event.target)) return;
    gestureRef.current = {
      axis: "pending",
      direction: 1,
      distance: 0,
      lastClientX: event.clientX,
      lastTime: event.timeStamp,
      pointerId: event.pointerId,
      scrollY: window.scrollY,
      startX: event.clientX,
      startY: event.clientY,
      targetIndex: -1,
      velocity: 0,
      width: event.currentTarget.clientWidth,
    };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId || gesture.axis === "vertical") return;

    const rawX = event.clientX - gesture.startX;
    const rawY = event.clientY - gesture.startY;
    if (gesture.axis === "pending") {
      if (Math.max(Math.abs(rawX), Math.abs(rawY)) < 9) return;
      if (Math.abs(rawY) >= Math.abs(rawX)) {
        gesture.axis = "vertical";
        return;
      }

      gesture.axis = "horizontal";
      gesture.direction = rawX < 0 ? -1 : 1;
      gesture.targetIndex = activeIndex + (gesture.direction < 0 ? 1 : -1);
      try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Safari may already own the pointer. */ }
      if (gesture.targetIndex >= 0 && gesture.targetIndex < routes.length) {
        viewportRef.current?.setAttribute("data-dragging", "true");
        setTargetIndex(gesture.targetIndex);
      }
    }

    event.preventDefault();
    if (document.scrollingElement && document.scrollingElement.scrollTop !== gesture.scrollY) {
      document.scrollingElement.scrollTop = gesture.scrollY;
    }
    if (gesture.targetIndex < 0 || gesture.targetIndex >= routes.length) return;

    const nextDistance = gesture.direction < 0
      ? Math.max(-gesture.width, Math.min(0, rawX))
      : Math.min(gesture.width, Math.max(0, rawX));
    const elapsed = Math.max(1, event.timeStamp - gesture.lastTime);
    gesture.velocity = (event.clientX - gesture.lastClientX) / elapsed;
    gesture.lastClientX = event.clientX;
    gesture.lastTime = event.timeStamp;
    gesture.distance = nextDistance;
    positionPanels(gesture);
  }

  async function settle(complete: boolean) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.targetIndex < 0 || gesture.targetIndex >= routes.length) {
      gestureRef.current = null;
      return;
    }

    settlingRef.current = true;
    await nextFrame();
    const current = currentRef.current;
    const target = targetRef.current;
    const targetStart = -gesture.direction * gesture.width;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const options: KeyframeAnimationOptions = {
      duration: reducedMotion ? 1 : 260,
      easing: "cubic-bezier(.22,.8,.25,1)",
      fill: "forwards",
    };
    const animations = [
      current?.animate([
        { opacity: current.style.opacity || "1", transform: current.style.transform || "none" },
        { opacity: complete ? 0.9 : 1, transform: `translate3d(${complete ? gesture.direction * gesture.width : 0}px, 0, 0)` },
      ], options),
      target?.animate([
        { opacity: target.style.opacity || "0.88", transform: target.style.transform || `translate3d(${targetStart}px, 0, 0)` },
        { opacity: complete ? 1 : 0.88, transform: `translate3d(${complete ? 0 : targetStart}px, 0, 0)` },
      ], options),
    ].filter(Boolean) as Animation[];

    await Promise.all(animations.map((animation) => animation.finished.catch(() => undefined)));
    if (complete) {
      flushSync(() => setDisplayedIndex(gesture.targetIndex));
      flushSync(() => navigate(routes[gesture.targetIndex], { replace: true }));
      await nextFrame();
    }
    clearPanels();
    gestureRef.current = null;
    settlingRef.current = false;
    setTargetIndex(null);
  }

  function handlePointerEnd(event: ReactPointerEvent<HTMLDivElement>, cancelled = false) {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* Pointer capture is optional. */ }
    if (gesture.axis !== "horizontal" || gesture.targetIndex < 0 || gesture.targetIndex >= routes.length) {
      gestureRef.current = null;
      return;
    }
    const sameDirection = Math.sign(gesture.velocity) === gesture.direction;
    const complete = Math.abs(gesture.distance) >= gesture.width * 0.28 || !cancelled && sameDirection && Math.abs(gesture.velocity) >= 0.45;
    void settle(complete);
  }

  return (
    <div
      className={`${className} swipe-workspace`}
      onPointerCancel={(event) => handlePointerEnd(event, true)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      ref={workspaceRef}
    >
      {children}
      <div aria-label={ariaLabel} className="swipe-route-viewport" ref={viewportRef} role="group">
        <div className={`${contentClassName} swipe-route-current`} ref={currentRef}>{pages[displayedIndex]}</div>
        {targetIndex !== null ? (
          <div aria-hidden="true" className={`${contentClassName} swipe-route-target`} inert ref={targetRef}>{pages[targetIndex]}</div>
        ) : null}
      </div>
    </div>
  );
}
