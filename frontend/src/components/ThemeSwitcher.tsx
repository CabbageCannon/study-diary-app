import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
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

export function ThemeSwitcher() {
  const { setTheme, cycleTheme } = useTheme();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const centerRef = useRef({ x: 0, y: 0 });
  const startRef = useRef({ x: 0, y: 0 });
  const timerRef = useRef(0);
  const suppressClick = useRef(false);
  /** 兜底路径启动的长按：过渡期间 pointerup 同样到不了按钮，得在 document 上收尾。 */
  const fallbackRef = useRef(false);
  /** 波纹进行中：此时再点或再选都限流，避免叠第二层过渡。 */
  const transitioningRef = useRef(false);

  /** 用 View Transitions 从按钮中心做圆形扩散；不支持或用户要求减弱动效时直接切换。 */
  function ripple(commit: () => void) {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect || !document.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      commit();
      return;
    }
    document.documentElement.style.setProperty("--vt-x", `${rect.left + rect.width / 2}px`);
    document.documentElement.style.setProperty("--vt-y", `${rect.top + rect.height / 2}px`);
    transitioningRef.current = true;
    // 过渡被跳过时 finished 会 reject，接住以免变成 unhandled rejection
    void document.startViewTransition(() => flushSync(commit)).finished.catch(() => {}).finally(() => { transitioningRef.current = false; });
  }
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

  function beginHold(clientX: number, clientY: number, rect: DOMRect) {
    suppressClick.current = false;
    centerRef.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    startRef.current = { x: clientX, y: clientY };
    setHolding(true);
    timerRef.current = window.setTimeout(() => {
      suppressClick.current = true;
      setHolding(false);
      setPicked(null);
      setMenu(centerRef.current);
      navigator.vibrate?.(20);
    }, HOLD_MS);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    // 触摸有浏览器隐式捕获，鼠标没有：不显式捕获的话，拖出按钮再松手收不到 pointerup，圆盘会卡住不关。
    event.currentTarget.setPointerCapture(event.pointerId);
    beginHold(event.clientX, event.clientY, event.currentTarget.getBoundingClientRect());
  }

  // View Transitions 期间浏览器让 :root 子树跳过命中测试，pointerdown 到不了按钮，长按就废了；
  // CSS 的 ::view-transition { pointer-events: none } 是标准解法但不保证生效（该跳过行为作者无法撤销）。
  // 这里在 document 捕获阶段按坐标补一次判定，并把指针捕获到按钮上，后续 move/up 尽量走按钮原有逻辑。
  useEffect(() => {
    function onDocumentPointerDown(event: PointerEvent) {
      const node = buttonRef.current;
      if (!node || node.contains(event.target as Node)) return;
      const rect = node.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
      node.setPointerCapture(event.pointerId);
      fallbackRef.current = true;
      beginHold(event.clientX, event.clientY, rect);
    }
    // 兜底路径下 up/cancel 也可能到不了按钮。不在这里收尾的话，过渡期间的轻点会因为计时器没被清掉，
    // 在 520ms 后自己弹出圆盘 —— 看起来就是「点击变成长按」。
    function onDocumentPointerEnd() {
      if (!fallbackRef.current) return;
      fallbackRef.current = false;
      cancelHold();
    }
    document.addEventListener("pointerdown", onDocumentPointerDown, true);
    document.addEventListener("pointerup", onDocumentPointerEnd, true);
    document.addEventListener("pointercancel", onDocumentPointerEnd, true);
    return () => {
      document.removeEventListener("pointerdown", onDocumentPointerDown, true);
      document.removeEventListener("pointerup", onDocumentPointerEnd, true);
      document.removeEventListener("pointercancel", onDocumentPointerEnd, true);
    };
  }, []);

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
    fallbackRef.current = false;
    if (!menu) return;
    const index = picked;
    closeMenu();
    // 过渡还在跑就限流：这次选择不生效，也就不叠第二层波纹
    if (index === null || transitioningRef.current) return;
    ripple(() => setTheme(THEMES[index].id));
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
        // 过渡期间限流：这一次点击不换主题，避免叠第二层波纹
        if (transitioningRef.current) return;
        ripple(cycleTheme);
      }}
      onContextMenu={(event) => event.preventDefault()}
      onPointerCancel={() => { cancelHold(); closeMenu(); }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      ref={buttonRef}
      type="button"
    >
      <PaletteIcon aria-hidden="true" size={24} />
    </button>
  </>;
}
