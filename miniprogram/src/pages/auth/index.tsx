import { Button, Input, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import { bindExistingEmail, hasMiniToken, loginWithWechat } from "../../services/auth";
import "./index.scss";

export default function AuthPage() {
  const [binding, setBinding] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { if (hasMiniToken()) Taro.switchTab({ url: "/pages/today/index" }); }, []);
  async function run(action: () => Promise<void>) {
    setBusy(true); setError("");
    try { await action(); Taro.switchTab({ url: "/pages/today/index" }); }
    catch (reason) { setPassword(""); setError(reason instanceof Error ? reason.message : "登录失败，请重试。"); }
    finally { setBusy(false); }
  }
  return <View className="auth-screen">
    <View className="auth-hero"><Text className="auth-kicker">STUDY DIARY</Text><Text className="auth-title">把每一次学习，留成自己的轨迹。</Text><Text className="auth-copy">微信登录后，今日、八股、算法和日记会同步到你的账户。</Text></View>
    {binding ? <View className="binding-card"><Text className="binding-title">绑定已有学习账户</Text><Text className="binding-copy">只在本次绑定时验证邮箱密码，成功后小程序使用独立登录凭据。</Text><Input className="auth-input" placeholder="邮箱" type="text" value={email} onInput={(event) => setEmail(event.detail.value)} /><Input className="auth-input" placeholder="密码" password value={password} onInput={(event) => setPassword(event.detail.value)} /><Button className="auth-primary" disabled={busy || !email || !password} loading={busy} onClick={() => void run(() => bindExistingEmail(email, password))}>确认绑定</Button><Button className="auth-text" disabled={busy} onClick={() => { setBinding(false); setError(""); setPassword(""); }}>返回微信登录</Button></View> : <View className="auth-actions"><Button className="auth-primary" disabled={busy} loading={busy} onClick={() => void run(() => loginWithWechat(false))}>微信登录</Button><Button className="auth-secondary" disabled={busy} onClick={() => setBinding(true)}>绑定已有学习账户</Button><Button className="auth-text" disabled={busy} onClick={() => void run(() => loginWithWechat(true))}>我是新用户，创建学习账户</Button></View>}
    {error ? <Text className="auth-error">{error}</Text> : null}
  </View>;
}
