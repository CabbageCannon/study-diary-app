import { Button, Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import { api } from "../../services/api";
import { clearMiniSession } from "../../services/auth";
import "./index.scss";

type Me = { email: string; role: string; preferences: { nickname?: string; targetRole?: string } };

export default function MePage() {
  const [me, setMe] = useState<Me | null>(null); const [error, setError] = useState("");
  useDidShow(() => { void api<Me>("/api/me").then(setMe).catch((reason) => setError(reason instanceof Error ? reason.message : "读取账户失败。")); });
  const name = me?.preferences?.nickname || (me?.email?.endsWith("@local.invalid") ? "微信用户" : me?.email?.split("@")[0]) || "学习者";
  const isWechatOnly = me?.email?.endsWith("@local.invalid");
  return <View className="screen"><View className="profile-top"><View className="profile-avatar"><Text>{name.slice(0, 1)}</Text></View><Text className="profile-name">{name}</Text><Text className="profile-role">{me?.preferences?.targetRole || "持续积累，也好好生活。"}</Text></View><Text className="section-label">账户与同步</Text><View className="card account-card"><View className="account-row"><Text className="account-key">登录方式</Text><Text className="account-value">{isWechatOnly ? "微信" : "微信 · 邮箱"}</Text></View><View className="account-row"><Text className="account-key">账户</Text><Text className="account-value">{isWechatOnly ? "已使用微信登录" : me?.email || "正在读取…"}</Text></View><View className="account-row"><Text className="account-key">身份</Text><Text className="account-value">{me?.role === "admin" ? "管理员" : "学习者"}</Text></View></View><View className="profile-note"><Text>你的学习、练习与日记，会安静地同步在这里。</Text></View><Button className="button button-quiet" onClick={() => { clearMiniSession(); Taro.reLaunch({ url: "/pages/auth/index" }); }}>退出登录</Button>{error ? <Text className="error">{error}</Text> : null}</View>;
}
