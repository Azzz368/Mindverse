"use client";

import Link from "next/link";
import { type CSSProperties, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Mode = "login" | "register";

function GoogleIcon() {
  return <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.52 12.273c0-.851-.076-1.669-.218-2.455H12v4.642h6.458c-.278 1.5-1.124 2.771-2.395 3.622v3.011h3.878c2.269-2.089 3.579-5.166 3.579-8.82Z"/><path fill="#34A853" d="M12 24c3.24 0 5.956-1.075 7.942-2.907l-3.878-3.011c-1.075.72-2.45 1.145-4.064 1.145-3.125 0-5.771-2.11-6.715-4.947H1.276v3.109C3.251 21.31 7.309 24 12 24Z"/><path fill="#FBBC05" d="M5.285 14.28a7.09 7.09 0 0 1 0-4.56V6.611H1.276A12.07 12.07 0 0 0 0 12c0 1.936.464 3.769 1.276 5.389l4.009-3.109Z"/><path fill="#EA4335" d="M12 4.773c1.762 0 3.344.605 4.587 1.794l3.442-3.442C17.951 1.189 15.235 0 12 0 7.309 0 3.251 2.689 1.276 6.611l4.009 3.109C6.229 6.884 8.875 4.773 12 4.773Z"/></svg>;
}

function GithubIcon() {
  return <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path fill="white" d="M12 0.6a11.7 11.7 0 0 0-3.776 22.508c.592.11.815-.257.815-.569l-.016-1.784c-3.317.717-4.018-1.4-4.018-1.4-.541-1.374-1.323-1.736-1.323-1.736-1.082-.734.081-.72.081-.72 1.199.084 1.829 1.223 1.829 1.223 1.063 1.812 2.791 1.288 3.47.982.107-.769.417-1.29.759-1.587-2.65-.298-5.434-1.316-5.434-5.859a4.57 4.57 0 0 1 1.228-3.183c-.122-.298-.531-1.504.117-3.141 0 0 1.001-.318 3.28 1.215a11.3 11.3 0 0 1 5.971 0c2.277-1.533 3.276-1.215 3.276-1.215.65 1.634.241 2.84.119 3.141a4.57 4.57 0 0 1 1.23 3.187c0 4.553-2.79 5.556-5.444 5.849.427.369.807 1.09.807 2.197l-.014 3.254c0 .316.216.685.82.569A11.7 11.7 0 0 0 12 .6Z"/></svg>;
}

function AppleIcon() {
  return <svg width="21" height="24" viewBox="0 0 21 24" aria-hidden="true"><path fill="white" d="M19.972 18.703a17.6 17.6 0 0 1-1.302 2.32c-.685.968-1.245 1.637-1.677 2.009-.67.61-1.387.923-2.156.941-.551 0-1.217-.156-1.991-.471-.777-.314-1.49-.47-2.144-.47-.685 0-1.419.156-2.204.47-.787.316-1.42.48-1.905.496-.737.031-1.471-.29-2.204-.966-.468-.404-1.053-1.098-1.754-2.08a14.4 14.4 0 0 1-1.856-3.652C.26 15.802 0 14.352 0 12.948c0-1.608.351-2.996 1.053-4.158.552-.934 1.286-1.67 2.206-2.211a5.93 5.93 0 0 1 2.982-.834c.585 0 1.353.179 2.307.532.951.354 1.562.533 1.83.533.2 0 .878-.21 2.028-.628 1.087-.388 2.005-.548 2.757-.485 2.038.163 3.568.959 4.586 2.393-1.822 1.094-2.724 2.627-2.706 4.593.016 1.531.577 2.805 1.679 3.817.499.47 1.057.833 1.677 1.091-.135.387-.277.757-.428 1.112ZM15.299.48c0 1.2-.442 2.321-1.325 3.358-1.064 1.234-2.351 1.946-3.748 1.834a4.3 4.3 0 0 1-.028-.455c0-1.152.506-2.385 1.405-3.394.449-.51 1.02-.935 1.712-1.274.69-.334 1.344-.518 1.958-.55.018.161.026.321.026.481Z"/></svg>;
}

function InstagramIcon() {
  return <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="auth-instagram" x1="20.3" y1="1.8" x2="2.9" y2="23.1" gradientUnits="userSpaceOnUse"><stop stopColor="#AE3DAE"/><stop offset=".22" stopColor="#CE2E69"/><stop offset=".42" stopColor="#FF1800"/><stop offset=".72" stopColor="#F7772E"/><stop offset="1" stopColor="#FEF780"/></linearGradient></defs><path fill="url(#auth-instagram)" d="M23.93 7.05c-.06-1.28-.26-2.15-.56-2.92a6.1 6.1 0 0 0-1.38-2.12A6.1 6.1 0 0 0 19.87.63c-.76-.3-1.64-.5-2.91-.56C15.68.01 15.27 0 12.01 0 8.75 0 8.34.01 7.07.07 5.79.13 4.92.33 4.15.63a6.1 6.1 0 0 0-2.12 1.38A6.1 6.1 0 0 0 .64 4.14C.35 4.9.14 5.77.09 7.05.03 8.33.01 8.74.01 12c0 3.26.02 3.67.08 4.95.06 1.28.26 2.15.56 2.92a6.1 6.1 0 0 0 1.38 2.12 6.1 6.1 0 0 0 2.12 1.38c.76.3 1.64.5 2.91.56C8.34 24 8.75 24 12.01 24s3.67-.01 4.94-.07c1.28-.06 2.15-.26 2.92-.56a6.1 6.1 0 0 0 2.12-1.38 6.1 6.1 0 0 0 1.38-2.12c.3-.76.5-1.64.56-2.91.06-1.28.08-1.69.08-4.95s-.02-3.67-.08-4.95ZM12 21.85c-3.2 0-3.59-.01-4.85-.07-1.17-.05-1.81-.25-2.23-.41a3.7 3.7 0 0 1-1.38-.91 3.7 3.7 0 0 1-.91-1.38c-.16-.42-.36-1.06-.41-2.23-.06-1.26-.07-1.65-.07-4.85s.01-3.59.07-4.85c.05-1.17.25-1.81.41-2.23.22-.56.49-.96.91-1.38s.82-.69 1.38-.91c.42-.16 1.06-.36 2.23-.41C8.41 2.16 8.8 2.15 12 2.15s3.59.01 4.85.07c1.17.05 1.81.25 2.23.41.56.22.96.49 1.38.91s.69.82.91 1.38c.16.42.36 1.06.41 2.23.06 1.26.07 1.65.07 4.85s-.01 3.59-.07 4.85c-.05 1.17-.25 1.81-.41 2.23-.22.56-.49.96-.91 1.38s-.82.69-1.38.91c-.42.16-1.06.36-2.23.41-1.26.06-1.65.07-4.85.07Z"/><path fill="url(#auth-instagram)" d="M12 5.83A6.17 6.17 0 1 0 12 18.17 6.17 6.17 0 0 0 12 5.83Zm0 10.34A4.17 4.17 0 1 1 12 7.83a4.17 4.17 0 0 1 0 8.34Zm6.4-10.58a1.44 1.44 0 1 1-2.88 0 1.44 1.44 0 0 1 2.88 0Z"/></svg>;
}

const artOrbs = [
  "auth-orb--orange",
  "auth-orb--peach-top",
  "auth-orb--gold",
  "auth-orb--coral-top",
  "auth-orb--cream-top",
  "auth-orb--rust",
  "auth-orb--orange-bottom",
  "auth-orb--peach-bottom",
  "auth-orb--gold-left",
  "auth-orb--coral-bottom",
  "auth-orb--cream-bottom",
  "auth-orb--rust-left",
];

const animatedArtOrbs = new Set([
  "auth-orb--orange",
  "auth-orb--peach-top",
  "auth-orb--gold",
  "auth-orb--coral-top",
  "auth-orb--cream-top",
]);

export function AuthPage({ mode: initialMode }: { mode: Mode }) {
  const router = useRouter();
  const [mode, setMode] = useState(initialMode);
  const [switching, setSwitching] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [orbAnimation, setOrbAnimation] = useState<Record<string, CSSProperties>>({});
  const registering = mode === "register";

  useEffect(() => setMode(initialMode), [initialMode]);
  useEffect(() => {
    setOrbAnimation(Object.fromEntries(
      [...animatedArtOrbs].map((orb) => {
        const duration = 9 + Math.random() * 10;
        return [orb, {
          "--auth-orb-duration": `${duration.toFixed(2)}s`,
          "--auth-orb-delay": `-${(Math.random() * duration).toFixed(2)}s`,
        } as CSSProperties];
      }),
    ));
  }, []);

  const switchMode = (nextMode: Mode) => {
    if (nextMode === mode) return;
    setMessage(""); setSwitching(true);
    window.setTimeout(() => {
      setMode(nextMode);
      setSwitching(false);
      window.history.replaceState(null, "", nextMode === "register" ? "/register" : "/login");
    }, 400);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/auth/${mode}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(registering ? { name, email, password, inviteCode } : { email, password }) });
      const payload = await response.json().catch(() => ({})) as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message || (registering ? "Unable to create your account." : "Unable to sign in."));
      const requested = new URLSearchParams(window.location.search).get("next");
      router.replace(requested?.startsWith("/") && !requested.startsWith("//") ? requested : "/workspace"); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Something went wrong."); } finally { setBusy(false); }
  };

  return <main className={`auth-shell auth-shell--${mode}${switching ? " auth-shell--switching" : ""}`}>
    <section className="auth-art noise">
      <div className="auth-art__base" />
      {artOrbs.map((orb) => <span key={orb} className={`auth-orb ${orb}${animatedArtOrbs.has(orb) ? " auth-orb--animated" : ""}`} style={orbAnimation[orb]} />)}
      <Link href="/" className="auth-back" aria-label="Back to home">
        <svg width="15" height="30" viewBox="0 0 15 30" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M9.5885 0.5L0.588501 15L9.5885 29.5" stroke="#909090" strokeLinecap="round" />
          <path d="M13.5885 0.5L4.5885 15L13.5885 29.5" stroke="#909090" strokeLinecap="round" />
        </svg>
      </Link>
    </section>
    <section className="auth-panel">
      <div className="auth-heading">
        <p className="auth-kicker"><span>Welcome to</span><em>MINDVERSE</em></p>
        <p className="auth-subtitle">Generate. Direct. Edit-in One Click</p>
      </div>
      <div className="auth-socials">
        <button type="button" aria-label="Continue with Google" className="auth-social"><GoogleIcon /></button>
        <button type="button" aria-label="Continue with GitHub" className="auth-social"><GithubIcon /></button>
        <button type="button" aria-label="Continue with Apple" className="auth-social"><AppleIcon /></button>
        <button type="button" aria-label="Continue with Instagram" className="auth-social"><InstagramIcon /></button>
      </div>
      <div key={mode} className="auth-form-wrap">
        <form onSubmit={submit} className="auth-form">
          {registering && <div className="auth-field-row"><label className="auth-field"><span>User name</span><input className="auth-input" value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" placeholder="Your user name" required minLength={2} maxLength={80} /></label><label className="auth-field"><span>Invite code</span><input className="auth-input" value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} autoComplete="off" placeholder="Your invite code" /></label></div>}
          <label className="auth-field"><span>Email</span><input className="auth-input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="Your email address" required /></label>
          {registering && <label className="auth-field"><span>Password</span><input className="auth-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" placeholder="At least 10 characters" required minLength={10} maxLength={128} /></label>}
          {!registering && <label className="auth-field"><span>Password</span><input className="auth-input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="Your password" required minLength={10} maxLength={128} /></label>}
          {message && <div role="alert" className="auth-error">{message}</div>}
          <button disabled={busy} className="auth-submit">{busy ? "Please wait..." : registering ? "Continue" : "SIGN IN"}</button>
        </form>
        <p className="auth-switch">{registering ? "Already have an account?" : "Don’t have an account?"}<button type="button" onClick={() => switchMode(registering ? "login" : "register")}>{registering ? "Sign in" : "Sign up"}</button></p>
      </div>
    </section>
  </main>;
}
