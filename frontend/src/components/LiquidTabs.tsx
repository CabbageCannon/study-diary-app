import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";

export interface LiquidTabItem {
  key: string;
  to: string;
  label: string;
  active: boolean;
  icon?: ReactNode;
  className?: string;
  onClick?: () => void;
  onFocus?: () => void;
  onPointerEnter?: () => void;
  onTouchStart?: () => void;
}

interface LiquidTabsProps {
  ariaLabel: string;
  className: string;
  itemClassName: string;
  activeItemClassName: string;
  items: LiquidTabItem[];
}

export function LiquidTabs({ ariaLabel, className, itemClassName, activeItemClassName, items }: LiquidTabsProps) {
  const navRef = useRef<HTMLElement | null>(null);
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([]);
  const activeIndex = items.findIndex((item) => item.active);
  const [indicator, setIndicator] = useState({ x: 0, width: 0, ready: false, moving: false });

  useLayoutEffect(() => {
    const nav = navRef.current;
    const active = itemRefs.current[activeIndex];
    if (!nav || !active) {
      setIndicator((current) => ({ ...current, ready: false, moving: false }));
      return;
    }

    const measure = () => {
      const navRect = nav.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      const x = activeRect.left - navRect.left + nav.scrollLeft;
      setIndicator((current) => ({
        x,
        width: activeRect.width,
        ready: true,
        moving: current.moving || current.ready && (Math.abs(current.x - x) > 1 || Math.abs(current.width - activeRect.width) > 1),
      }));
    };

    measure();
    const frame = window.requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
    };
  }, [activeIndex, items.length]);

  useLayoutEffect(() => {
    if (!indicator.moving) return;
    const timer = window.setTimeout(() => setIndicator((current) => ({ ...current, moving: false })), 420);
    return () => window.clearTimeout(timer);
  }, [indicator.moving]);

  const style = {
    "--liquid-x": `${indicator.x}px`,
    "--liquid-width": `${indicator.width}px`,
  } as CSSProperties;

  return (
    <nav className={`${className} liquid-tabs`} aria-label={ariaLabel} ref={navRef} style={style}>
      <span aria-hidden="true" className="liquid-tabs-indicator" data-moving={indicator.moving || undefined} data-ready={indicator.ready || undefined} />
      {items.map((item, index) => (
        <Link
          aria-current={item.active ? "page" : undefined}
          className={`${itemClassName}${item.active ? ` ${activeItemClassName}` : ""}${item.className ? ` ${item.className}` : ""}`}
          key={item.key}
          onClick={item.onClick}
          onFocus={item.onFocus}
          onPointerEnter={item.onPointerEnter}
          onTouchStart={item.onTouchStart}
          ref={(element) => { itemRefs.current[index] = element; }}
          to={item.to}
        >
          {item.icon}
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}
