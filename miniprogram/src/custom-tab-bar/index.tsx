import { Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import "./index.scss";

const tabs = [
  ["今日", "◌", "/pages/today/index"],
  ["八股", "◇", "/pages/interview/index"],
  ["日记", "＋", "/pages/diary/index"],
  ["算法", "⌁", "/pages/algorithm/index"],
  ["我的", "◍", "/pages/me/index"],
] as const;

export default function CustomTabBar() {
  const [path, setPath] = useState("");
  useDidShow(() => setPath(Taro.getCurrentInstance().router?.path || ""));
  return <View className="custom-tabbar">
    {tabs.map(([label, mark, url]) => <View className={`tab-item ${path === url.slice(1) ? "is-active" : ""} ${label === "日记" ? "is-diary" : ""}`} key={label} onClick={() => Taro.switchTab({ url })}>
      <Text className="tab-mark">{mark}</Text><Text>{label}</Text>
    </View>)}
  </View>;
}
