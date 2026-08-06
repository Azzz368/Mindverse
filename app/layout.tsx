import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { LangProvider } from "@/components/providers/LangProvider";

const epilogue = localFont({
  src: [
    {
      path: "../public/fonts/Epilogue/Epilogue-VariableFont_wght.ttf",
      style: "normal",
    },
    {
      path: "../public/fonts/Epilogue/Epilogue-Italic-VariableFont_wght.ttf",
      style: "italic",
    },
  ],
  variable: "--font-epilogue",
});

export const metadata: Metadata = { title: "Mindverse", description: "Creative AI workflow canvas" };

const themeScript = `try{const t=localStorage.getItem('theme');const d=window.matchMedia('(prefers-color-scheme: dark)').matches;if(t==='dark'||(!t&&d))document.documentElement.classList.add('dark')}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className={`${epilogue.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="font-epilogue">
        <ThemeProvider>
          <LangProvider>{children}</LangProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
