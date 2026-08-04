import { useCallback, useRef, useState } from "react";
import type { MouseEvent, PointerEvent, WheelEvent } from "react";

import { startPetDragging } from "../services/window";

const DRAG_THRESHOLD_PX = 8;

export function usePetWindowDrag(
  onClick: () => void,
  onDoubleClick: () => void,
  onScaleWheel: (deltaY: number) => void,
) {
  const [isDragging, setIsDragging] = useState(false);
  const pointerRef = useRef<{ id: number; x: number; y: number; didDrag: boolean; didScale: boolean } | null>(null);
  const suppressClickRef = useRef(false);

  const onPointerDown = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || !event.isPrimary) return;
    pointerRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, didDrag: false, didScale: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, []);

  const onPointerMove = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId || pointer.didDrag || pointer.didScale) return;
    if (!pointer.didDrag && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) < DRAG_THRESHOLD_PX) return;

    pointer.didDrag = true;
    suppressClickRef.current = true;
    setIsDragging(true);
    void startPetDragging().catch((error) => {
      console.error("[desktop-pet] Failed to start dragging the pet window.", error);
    }).finally(() => setIsDragging(false));
  }, []);

  const onPointerUp = useCallback((event: PointerEvent<HTMLButtonElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    if (pointer.didDrag || pointer.didScale) suppressClickRef.current = true;
    pointerRef.current = null;
    setIsDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  const onPointerCancel = useCallback(() => {
    pointerRef.current = null;
    setIsDragging(false);
  }, []);

  const handleClick = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    onClick();
  }, [onClick]);

  const handleDoubleClick = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    onDoubleClick();
  }, [onDoubleClick]);

  const onWheel = useCallback((event: WheelEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const pointer = pointerRef.current;
    if (!pointer || pointer.didDrag) return;

    pointer.didScale = true;
    suppressClickRef.current = true;
    onScaleWheel(event.deltaY);
  }, [onScaleWheel]);

  return { handleClick, handleDoubleClick, isDragging, onPointerCancel, onPointerDown, onPointerMove, onPointerUp, onWheel };
}
