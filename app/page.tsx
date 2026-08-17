import Link from "next/link";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

function ArrowIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 20 20" fill="none">
      <path d="M4 10h11m-4-4 4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 20 20" fill="none">
      <path d="M10 2.5c.35 4.58 2.92 7.15 7.5 7.5-4.58.35-7.15 2.92-7.5 7.5-.35-4.58-2.92-7.15-7.5-7.5 4.58-.35 7.15-2.92 7.5-7.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function WorkflowPreview() {
  return (
    <div
      className="mindverse-preview relative mx-auto w-full max-w-[680px] overflow-hidden rounded-[28px] border border-black/[0.08] bg-white shadow-[0_32px_90px_rgba(22,27,38,0.14)] dark:border-white/[0.09] dark:bg-[#0d1722] dark:shadow-[0_32px_100px_rgba(0,0,0,0.38)]"
      role="img"
      aria-label="Mindverse 创作工作流画布预览：从创意描述生成分镜、图像和视频"
    >
      <div aria-hidden="true">
        <div className="flex h-14 items-center justify-between border-b border-black/[0.07] px-5 dark:border-white/[0.08]">
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#ff6b6b]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#ffd166]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#36d399]" />
            </div>
            <span className="text-[11px] font-semibold tracking-[0.12em] text-[#737b88] dark:text-slate-400">漂浮城市 · 创作流</span>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-[#d9f5ec] bg-[#effcf7] px-3 py-1 text-[10px] font-semibold text-[#087a5a] dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300">
            <span className="mindverse-status-dot h-1.5 w-1.5 rounded-full bg-[#10b981]" />
            运行就绪
          </div>
        </div>

        <div className="mindverse-canvas relative h-[430px] overflow-hidden sm:h-[500px]">
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 680 500" fill="none" preserveAspectRatio="none">
            <path className="mindverse-connector" d="M215 151C280 151 263 246 339 246" />
            <path className="mindverse-connector" d="M431 246C497 246 471 139 533 139" />
            <path className="mindverse-connector" d="M431 257C503 257 471 377 526 377" />
          </svg>

          <div className="mindverse-node mindverse-node--idea">
            <div className="mb-3 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#6d55df] dark:text-violet-300">
                <SparkIcon /> 创意输入
              </span>
              <span className="h-2 w-2 rounded-full bg-[#8b5cf6] shadow-[0_0_0_4px_rgba(139,92,246,0.12)]" />
            </div>
            <p className="text-[13px] font-semibold leading-5 text-[#17191d] dark:text-white">一座漂浮在云层之上的未来城市</p>
            <div className="mt-3 flex gap-1.5">
              <span className="rounded-md bg-[#f2efff] px-2 py-1 text-[9px] font-semibold text-[#6954c5] dark:bg-violet-400/10 dark:text-violet-300">电影感</span>
              <span className="rounded-md bg-[#f3f5f7] px-2 py-1 text-[9px] font-semibold text-[#6d7480] dark:bg-white/[0.06] dark:text-slate-400">16:9</span>
            </div>
          </div>

          <div className="mindverse-node mindverse-node--agent">
            <div className="mindverse-agent-orbit">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[#111318] text-white shadow-[0_14px_30px_rgba(17,19,24,0.25)] dark:bg-cyan-300 dark:text-slate-950">
                <SparkIcon />
              </div>
            </div>
            <p className="mt-3 text-center text-[10px] font-bold uppercase tracking-[0.14em] text-[#525967] dark:text-slate-300">AI 编排</p>
          </div>

          <div className="mindverse-node mindverse-node--image">
            <div className="mindverse-image-art relative h-24 overflow-hidden rounded-xl">
              <div className="absolute left-7 top-3 h-8 w-12 rounded-full bg-white/70 blur-sm" />
              <div className="absolute bottom-0 left-0 h-12 w-full bg-gradient-to-t from-[#3338aa] to-transparent" />
              <div className="absolute bottom-3 left-1/2 h-10 w-14 -translate-x-1/2 skew-x-[-9deg] rounded-t-lg border border-white/40 bg-[#271e65]/75" />
              <span className="absolute right-2 top-2 rounded-full bg-black/35 px-2 py-0.5 text-[8px] font-bold text-white backdrop-blur-sm">4 张</span>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-[#17191d] dark:text-white">关键帧生成</p>
                <p className="mt-0.5 text-[9px] text-[#7a8290] dark:text-slate-500">视觉探索 · 已完成</p>
              </div>
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#effcf7] text-[#087a5a] dark:bg-emerald-400/10 dark:text-emerald-300">
                <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none"><path d="m3 8 3 3 7-7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </span>
            </div>
          </div>

          <div className="mindverse-node mindverse-node--video">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e9fbff] text-[#06768e] dark:bg-cyan-400/10 dark:text-cyan-300">
                <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="9" height="10" rx="2" stroke="currentColor" strokeWidth="1.4" /><path d="m11 6 3-1.5v7L11 10" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex justify-between gap-3 text-[10px] font-bold text-[#313640] dark:text-slate-200"><span>动态镜头</span><span className="text-[#0891b2] dark:text-cyan-300">72%</span></div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#edf0f3] dark:bg-slate-800"><div className="mindverse-progress h-full w-[72%] rounded-full bg-[#0891b2] dark:bg-cyan-300" /></div>
              </div>
            </div>
          </div>

          <div className="absolute bottom-5 left-5 flex items-center gap-1 rounded-xl border border-black/[0.07] bg-white/90 p-1.5 shadow-sm backdrop-blur dark:border-white/[0.08] dark:bg-[#111d29]/90">
            {['−', '76%', '+'].map((item) => <span key={item} className="grid h-7 min-w-7 place-items-center rounded-md px-1 text-[10px] font-semibold text-[#6a7280] dark:text-slate-400">{item}</span>)}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="mindverse-home relative min-h-[100svh] overflow-hidden bg-[#f7f8fa] text-[#111318] dark:bg-[#071018] dark:text-slate-100">
      <div className="mindverse-grid absolute inset-0" aria-hidden="true" />
      <div className="mindverse-orb mindverse-orb--violet" aria-hidden="true" />
      <div className="mindverse-orb mindverse-orb--cyan" aria-hidden="true" />

      <header className="relative z-20 mx-auto flex h-20 w-full max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:px-12">
        <Link href="/" className="group flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed] focus-visible:ring-offset-4 dark:focus-visible:ring-cyan-300 dark:focus-visible:ring-offset-[#071018]" aria-label="Mindverse 首页">
          <span className="grid h-9 w-9 grid-cols-2 gap-[3px] rounded-xl bg-[#111318] p-[9px] shadow-sm transition-transform duration-200 group-hover:rotate-3 dark:bg-slate-100">
            <span className="rounded-[2px] bg-white dark:bg-[#071018]" /><span className="rounded-[2px] bg-white/55 dark:bg-[#071018]/55" />
            <span className="rounded-[2px] bg-white/55 dark:bg-[#071018]/55" /><span className="rounded-[2px] bg-white dark:bg-[#071018]" />
          </span>
          <span>
            <span className="block text-[13px] font-extrabold tracking-[0.22em]">MINDVERSE</span>
            <span className="mt-0.5 hidden text-[9px] font-semibold uppercase tracking-[0.12em] text-[#818997] sm:block dark:text-slate-500">Creative AI canvas</span>
          </span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          <Link href="/skills" className="hidden h-11 items-center rounded-xl px-4 text-sm font-semibold text-[#555d6a] transition-colors duration-200 hover:bg-white hover:text-[#111318] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed] sm:inline-flex dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-white dark:focus-visible:ring-cyan-300">技能库</Link>
          <ThemeToggle />
        </div>
      </header>

      <section className="relative z-10 mx-auto grid w-full max-w-[1440px] items-center gap-14 px-5 pb-16 pt-10 sm:px-8 sm:pt-16 lg:min-h-[calc(100svh-80px)] lg:grid-cols-[0.9fr_1.1fr] lg:gap-16 lg:px-12 lg:pb-20 lg:pt-8 xl:gap-24">
        <div className="mx-auto max-w-[650px] text-center lg:mx-0 lg:text-left">
          <div className="mindverse-reveal mindverse-reveal--1 inline-flex items-center gap-2 rounded-full border border-[#e0dcfb] bg-white/75 px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.16em] text-[#6751ce] shadow-sm backdrop-blur dark:border-violet-400/20 dark:bg-violet-400/[0.08] dark:text-violet-300">
            <span className="h-1.5 w-1.5 rounded-full bg-[#7c3aed] dark:bg-violet-300" />
            AI Creative Workflow Canvas
          </div>

          <h1 className="mindverse-reveal mindverse-reveal--2 mt-7 text-[clamp(3rem,6.1vw,6.5rem)] font-black leading-[0.92] tracking-[-0.065em] text-[#0e1014] dark:text-white">
            把创意变成
            <span className="mt-2 block bg-gradient-to-r from-[#6d46e8] via-[#6757df] to-[#0891b2] bg-clip-text text-transparent dark:from-violet-300 dark:via-indigo-300 dark:to-cyan-300">可运行的画布</span>
          </h1>

          <p className="mindverse-reveal mindverse-reveal--3 mx-auto mt-7 max-w-[590px] text-base font-medium leading-7 text-[#626b79] dark:text-slate-400 sm:text-lg sm:leading-8 lg:mx-0">
            在一张无限画布上连接文本、图像、视频、音频与分镜。让 AI 理解你的创作意图，把每个灵感编排成完整工作流。
          </p>

          <div className="mindverse-reveal mindverse-reveal--4 mt-9 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <Link href="/login" className="group inline-flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-[#111318] px-6 text-sm font-bold text-white shadow-[0_14px_30px_rgba(17,19,24,0.2)] transition duration-200 hover:-translate-y-0.5 hover:bg-[#242833] hover:shadow-[0_18px_36px_rgba(17,19,24,0.24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed] focus-visible:ring-offset-4 sm:w-auto dark:bg-cyan-300 dark:text-[#071018] dark:shadow-[0_14px_35px_rgba(34,211,238,0.16)] dark:hover:bg-cyan-200 dark:focus-visible:ring-cyan-300 dark:focus-visible:ring-offset-[#071018]">
              进入工作区 <span className="transition-transform duration-200 group-hover:translate-x-1"><ArrowIcon /></span>
            </Link>
            <Link href="/skills" className="inline-flex h-14 w-full items-center justify-center rounded-2xl border border-[#dfe3e8] bg-white/75 px-6 text-sm font-bold text-[#363c47] backdrop-blur transition duration-200 hover:-translate-y-0.5 hover:border-[#c8ccd3] hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed] focus-visible:ring-offset-4 sm:w-auto dark:border-white/[0.1] dark:bg-white/[0.05] dark:text-slate-200 dark:hover:border-white/[0.18] dark:hover:bg-white/[0.08] dark:focus-visible:ring-cyan-300 dark:focus-visible:ring-offset-[#071018]">
              探索技能库
            </Link>
          </div>

          <div className="mindverse-reveal mindverse-reveal--5 mt-9 flex flex-wrap items-center justify-center gap-x-5 gap-y-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[#7b8390] lg:justify-start dark:text-slate-500">
            {['文本', '图像', '视频', '音频', '分镜'].map((item, index) => (
              <span key={item} className="flex items-center gap-2">
                {index > 0 && <span className="h-1 w-1 rounded-full bg-[#c5cad1] dark:bg-slate-700" />}
                {item}
              </span>
            ))}
          </div>
        </div>

        <div className="mindverse-reveal mindverse-reveal--preview relative">
          <div className="absolute -inset-5 rounded-[40px] bg-gradient-to-br from-violet-300/20 via-transparent to-cyan-300/20 blur-2xl dark:from-violet-500/10 dark:to-cyan-400/10" aria-hidden="true" />
          <WorkflowPreview />
        </div>
      </section>
    </main>
  );
}
