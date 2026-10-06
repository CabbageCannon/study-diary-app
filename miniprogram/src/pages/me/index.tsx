import { Button, Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import { api } from "../../services/api";
import { clearMiniSession } from "../../services/auth";

type Me = { email: string; role: string; preferences: { nickname?: string; targetRole?: string } };

export default function MePage() {
  const [me, setMe] = useState<Me | null>(null); const [error, setError] = useState("");
  useDidShow(() => { void api<Me>("/api/me").then(setMe).catch((reason) => setError(reason instanceof Error ? reason.message : "读取账户失败。")); });
  const name = me?.preferences?.nickname || (me?.email?.endsWith("@local.invalid") ? "微信用户" : me?.email?.split("@")[0]) || "学习者";
  return <View className="screen"><Text className="eyebrow">MY SPACE</Text><Text className="page-title">{name}</Text><Text className="page-subtitle">{me?.preferences?.targetRole || "持续积累，也好好生活。"}</Text><View className="card"><Text className="card-title">账户</Text><Text className="muted">{me?.email?.endsWith("@local.invalid") ? "已使用微信登录" : me?.email || "正在读取账户信息…"}</Text><Text className="muted">身份：{me?.role === "admin" ? "管理员" : "学习者"}</Text></View><Button className="button button-secondary" onClick={() => { clearMiniSession(); Taro.reLaunch({ url: "/pages/auth/index" }); }}>退出登录</Button>{error ? <Text className="error">{error}</Text> : null}</View>;
}
