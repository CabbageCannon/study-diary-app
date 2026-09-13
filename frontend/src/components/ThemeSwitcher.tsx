import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { PaletteIcon } from "@phosphor-icons/react/Palette";
import { flushSync } from "react-dom";

import { useTheme } from "../contexts/ThemeContext";
import { THEMES } from "../contexts/themes";

const HOLD_MS = 520;
const RADIUS = 190;
const DEAD_ZONE = 46;
/** 四分之一圆盘覆盖 atan2 的 90°（正下）→ 180°（正左）。 */
const SECTOR = 90 / THEMES.length;

function polar(degrees: number, radius: number) {
  const radians = (degrees * Math.PI) / 180;
  return [Math.cos(radians) * radius, Math.sin(radians) * radius] as const;
}

/** 用 View Transitions 从按钮中心做圆形扩散；不支持或用户要求减弱动效时直接切换。 */
function ripple(origin: HTMLElement | null, commit: () => void) {
  const rect = origin?.getBoundingClientRect();
  if (!rect || !document.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    commit();
    return;
  }
  document.documentElement.style.setProperty("--vt-x", `${rect.left + rect.width / 2}px`);
  document.documentElement.style.setProperty("--vt-y", `${rect.top + rect.height / 2}px`);
  document.startViewTransition(() => flushSync(commit));
}

export function ThemeSwitcher() {
  const { setTheme, cycleTheme } = useTheme();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const centerRef = useRef({ x: 0, y: 0 });
  const startRef = useRef({ x: 0, y: 0 });
  const timerRef = useRef(0);
  const suppressClick = useRef(false);
  const [holding, setHolding] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [picked, setPicked] = useState<number | null>(null);

  function cancelHold() {
    window.clearTimeout(timerRef.current);
    setHolding(false);
  }

  function closeMenu() {
    setMenu(null);
    setPicked(null);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    suppressClick.current = false;
    const rect = event.currentTarget.getBoundingClientRect();
    centerRef.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    startRef.current = { x: event.clientX, y: event.clientY };
    setHolding(true);
    timerRef.current = window.setTimeout(() => {
      suppressClick.current = true;
      setHolding(false);
      setPicked(null);
      setMenu(centerRef.current);
      navigator.vibrate?.(20);
    }, HOLD_MS);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!menu) {
      if (Math.hypot(event.clientX - startRef.current.x, event.clientY - startRef.current.y) > 9) cancelHold();
      return;
    }
    const dx = event.clientX - centerRef.current.x;
    const dy = event.clientY - centerRef.current.y;
    const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
    const distance = Math.hypot(dx, dy);
    setPicked(distance < DEAD_ZONE || distance > RADIUS || angle < 90 || angle > 180
      ? null
      : Math.min(THEMES.length - 1, Math.floor((angle - 90) / SECTOR)));
  }

  function onPointerUp() {
    cancelHold();
    if (!menu) return;
    const index = picked;
    closeMenu();
    if (index !== null) ripple(buttonRef.current, () => setTheme(THEMES[index].id));
  }

  return <>
    {menu ? <div aria-hidden="true" className="theme-disc" style={{ top: menu.y, left: menu.x - RADIUS, width: RADIUS, height: RADIUS }}>
      <svg viewBox={`${-RADIUS} 0 ${RADIUS} ${RADIUS}`}>
        {THEMES.map((item, index) => {
          const from = 90 + index * SECTOR;
          const [x0, y0] = polar(from, RADIUS);
          const [x1, y1] = polar(from + SECTOR, RADIUS);
          const [labelX, labelY] = polar(from + SECTOR / 2, RADIUS * 0.66);
          return <g className={picked === index ? "theme-disc-sector is-picked" : "theme-disc-sector"} key={item.id}>
            <path d={`M0 0L${x0} ${y0}A${RADIUS} ${RADIUS} 0 0 1 ${x1} ${y1}Z`} />
            <circle cx={labelX} cy={labelY - 12} fill={item.colors[0]} r="7" />
            <text x={labelX} y={labelY + 10}>{item.label}</text>
          </g>;
        })}
      </svg>
    </div> : null}
    <button
      aria-label="切换主题：轻点循环切换，长按选择具体主题"
      className={holding ? "theme-switcher is-holding" : "theme-switcher"}
      onClick={() => {
        if (suppressClick.current) { suppressClick.current = false; return; }
        ripple(buttonRef.current, cycleTheme);
      }}
      onContextMenu={(event) => event.preventDefault()}
      onPointerCancel={() => { cancelHold(); closeMenu(); }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      ref={buttonRef}
      type="button"
    >
      <PaletteIcon aria-hidden="true" size={21} />
    </button>
  </>;
}
