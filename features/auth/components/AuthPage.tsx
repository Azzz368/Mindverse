"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Mode = "login" | "register";

export function AuthPage({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const registering = mode === "register";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(registering ? { name, email, password, inviteCode } : { email, password }),
      });
      const payload = await response.json().catch(() => ({})) as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message || (registering ? "注册失败。" : "登录失败。"));
      const requested = new URLSearchParams(window.location.search).get("next");
      const destination = requested?.startsWith("/") && !requested.startsWith("//") ? requested : "/workspace";
      router.replace(destination);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "请求失败。");
    } finally {
      setBusy(false);
    }
  };

  const inputClass = "h-12 w-full rounded-xl border border-white/10 bg-white/[0.055] px-4 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300/70 focus:bg-white/[0.08] focus:ring-4 focus:ring-cyan-300/10";

  return (
    <main className="relative min-h-[100svh] overflow-hidden bg-[#071018] text-white">
      <div className="absolute left-[-12rem] top-[-12rem] h-[30rem] w-[30rem] rounded-full bg-violet-500/15 blur-[110px]" />
      <div className="absolute bottom-[-14rem] right-[-12rem] h-[32rem] w-[32rem] rounded-full bg-cyan-300/10 blur-[120px]" />
      <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.04)_1px,transparent_1px)] [background-size:32px_32px]" />
      <div className="relative z-10 mx-auto grid min-h-[100svh] w-full max-w-[1240px] items-center gap-10 px-5 py-10 lg:grid-cols-[1.05fr_.75fr] lg:px-10">
        <section className="hidden max-w-xl lg:block">
          <Link href="/" className="inline-flex items-center gap-3 text-sm font-black tracking-[0.22em]">
            <span className="grid h-10 w-10 grid-cols-2 gap-1 rounded-xl bg-white p-2.5"><i className="rounded-sm bg-[#071018]" /><i className="rounded-sm bg-[#071018]/45" /><i className="rounded-sm bg-[#071018]/45" /><i className="rounded-sm bg-[#071018]" /></span>
            MINDVERSE
          </Link>
          <p className="mt-16 text-xs font-bold uppercase tracking-[0.22em] text-cyan-300">Private creative workspace</p>
          <h1 className="mt-5 text-6xl font-black leading-[0.95] tracking-[-0.055em]">你的灵感，<br /><span className="text-cyan-300">只属于你的画布。</span></h1>
          <p className="mt-7 max-w-lg text-base leading-8 text-slate-400">每个账户拥有独立项目、Skill 与素材空间。连接文字、图像、视频和声音，让创作持续生长。</p>
        </section>

        <section className="mx-auto w-full max-w-[460px] rounded-[28px] border border-white/10 bg-[#0d1722]/90 p-6 shadow-[0_30px_90px_rgba(0,0,0,.42)] backdrop-blur-xl sm:p-9">
          <Link href="/" className="mb-10 inline-flex items-center gap-2 text-xs font-black tracking-[0.2em] lg:hidden">MINDVERSE</Link>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-300">{registering ? "Create account" : "Welcome back"}</p>
          <h2 className="mt-3 text-3xl font-black tracking-[-0.035em]">{registering ? "创建你的创作空间" : "登录 Mindverse"}</h2>
          <p className="mt-3 text-sm leading-6 text-slate-400">{registering ? "注册后会自动建立一个完全私有的 Workspace。" : "继续进入你的项目、Skill 与素材空间。"}</p>

          <form className="mt-8 space-y-4" onSubmit={submit}>
            {registering && <label className="block"><span className="mb-2 block text-xs font-semibold text-slate-300">姓名</span><input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" placeholder="你的名字" required minLength={2} maxLength={80} /></label>}
            <label className="block"><span className="mb-2 block text-xs font-semibold text-slate-300">邮箱</span><input className={inputClass} type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="name@example.com" required /></label>
            <label className="block"><span className="mb-2 block text-xs font-semibold text-slate-300">密码</span><input className={inputClass} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={registering ? "new-password" : "current-password"} placeholder={registering ? "至少 10 个字符" : "输入密码"} required minLength={10} maxLength={128} /></label>
            {registering && <label className="block"><span className="mb-2 block text-xs font-semibold text-slate-300">邀请码</span><input className={inputClass} value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} autoComplete="off" placeholder="开放注册时可留空" /></label>}
            {message && <div role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">{message}</div>}
            <button disabled={busy} className="mt-2 h-12 w-full rounded-xl bg-cyan-300 text-sm font-black text-[#071018] transition hover:bg-cyan-200 focus:outline-none focus:ring-4 focus:ring-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-55">{busy ? (registering ? "正在创建…" : "正在登录…") : (registering ? "创建账户" : "登录")}</button>
          </form>
          <p className="mt-7 text-center text-sm text-slate-400">{registering ? "已经有账户？" : "还没有账户？"}<Link className="ml-2 font-bold text-white hover:text-cyan-300" href={registering ? "/login" : "/register"}>{registering ? "直接登录" : "使用邀请码注册"}</Link></p>
        </section>
      </div>
    </main>
  );
}
