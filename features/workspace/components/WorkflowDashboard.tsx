"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createWorkflowRemote, deleteWorkflowRemote, renameWorkflowRemote } from "@/features/workspace/services/workflowClient";
import type { WorkflowSummary } from "@/shared/api/workflowContracts";
import { useLang } from "@/components/providers/LangProvider";
import type { Lang } from "@/shared/i18n/strings";
import { useTheme } from "@/components/providers/ThemeProvider";

type Props = { user: { name: string; email: string }; workspace: { name: string }; initialWorkflows: WorkflowSummary[]; localMode?: boolean };

type WorkspaceCopy = { project: string; yourProjects: string; allProjects: string; sharedWithYou: string; newCanvas: string; home: string; community: string; workflows: string; projects: string; recents: string; favourites: string; settings: string; account: string; personal: string; free: string; accountProfile: string; plansBilling: string; language: string; theme: string; logout: string; rename: string; delete: string; untitled: string; projectName: string; createError: string; renameError: string; deleteError: string; logoutError: string; deleteConfirm: (name: string) => string; languageName: Record<Lang, string> };

const workspaceCopy: Record<Lang, WorkspaceCopy> = {
  en: { project: "PROJECT", yourProjects: "Your projects", allProjects: "All projects", sharedWithYou: "Shared with you", newCanvas: "New Canvas", home: "Home", community: "Community", workflows: "Workflows", projects: "Projects", recents: "Recents", favourites: "Favourites", settings: "Settings", account: "Account", personal: "Personal", free: "Free", accountProfile: "Account profile", plansBilling: "Plans and Billing", language: "Language", theme: "Theme", logout: "Log out", rename: "Rename", delete: "Delete", untitled: "Untitled", projectName: "Project name", createError: "Could not create workflow.", renameError: "Could not rename workflow.", deleteError: "Could not delete workflow.", logoutError: "Logout failed. Please try again.", deleteConfirm: (name) => `Delete project "${name}"?`, languageName: { en: "English", "zh-Hans": "Simplified Chinese", "zh-Hant": "Traditional Chinese", ko: "Korean", th: "Thai", km: "Khmer" } },
  "zh-Hans": { project: "项目", yourProjects: "我的项目", allProjects: "全部项目", sharedWithYou: "与我共享", newCanvas: "新建画布", home: "首页", community: "社区", workflows: "工作流", projects: "项目", recents: "最近使用", favourites: "收藏", settings: "设置", account: "账户", personal: "个人", free: "免费", accountProfile: "账户资料", plansBilling: "套餐与账单", language: "语言", theme: "主题", logout: "退出登录", rename: "重命名", delete: "删除", untitled: "未命名", projectName: "项目名称", createError: "无法创建工作流。", renameError: "无法重命名工作流。", deleteError: "无法删除工作流。", logoutError: "退出登录失败，请重试。", deleteConfirm: (name) => `删除项目“${name}”？`, languageName: { en: "English", "zh-Hans": "简体中文", "zh-Hant": "繁體中文", ko: "한국어", th: "ไทย", km: "ខ្មែរ" } },
  "zh-Hant": { project: "專案", yourProjects: "我的專案", allProjects: "全部專案", sharedWithYou: "與我共享", newCanvas: "新增畫布", home: "首頁", community: "社群", workflows: "工作流程", projects: "專案", recents: "最近使用", favourites: "收藏", settings: "設定", account: "帳戶", personal: "個人", free: "免費", accountProfile: "帳戶資料", plansBilling: "方案與帳單", language: "語言", theme: "主題", logout: "登出", rename: "重新命名", delete: "刪除", untitled: "未命名", projectName: "專案名稱", createError: "無法建立工作流程。", renameError: "無法重新命名工作流程。", deleteError: "無法刪除工作流程。", logoutError: "登出失敗，請再試一次。", deleteConfirm: (name) => `刪除專案「${name}」？`, languageName: { en: "English", "zh-Hans": "簡體中文", "zh-Hant": "繁體中文", ko: "한국어", th: "ไทย", km: "ខ្មែរ" } },
  ko: { project: "프로젝트", yourProjects: "내 프로젝트", allProjects: "모든 프로젝트", sharedWithYou: "나와 공유됨", newCanvas: "새 캔버스", home: "홈", community: "커뮤니티", workflows: "워크플로", projects: "프로젝트", recents: "최근 항목", favourites: "즐겨찾기", settings: "설정", account: "계정", personal: "개인", free: "무료", accountProfile: "계정 프로필", plansBilling: "요금제 및 결제", language: "언어", theme: "테마", logout: "로그아웃", rename: "이름 변경", delete: "삭제", untitled: "제목 없음", projectName: "프로젝트 이름", createError: "워크플로를 만들 수 없습니다.", renameError: "워크플로 이름을 변경할 수 없습니다.", deleteError: "워크플로를 삭제할 수 없습니다.", logoutError: "로그아웃에 실패했습니다. 다시 시도하세요.", deleteConfirm: (name) => `프로젝트 "${name}"을(를) 삭제할까요?`, languageName: { en: "English", "zh-Hans": "简体中文", "zh-Hant": "繁體中文", ko: "한국어", th: "ไทย", km: "ខ្មែរ" } },
  th: { project: "โปรเจกต์", yourProjects: "โปรเจกต์ของคุณ", allProjects: "โปรเจกต์ทั้งหมด", sharedWithYou: "แชร์กับคุณ", newCanvas: "แคนวาสใหม่", home: "หน้าแรก", community: "ชุมชน", workflows: "เวิร์กโฟลว์", projects: "โปรเจกต์", recents: "ล่าสุด", favourites: "รายการโปรด", settings: "การตั้งค่า", account: "บัญชี", personal: "ส่วนตัว", free: "ฟรี", accountProfile: "โปรไฟล์บัญชี", plansBilling: "แผนและการเรียกเก็บเงิน", language: "ภาษา", theme: "ธีม", logout: "ออกจากระบบ", rename: "เปลี่ยนชื่อ", delete: "ลบ", untitled: "ไม่มีชื่อ", projectName: "ชื่อโปรเจกต์", createError: "ไม่สามารถสร้างเวิร์กโฟลว์ได้", renameError: "ไม่สามารถเปลี่ยนชื่อเวิร์กโฟลว์ได้", deleteError: "ไม่สามารถลบเวิร์กโฟลว์ได้", logoutError: "ออกจากระบบไม่สำเร็จ โปรดลองอีกครั้ง", deleteConfirm: (name) => `ลบโปรเจกต์ "${name}" หรือไม่?`, languageName: { en: "English", "zh-Hans": "简体中文", "zh-Hant": "繁體中文", ko: "한국어", th: "ไทย", km: "ខ្មែរ" } },
  km: { project: "គម្រោង", yourProjects: "គម្រោងរបស់អ្នក", allProjects: "គម្រោងទាំងអស់", sharedWithYou: "ចែករំលែកជាមួយអ្នក", newCanvas: "ផ្ទាំងក្រណាត់ថ្មី", home: "ទំព័រដើម", community: "សហគមន៍", workflows: "លំហូរការងារ", projects: "គម្រោង", recents: "ថ្មីៗ", favourites: "សំណព្វ", settings: "ការកំណត់", account: "គណនី", personal: "ផ្ទាល់ខ្លួន", free: "ឥតគិតថ្លៃ", accountProfile: "ប្រវត្តិរូបគណនី", plansBilling: "គម្រោង និងការទូទាត់", language: "ភាសា", theme: "រូបរាង", logout: "ចាកចេញ", rename: "ប្ដូរឈ្មោះ", delete: "លុប", untitled: "គ្មានចំណងជើង", projectName: "ឈ្មោះគម្រោង", createError: "មិនអាចបង្កើតលំហូរការងារបានទេ។", renameError: "មិនអាចប្ដូរឈ្មោះលំហូរការងារបានទេ។", deleteError: "មិនអាចលុបលំហូរការងារបានទេ។", logoutError: "ការចាកចេញបរាជ័យ។ សូមព្យាយាមម្តងទៀត។", deleteConfirm: (name) => `លុបគម្រោង "${name}"?`, languageName: { en: "English", "zh-Hans": "简体中文", "zh-Hant": "繁體中文", ko: "한국어", th: "ไทย", km: "ខ្មែរ" } },
};

const previewImages = [
  "/website/flowvideo/toplist/1.png",
  "/website/flowvideo/toplist/2.png",
  "/website/flowvideo/toplist/3.png",
  "/website/flowvideo/toplist/4.png",
  "/website/flowvideo/toplist/5.png",
  "/website/flowvideo/toplist/6.png",
  "/website/1.png",
];

type SideIconKind = "home" | "building" | "share" | "folder" | "rewind" | "sync" | "settings";
type ProfileMenuIconKind = "account" | "billing" | "language" | "theme" | "logout";

function formatWorkflowDate(value: string) {
  const locale = typeof document === "undefined" ? "en" : document.documentElement.lang;
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function formatEditedAgo(value: string) {
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  const locale = typeof document === "undefined" ? "en" : document.documentElement.lang;
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (elapsedSeconds < 60) return relative.format(0, "second");
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  if (elapsedMinutes < 60) return relative.format(-elapsedMinutes, "minute");
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return relative.format(-elapsedHours, "hour");
  const elapsedDays = Math.floor(elapsedHours / 24);
  return relative.format(-elapsedDays, "day");
}

function SideIcon({ kind }: { kind: SideIconKind }) {
  const common = { fill: "none", stroke: "currentColor", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<SideIconKind, React.ReactNode> = {
    home: <><path d="m1 8 8.5-7L18 8" {...common} /><path d="M3.5 9.5v8.8h12V9.5M7 18.3v-5h5v5" {...common} /></>,
    building: <><path d="M1 17.5V6.8L6.5 2l5.5 4.8v10.7H1Z" {...common} /><path d="M12 8h6v9.5h-6M4 10h4M4 13h4M6 17.5v-2.7" {...common} /></>,
    share: <><circle cx="4" cy="10" r="3" {...common} /><circle cx="16" cy="4" r="3" {...common} /><circle cx="16" cy="16" r="3" {...common} /><path d="m6.7 8.7 6.6-3.4M6.7 11.3l6.6 3.4" {...common} /></>,
    folder: <><path d="M1 5.2h6l1.8 2h9.2v9.1c0 .9-.7 1.7-1.7 1.7H2.7c-.9 0-1.7-.7-1.7-1.7V5.2Z" {...common} /><path d="M4.8 2h9.7v3.2" {...common} /></>,
    rewind: <><path d="M3 7a7.8 7.8 0 1 1-1 7.2" {...common} /><path d="m3 3.5-.7 4 4 .7M10 6.5v4l-3 1.5" {...common} /></>,
    sync: <><path d="M17.5 5.5A7.7 7.7 0 0 0 3 7.3L1.5 5.8M2 12.5A7.7 7.7 0 0 0 16.6 11l1.5 1.5" {...common} /><path d="m1.5 5.8.3 3.2M18.1 12.5l-.3-3.2" {...common} /></>,
    settings: <path d="M6.49705 3L7.11134 1.41429C7.21494 1.14581 7.3972 0.914872 7.63427 0.751732C7.87133 0.588591 8.15214 0.50085 8.43991 0.5H9.61134C9.89911 0.50085 10.1799 0.588591 10.417 0.751732C10.654 0.914872 10.8363 1.14581 10.9399 1.41429L11.5542 3L13.6399 4.2L15.3256 3.94286C15.6063 3.90476 15.892 3.95096 16.1464 4.0756C16.4007 4.20024 16.6123 4.39769 16.7542 4.64286L17.3256 5.64286C17.4721 5.89193 17.5395 6.17954 17.5191 6.46774C17.4987 6.75595 17.3914 7.03119 17.2113 7.25714L16.1685 8.58571V10.9857L17.2399 12.3143C17.42 12.5402 17.5273 12.8155 17.5477 13.1037C17.5681 13.3919 17.5006 13.6795 17.3542 13.9286L16.7828 14.9286C16.6409 15.1737 16.4293 15.3712 16.1749 15.4958C15.9206 15.6205 15.6349 15.6667 15.3542 15.6286L13.6685 15.3714L11.5828 16.5714L10.9685 18.1571C10.8649 18.4256 10.6826 18.6566 10.4456 18.8197C10.2085 18.9828 9.92768 19.0706 9.63991 19.0714H8.43991C8.15214 19.0706 7.87133 18.9828 7.63427 18.8197C7.3972 18.6566 7.21494 18.4256 7.11134 18.1571L6.49705 16.5714L4.41134 15.3714L2.72562 15.6286C2.44493 15.6667 2.15925 15.6205 1.90489 15.4958C1.65052 15.3712 1.43894 15.1737 1.29705 14.9286L0.725625 13.9286C0.579199 13.6795 0.511735 13.3919 0.532139 13.1037C0.552543 12.8155 0.659854 12.5402 0.839911 12.3143L1.88277 10.9857V8.58571L0.811339 7.25714C0.631283 7.03119 0.523971 6.75595 0.503568 6.46774C0.483164 6.17954 0.550627 5.89193 0.697053 5.64286L1.26848 4.64286C1.41037 4.39769 1.62195 4.20024 1.87631 4.0756C2.13068 3.95096 2.41636 3.90476 2.69705 3.94286L4.38277 4.2L6.49705 3ZM6.16848 9.78571C6.16848 10.3508 6.33605 10.9032 6.65 11.3731C6.96394 11.8429 7.41017 12.2091 7.93224 12.4254C8.45432 12.6416 9.02879 12.6982 9.58303 12.588C10.1373 12.4777 10.6464 12.2056 11.0459 11.806C11.4455 11.4064 11.7176 10.8973 11.8279 10.3431C11.9381 9.78888 11.8815 9.21441 11.6653 8.69233C11.449 8.17026 11.0828 7.72403 10.613 7.41009C10.1431 7.09614 9.59071 6.92857 9.02563 6.92857C8.26786 6.92857 7.54114 7.22959 7.00532 7.76541C6.4695 8.30123 6.16848 9.02795 6.16848 9.78571V9.78571Z" {...common} />,
  };
  const isSettings = kind === "settings";
  return <svg aria-hidden="true" viewBox={isSettings ? "0 0 19 20" : "-1 -1 21 21"} className={`w-[19px] overflow-visible ${isSettings ? "h-[20px]" : "h-[19px]"}`} strokeWidth="1.25">{paths[kind]}</svg>;
}

function ProfileMenuIcon({ kind }: { kind: ProfileMenuIconKind }) {
  const common = { fill: "none", stroke: "currentColor", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<ProfileMenuIconKind, React.ReactNode> = {
    account: <><circle cx="6.75" cy="7.42" r="2.21" {...common} /><path d="M3 13.08a4.36 4.36 0 0 1 7.55 0M6.75 14.5a5.75 5.75 0 1 0 0-11.5 5.75 5.75 0 0 0 0 11.5Z" {...common} /></>,
    billing: <><rect x=".5" y="1.77" width="10.21" height="7.46" rx=".79" {...common} /><path d="M.5 4.52h10.21M7.57 7.27h1.18" {...common} /></>,
    language: <><circle cx="6" cy="6" r="5.57" {...common} /><path d="M.43 6h11.14M8.14 6A10.4 10.4 0 0 1 6 11.57 10.4 10.4 0 0 1 3.86 6 10.4 10.4 0 0 1 6 .43 10.4 10.4 0 0 1 8.14 6Z" {...common} /></>,
    theme: <><rect x=".5" y=".5" width="3" height="11.14" rx=".43" {...common} /><rect x="3.5" y="2.21" width="3" height="9.43" rx=".43" {...common} /><path d="m8.94 1.98 1.66-.42a.43.43 0 0 1 .52.31l2.08 8.32a.43.43 0 0 1-.31.52l-1.66.42a.43.43 0 0 1-.52-.31L8.63 2.5a.43.43 0 0 1 .31-.52ZM.5 8.64h3M3.5 7.79h3M10.64 9.5l2.47-.62" {...common} /></>,
    logout: <><path d="M.5 4.94V1.31C.5.86.86.5 1.31.5h8.88c.45 0 .81.36.81.81v8.88c0 .45-.36.81-.81.81H6.56M3.33 11H.5V8.17M.5 11l5.25-5.25" {...common} /></>,
  };
  const size = kind === "account" ? "h-[15px] w-[14px]" : kind === "theme" ? "h-[13px] w-[13px]" : "h-3 w-3";
  return <svg aria-hidden="true" viewBox={kind === "account" ? "0 0 14 15" : kind === "billing" ? "0 0 12 11" : "0 0 12 12"} className={`${size} overflow-visible`} strokeWidth="1">{paths[kind]}</svg>;
}

function ProfileMenu({ user, onClose, onLogout, onMessage }: { user: Props["user"]; onClose: () => void; onLogout: () => void; onMessage: (message: string) => void }) {
  const { lang, setLang } = useLang();
  const { theme, toggle: toggleTheme } = useTheme();
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const label = user.name.trim() || user.email.split("@")[0] || "Account";
  const copy = workspaceCopy[lang];
  const languages = ["en", "zh-Hans", "zh-Hant", "ko", "th", "km"] as const;
  const nextTheme = theme === "light" ? "dark" : "light";
  const actions: Array<{ icon: ProfileMenuIconKind; label: string; onClick: () => void }> = [
    { icon: "account", label: copy.accountProfile, onClick: () => onMessage(copy.accountProfile) },
    { icon: "billing", label: copy.plansBilling, onClick: () => onMessage(copy.plansBilling) },
    { icon: "language", label: `${copy.language}: ${copy.languageName[lang]}`, onClick: () => setLanguageMenuOpen((open) => !open) },
    { icon: "theme", label: `${copy.theme}: ${theme}`, onClick: () => { toggleTheme(); onMessage(`${copy.theme}: ${nextTheme}`); } },
    { icon: "logout", label: copy.logout, onClick: onLogout },
  ];
  return (
    <div className="absolute bottom-0 left-[65px] z-50 h-[194px] w-[145px] overflow-visible rounded-[6px] border-[0.5px] border-[#939393] bg-[rgba(46,46,46,.4)] font-sans shadow-2xl backdrop-blur-xl" role="menu" aria-label={copy.account}>
      <div className="flex h-[40px] items-start gap-[9px] border-b border-[#d7d7d7]/70 px-[8px] pt-[8px]">
        <span className="grid h-[24px] w-[26px] place-items-center rounded-[4px] bg-[#d9d9d9] text-[9px] font-semibold text-[#303030]">{label.slice(0, 1).toUpperCase()}</span>
        <div className="min-w-0"><p className="truncate text-[10px] leading-3 text-white">{label}</p><div className="mt-[3px] flex items-center gap-1 text-[7px] leading-2 text-[#a8a8a8]"><span>{copy.personal}</span><span className="h-[2px] w-[2px] rounded-full bg-[#d9d9d9]" /><span>{copy.free}</span></div></div>
      </div>
      {actions.map(({ icon, label: actionLabel, onClick }, index) => <button key={icon} type="button" role="menuitem" aria-haspopup={icon === "language" ? "menu" : undefined} aria-expanded={icon === "language" ? languageMenuOpen : undefined} onClick={() => { onClick(); if (icon === "account" || icon === "billing") onClose(); }} className={`flex h-[31px] w-full items-center gap-[8px] px-[9px] text-left text-[10px] text-white transition hover:bg-white/10 ${index < actions.length - 1 ? "border-b border-[#d7d7d7]/70" : ""}`}><ProfileMenuIcon kind={icon} /><span className="whitespace-nowrap">{actionLabel}</span></button>)}
      {languageMenuOpen && <div className="absolute bottom-[62px] left-[149px] z-10 w-[145px] overflow-visible rounded-[6px] border-[0.5px] border-[#939393] bg-[rgba(46,46,46,.4)] shadow-2xl backdrop-blur-xl" role="menu" aria-label={copy.language}>
        {languages.map((language, index) => <button key={language} type="button" role="menuitemradio" aria-checked={lang === language} onClick={() => { setLang(language); setLanguageMenuOpen(false); }} className={`flex h-[31px] w-full items-center justify-between px-[9px] text-left text-[10px] text-white transition hover:bg-white/10 ${index < languages.length - 1 ? "border-b border-[#d7d7d7]/70" : ""}`}><span>{copy.languageName[language]}</span>{lang === language && <span aria-hidden="true">✓</span>}</button>)}
      </div>}
    </div>
  );
}

function ProjectCard({ workflow, index, onRename, onDelete, copy }: { workflow: WorkflowSummary; index: number; onRename: () => void; onDelete: () => void; copy: WorkspaceCopy }) {
  return (
    <article className="group relative h-[142px] w-[197px] rounded-[5px] border border-white/75 bg-[#c2c2c2] text-[#575757] shadow-[0_0_0_1px_rgba(0,0,0,.12)] transition-transform hover:-translate-y-1">
      <Link href={`/workspace/${workflow.id}`} className="absolute left-[4px] top-[4px] block h-[112px] w-[188px] overflow-hidden rounded-[5px]">
        <div className="relative h-[112px] overflow-hidden rounded-[5px] bg-[#777]">
          <img src={workflow.previewUrl || previewImages[index % previewImages.length]} alt="" className={`h-full w-full object-cover transition duration-300 ease-out group-hover:scale-105 ${workflow.previewUrl ? "" : "group-hover:blur-[7px]"}`} />
          <div className="absolute inset-0 grid place-items-center bg-black/10 opacity-0 transition-opacity duration-300 group-hover:opacity-100"><span className="text-[14px] font-bold text-white drop-shadow">{workflow.name || copy.untitled}</span></div>
        </div>
      </Link>
      <div className="absolute bottom-[5px] left-[7px] right-[5px] flex items-center justify-between text-[8px] font-medium leading-none">
        <span>{formatWorkflowDate(workflow.updatedAt)}</span>
        <span>{formatEditedAgo(workflow.updatedAt)}</span>
      </div>
      <div className="absolute inset-x-[4px] top-[4px] flex justify-end gap-2 rounded-[5px] bg-black/45 p-2 opacity-0 transition-opacity group-hover:opacity-100">
        <button type="button" onClick={onRename} className="text-[9px] text-white hover:text-white/70">{copy.rename}</button>
        <button type="button" onClick={onDelete} className="text-[9px] text-white hover:text-red-300">{copy.delete}</button>
      </div>
    </article>
  );
}

function CreateCanvasCard({ onCreate, busy, copy }: { onCreate: () => void; busy: boolean; copy: WorkspaceCopy }) {
  return (
    <button type="button" onClick={onCreate} disabled={busy} className="group relative h-[142px] w-[197px] rounded-[5px] border border-white/75 bg-[#c2c2c2] text-white shadow-[0_0_0_1px_rgba(0,0,0,.12)] transition-transform hover:-translate-y-1 disabled:cursor-wait disabled:opacity-70">
      <div className="absolute left-[4px] top-[4px] h-[112px] w-[188px] overflow-hidden rounded-[5px] bg-[#868686]">
        <img src="/website/flowvideo/toplist/6.png" alt="" className="absolute left-[70px] top-[34px] z-10 h-[31px] w-[31px] rotate-[-6.28deg] rounded-[5px] border border-white/80 object-cover transition-transform duration-300 ease-out group-hover:-translate-x-1" />
        <span className="absolute left-[94px] top-[34px] z-20 grid h-[31px] w-[31px] rotate-[6.81deg] place-items-center rounded-[5px] border border-white/40 bg-white/[0.13] text-[28px] font-light leading-none text-white shadow-[inset_1px_1px_2px_rgba(255,255,255,0.48),inset_-1px_-1px_2px_rgba(0,0,0,0.2),0_2px_5px_rgba(0,0,0,0.18)] backdrop-blur-[3px] transition-transform duration-300 ease-out group-hover:translate-x-1">+</span>
        <span className="absolute left-[49.5px] top-[78px] w-[95px] text-center text-[10px] font-bold leading-[9px]">{copy.newCanvas}</span>
      </div>
    </button>
  );
}

export function WorkflowDashboard({ user, workspace, initialWorkflows, localMode = false }: Props) {
  const router = useRouter();
  const { lang } = useLang();
  const copy = workspaceCopy[lang];
  const [workflows, setWorkflows] = useState(initialWorkflows);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!profileMenuRef.current?.contains(event.target as Node)) setProfileMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setProfileMenuOpen(false);
    };
    window.addEventListener("pointerdown", closeOnOutside);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutside);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [profileMenuOpen]);

  const createWorkflow = async () => {
    if (localMode) {
      router.push("/workspace/local");
      return;
    }
    setBusy(true); setMessage("");
    try {
      const payload = await createWorkflowRemote(copy.untitled);
      if (!payload.output) throw new Error(copy.createError);
      setWorkflows((items) => [payload.output as WorkflowSummary, ...items]);
      router.push(`/workspace/${payload.output.id}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : copy.createError); } finally { setBusy(false); }
  };

  const renameWorkflow = async (workflow: WorkflowSummary) => {
    const name = window.prompt(copy.projectName, workflow.name)?.trim();
    if (!name) return;
    try {
      const payload = await renameWorkflowRemote(workflow.id, name);
      setWorkflows((items) => items.map((item) => item.id === workflow.id ? { ...item, name, revision: payload.output?.revision || item.revision, updatedAt: payload.output?.updatedAt || new Date().toISOString() } : item));
    } catch (error) { setMessage(error instanceof Error ? error.message : copy.renameError); }
  };

  const deleteWorkflow = async (workflow: WorkflowSummary) => {
    if (!window.confirm(copy.deleteConfirm(workflow.name))) return;
    try { await deleteWorkflowRemote(workflow.id); setWorkflows((items) => items.filter((item) => item.id !== workflow.id)); }
    catch (error) { setMessage(error instanceof Error ? error.message : copy.deleteError); }
  };

  const logout = async () => {
    setLoggingOut(true);
    try { await fetch("/api/auth/logout", { method: "POST" }); router.replace("/login"); router.refresh(); }
    catch { setMessage(copy.logoutError); setLoggingOut(false); }
  };

  const upperNav: Array<{ kind: SideIconKind; label: string }> = [
    { kind: "home", label: copy.home },
    { kind: "building", label: copy.community },
    { kind: "share", label: copy.workflows },
  ];
  const lowerNav: Array<{ kind: SideIconKind; label: string }> = [
    { kind: "folder", label: copy.projects },
    { kind: "rewind", label: copy.recents },
    { kind: "sync", label: copy.favourites },
  ];

  return (
    <main className="workspace-noise relative min-h-screen overflow-x-auto bg-black font-epilogue text-white">
      <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
        <span className="workspace-background-orb workspace-background-orb--mirrored-gradient" />
        <span className="workspace-background-orb workspace-background-orb--vector" />
        <span className="workspace-background-orb workspace-background-orb--rust" />
        <span className="workspace-background-orb workspace-background-orb--cream" />
      </div>
      <div className="workspace-stage relative z-10 flex min-h-[max(854px,100vh)] min-w-[1440px] justify-center">
        <aside className="absolute inset-y-0 left-0 z-40 w-[56px] bg-white/[0.1]">
          <nav className="absolute left-0 top-[137px] flex w-full flex-col items-center gap-[26px]" aria-label="Primary navigation">
            {upperNav.map(({ kind, label }) => kind === "home"
              ? <Link key={label} href="/" title={label} aria-label={label} className="text-white transition hover:text-white/60"><SideIcon kind={kind} /></Link>
              : <button key={label} type="button" title={label} aria-label={label} className="text-white transition hover:text-white/60"><SideIcon kind={kind} /></button>)}
          </nav>
          <div className="absolute left-[13px] top-[274px] h-px w-[31px] bg-[#9c9c9c]" />
          <nav className="absolute left-0 top-[296px] flex w-full flex-col items-center gap-[25px]" aria-label="Project navigation">
            {lowerNav.map(({ kind, label }, index) => <button key={label} type="button" title={label} aria-label={label} className={`relative grid h-[31px] w-[31px] place-items-center text-white transition hover:text-white/60 ${index === 0 ? "rounded-[5px] bg-black" : ""}`}><SideIcon kind={kind} /></button>)}
          </nav>
          <button type="button" title={copy.settings} className="absolute left-[19px] top-[748px] text-white transition hover:text-white/60" onClick={() => setMessage(copy.settings)}><SideIcon kind="settings" /></button>
          <div ref={profileMenuRef} className="absolute left-[14px] top-[789px] z-50">
            {profileMenuOpen && <ProfileMenu user={user} onClose={() => setProfileMenuOpen(false)} onLogout={() => void logout()} onMessage={setMessage} />}
            <button type="button" title={copy.account} aria-label={copy.account} aria-haspopup="menu" aria-expanded={profileMenuOpen} className="h-[27px] w-[29px] rounded-[5px] bg-[#d9d9d9] transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-1 focus-visible:outline-white" onClick={() => setProfileMenuOpen((open) => !open)} disabled={loggingOut} />
          </div>
        </aside>

        <section className="w-[1440px] shrink-0 pl-[126px] pt-[58px]">
          <header className="mb-[18px] h-[39px]">
            <h1 className="text-[30px] font-semibold leading-none tracking-wide" style={{ fontFamily: "var(--font-baskervville-bold)" }}>{copy.project}</h1>
          </header>

          <div className="mb-[20px] flex gap-[20px]">
            {[copy.yourProjects, copy.allProjects, copy.sharedWithYou].map((label, index) => <button key={label} type="button" className={`h-[29px] w-[111px] rounded-[13px] bg-[#f1f1f1] p-0 text-[10.5px] font-medium leading-[11px] text-black ${index === 0 ? "ring-1 ring-white/40" : "opacity-95"}`}>{label}</button>)}
          </div>

          {message && <div role="alert" className="mb-3 max-w-xl rounded-lg border border-red-300/30 bg-red-950/40 px-4 py-3 text-xs text-red-100">{message}</div>}
          <div className="grid grid-cols-[repeat(6,197px)] gap-x-[13px] gap-y-[13px]">
            <CreateCanvasCard onCreate={() => void createWorkflow()} busy={busy} copy={copy} />
            {workflows.map((workflow, index) => <ProjectCard key={workflow.id} workflow={workflow} index={index} copy={copy} onRename={() => void renameWorkflow(workflow)} onDelete={() => void deleteWorkflow(workflow)} />)}
          </div>
        </section>
      </div>
    </main>
  );
}
