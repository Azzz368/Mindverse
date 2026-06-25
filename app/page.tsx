import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function Home() {
  return (
    <main className="min-h-screen bg-white px-6 py-16 dark:bg-[#091019]">
      <div className="absolute right-6 top-6">
        <ThemeToggle />
      </div>
      <section className="mx-auto max-w-4xl pt-20 text-center">
        <p className="mb-5 text-sm font-semibold uppercase tracking-[.22em] text-[#676f7b] dark:text-cyan-300">
          Mindverse
        </p>
        <h1 className="text-5xl font-semibold tracking-tight text-[#030303] dark:text-slate-100 sm:text-7xl">
          把创意变成
          <br />
          <span className="text-[#000000] dark:text-cyan-300">可运行的画布</span>
        </h1>
        <p className="mx-auto mt-7 max-w-2xl text-lg leading-8 text-[#676f7b] dark:text-slate-400">
          一个原创的 AI 创作工作流空间，用于组织文本、图像、视频、音频与分镜构思。
        </p>
        <Link
          className="mt-10 inline-flex rounded-full bg-[#000000] px-6 py-3 font-semibold text-white transition hover:bg-[#1a1a1a] dark:rounded-xl dark:bg-cyan-300 dark:text-slate-950 dark:hover:bg-cyan-200"
          href="/workspace"
        >
          进入工作区 →
        </Link>
      </section>
    </main>
  );
}
