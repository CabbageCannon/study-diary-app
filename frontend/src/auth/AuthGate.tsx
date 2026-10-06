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
  useEffect(() => { if (!auth.session) setPassword(""); }, [auth.session]);
  useEffect(() => {
    if (!auth.emailVerified) return;
    setMode("login"); setPassword(""); setError(""); setMessage("邮箱验证成功，请重新登录。");
  }, [auth.emailVerified]);

  if (auth.loading) return <div className="auth-screen"><div className="auth-card" role="status"><h1>学习日记</h1><p>正在恢复登录状态…</p></div></div>;
  if (auth.session && auth.me && mode !== "password") return children;

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      if (mode === "login") await auth.signIn(email.trim(), password);
      else if (mode === "register") {
        const confirmationRequired = await auth.signUp(email.trim(), password);
        setPassword("");
        if (confirmationRequired) { setMode("login"); setMessage("注册成功，请前往邮箱完成验证后再登录。"); }
        else setMessage("注册成功，正在登录。");
      }
      else if (mode === "forgot") { await auth.resetPassword(email.trim()); setMessage("重置邮件已发送，请检查邮箱。"); }
      else { await auth.updatePassword(password); setPassword(""); setMode("login"); setMessage("密码已更新，请重新登录。"); await auth.signOut(); }
    } catch (reason) { setPassword(""); setError(reason instanceof Error ? reason.message : "操作失败，请稍后重试。"); }
    finally { setBusy(false); }
  }

  function changeMode(nextMode: Mode) {
    setMode(nextMode); setPassword(""); setError(""); setMessage("");
  }

  const title = mode === "login" ? "登录" : mode === "register" ? "创建账户" : mode === "forgot" ? "找回密码" : "设置新密码";
  return <main className="auth-screen"><section className="auth-card" aria-labelledby="auth-title">
    <header><small>LEARNING JOURNAL</small><h1 id="auth-title">{title}</h1><p>{mode === "forgot" ? "我们会向你的登录邮箱发送重置链接。" : mode === "register" ? "注册后请先验证邮箱。" : "登录后继续今天的学习。"}</p></header>
    <form onInvalidCapture={() => setPassword("")} onSubmit={submit}>
      {mode !== "password" ? <label><span>邮箱</span><input autoComplete="email" required type="email" value={email} onChange={(event) => setEmail(event.currentTarget.value)} /></label> : null}
      {mode !== "forgot" ? <label><span>{mode === "password" ? "新密码" : "密码"}</span><input autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} required type="password" value={password} onChange={(event) => setPassword(event.currentTarget.value)} /></label> : null}
      {error ? <p className="field-error" role="alert">{error}</p> : null}{message ? <p className="settings-success" role="status">{message}</p> : null}
      <button className="button button-primary" disabled={busy || (mode === "password" && !auth.session)} type="submit">{busy ? "请稍候…" : mode === "password" && !auth.session ? "正在确认链接…" : title}</button>
    </form>
    {mode !== "password" ? <nav aria-label="账户操作">
      {mode !== "login" ? <button onClick={() => changeMode("login")} type="button">返回登录</button> : null}
      {mode === "login" ? <><button onClick={() => changeMode("register")} type="button">注册账户</button><button onClick={() => changeMode("forgot")} type="button">忘记密码</button></> : null}
    </nav> : null}
  </section></main>;
}
