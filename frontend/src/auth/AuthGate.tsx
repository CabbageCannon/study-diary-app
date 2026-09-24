import { useEffect, useState, type FormEvent, type PropsWithChildren } from "react";
import { useAuth } from "./AuthContext";

type Mode = "login" | "register" | "forgot" | "password";

export function AuthGate({ children }: PropsWithChildren) {
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { if (auth.recoveringPassword) setMode("password"); }, [auth.recoveringPassword]);

  if (auth.loading) return <div className="auth-screen"><div className="auth-card" role="status"><h1>学习日记</h1><p>正在恢复登录状态…</p></div></div>;
  if (auth.session && auth.me && mode !== "password") return children;

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      if (mode === "login") await auth.signIn(email.trim(), password);
      else if (mode === "register") setMessage(await auth.signUp(email.trim(), password) ? "注册成功，请前往邮箱完成验证后登录。" : "注册成功，正在登录。" );
      else if (mode === "forgot") { await auth.resetPassword(email.trim()); setMessage("重置邮件已发送，请检查邮箱。"); }
      else { await auth.updatePassword(password); setMode("login"); setMessage("密码已更新，请重新登录。"); await auth.signOut(); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "操作失败，请稍后重试。"); }
    finally { setBusy(false); }
  }

  const title = mode === "login" ? "登录" : mode === "register" ? "创建账户" : mode === "forgot" ? "找回密码" : "设置新密码";
  return <main className="auth-screen"><section className="auth-card" aria-labelledby="auth-title">
    <header><small>LEARNING JOURNAL</small><h1 id="auth-title">{title}</h1><p>{mode === "forgot" ? "我们会向你的登录邮箱发送重置链接。" : mode === "register" ? "注册后请先验证邮箱。" : "登录后继续今天的学习。"}</p></header>
    <form onSubmit={submit}>
      {mode !== "password" ? <label><span>邮箱</span><input autoComplete="email" required type="email" value={email} onChange={(event) => setEmail(event.currentTarget.value)} /></label> : null}
      {mode !== "forgot" ? <label><span>{mode === "password" ? "新密码" : "密码"}</span><input autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} required type="password" value={password} onChange={(event) => setPassword(event.currentTarget.value)} /></label> : null}
      {error ? <p className="field-error" role="alert">{error}</p> : null}{message ? <p className="settings-success" role="status">{message}</p> : null}
      <button className="button button-primary" disabled={busy} type="submit">{busy ? "请稍候…" : title}</button>
    </form>
    {mode !== "password" ? <nav aria-label="账户操作">
      {mode !== "login" ? <button onClick={() => { setMode("login"); setError(""); setMessage(""); }} type="button">返回登录</button> : null}
      {mode === "login" ? <><button onClick={() => setMode("register")} type="button">注册账户</button><button onClick={() => setMode("forgot")} type="button">忘记密码</button></> : null}
    </nav> : null}
  </section></main>;
}
