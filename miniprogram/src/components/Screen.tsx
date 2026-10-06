import { View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import type { PropsWithChildren } from "react";

export function currentRoute() {
  const pages = Taro.getCurrentPages();
  return "/" + (pages[pages.length - 1]?.route || "").replace(/^\//, "");
}

export function Screen({ children, className = "", topInset = 16 }: PropsWithChildren<{ className?: string; topInset?: number }>) {
  const info = Taro.getWindowInfo();
  const menu = Taro.getMenuButtonBoundingClientRect();
  const top = menu.bottom > 0 ? menu.bottom + topInset : (info.statusBarHeight || 0) + 44 + topInset;
  useDidShow(() => Taro.eventCenter.trigger("mini:tab-route", currentRoute()));
  return <View className={`screen ${className}`} style={{ paddingTop: `${top}px`, minHeight: `${info.windowHeight}px` }}>{children}</View>;
}
