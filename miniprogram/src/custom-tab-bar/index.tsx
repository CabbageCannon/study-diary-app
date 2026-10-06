import { Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import "./index.scss";

const tabs = [
  ["今日", "today", "/pages/today/index"],
  ["八股", "interview", "/pages/interview/index"],
  ["日记", "diary", "/pages/diary/index"],
  ["算法", "algorithm", "/pages/algorithm/index"],
  ["我的", "me", "/pages/me/index"],
] as const;

export default function CustomTabBar() {
  const [path, setPath] = useState("");
  useDidShow(() => setPath(Taro.getCurrentInstance().router?.path || ""));
  return <View className="custom-tabbar">
    {tabs.map(([label, icon, url]) => <View className={`tab-item ${path === url.slice(1) ? "is-active" : ""} ${label === "日记" ? "is-diary" : ""}`} key={label} onClick={() => Taro.switchTab({ url })}>
      <View className={`tab-mark icon-${icon}`}>{label === "日记" ? <Text>＋</Text> : null}</View><Text className="tab-label">{label}</Text>
    </View>)}
  </View>;
}
