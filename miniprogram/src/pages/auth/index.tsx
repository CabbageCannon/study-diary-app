import { Button, Image, Input, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import { bindExistingEmail, hasMiniToken, loginWithWechat } from "../../services/auth";
import { Screen } from "../../components/Screen";
import { Icon } from "../../components/Icon";
import emblem from "../../assets/journal-emblem.webp";
import "./index.scss";
export default function AuthPage() {
  const [binding, setBinding] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (hasMiniToken()) void Taro.switchTab({ url: "/pages/today/index" }); }, []);
  async function run(action: () => Promise<void>) {
    setBusy(true); setError("");
    try { await action(); setPassword(""); void Taro.switchTab({ url: "/pages/today/index" }); }
    catch (reason) { setPassword(""); setError(reason instanceof Error ? reason.message : "登录失败，请重试。"); }
    finally { setBusy(false); }
  }
  return <Screen className={`auth-screen ${binding ? "is-binding" : ""}`}>
    <View className="auth-hero"><Image className="auth-emblem" src={emblem} mode="aspectFit" /><Text className="auth-title">学习日记</Text><Text className="auth-copy">把每一次学习，留成自己的轨迹。</Text></View>
    {binding ? <View className="card binding-card"><Text className="binding-title">绑定已有学习账户</Text><Text className="muted">验证一次邮箱账户，之后直接用微信登录。</Text><Input className="auth-input" placeholder="邮箱" type="text" value={email} onInput={event => setEmail(event.detail.value)} /><Input className="auth-input" placeholder="密码" password value={password} onInput={event => setPassword(event.detail.value)} /><Button className="button button-primary" disabled={busy || !email.trim() || !password} loading={busy} onClick={() => void run(() => bindExistingEmail(email.trim(), password))}>确认绑定</Button><Button className="auth-text" disabled={busy} onClick={() => { setBinding(false); setError(""); setPassword(""); }}>返回微信登录</Button></View> : <View className="auth-actions"><Button className="button button-primary" disabled={busy} loading={busy} onClick={() => void run(() => loginWithWechat(false))}><Icon name="wechatLight" className="auth-wechat" /><Text>微信登录</Text></Button><Button className="button button-secondary" disabled={busy} onClick={() => { setBinding(true); setPassword(""); setError(""); }}>绑定已有学习账户</Button><Button className="auth-text auth-create" disabled={busy} onClick={() => void run(() => loginWithWechat(true))}>创建学习账户</Button></View>}
    {error ? <Text className="error">{error}</Text> : null}
    <Text className="auth-footer">练习与日记，与你的账户同步。</Text>
  </Screen>;
}
