import { Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useEffect, useState } from "react";
import { currentRoute } from "../components/Screen";
import { Icon, type IconName } from "../components/Icon";
import "./index.scss";

const tabs: { label: string; icon: IconName; activeIcon: IconName; url: string }[] = [
  { label: "今日", icon: "house", activeIcon: "houseFill", url: "/pages/today/index" },
  { label: "八股", icon: "file", activeIcon: "fileFill", url: "/pages/interview/index" },
  { label: "日记", icon: "plus", activeIcon: "plus", url: "/pages/diary/index" },
  { label: "算法", icon: "code", activeIcon: "codeActive", url: "/pages/algorithm/index" },
  { label: "我的", icon: "user", activeIcon: "userFill", url: "/pages/me/index" },
];
export default function CustomTabBar() {
  const [path, setPath] = useState(currentRoute);
  useDidShow(() => setPath(currentRoute()));
  useEffect(() => {
    const update = (route: string) => setPath(route);
    Taro.eventCenter.on("mini:tab-route", update);
    setPath(currentRoute());
    return () => { Taro.eventCenter.off("mini:tab-route", update); };
  }, []);
  function select(url: string) {
    setPath(url);
    if (url === currentRoute()) { void Taro.pageScrollTo({ scrollTop: 0, duration: 180 }); return; }
    void Taro.switchTab({ url, fail: () => setPath(currentRoute()) });
  }
  return <View className="custom-tabbar">
    {tabs.map(tab => <View key={tab.url} className={`tab-item ${path === tab.url ? "is-active" : ""} ${tab.label === "日记" ? "is-diary" : ""}`} onClick={() => select(tab.url)}>
      <View className="tab-icon-wrap"><Icon name={path === tab.url ? tab.activeIcon : tab.icon} className="tab-icon" /></View>
      <Text className="tab-label">{tab.label}</Text>
    </View>)}
  </View>;
}
