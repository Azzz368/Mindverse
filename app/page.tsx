"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { DirectorAgentPanel } from "@/components/DirectorAgentPanel";
import { LensRefraction } from "@/components/LensRefraction";

const TOPLIST_IMAGES = [
  "/website/flowvideo/toplist/1.png",
  "/website/flowvideo/toplist/2.png",
  "/website/flowvideo/toplist/3.png",
  "/website/flowvideo/toplist/4.png",
  "/website/flowvideo/toplist/5.png",
  "/website/flowvideo/toplist/6.png",
  "/website/flowvideo/toplist/7.png",
  "/website/flowvideo/toplist/8.png",
];

const DOWNLIST_IMAGES = Array.from(
  { length: 8 },
  (_, index) => `/website/flowvideo/downlist/${index + 1}.png`,
);

export default function Home() {
  const [heroStage, setHeroStage] = useState<"black" | "video">("black");
  const [activeHeroVideo, setActiveHeroVideo] = useState<"fullCowboy" | "partCowboy" | "daduhuidog" | "basketball">("fullCowboy");
  const [heroMediaReady, setHeroMediaReady] = useState(false);
  const heroSectionRef = useRef<HTMLElement>(null);
  const heroPanRef = useRef({ x: 0, y: 0 });
  const fullCowboyVideoRef = useRef<HTMLVideoElement>(null);
  const partCowboyVideoRef = useRef<HTMLVideoElement>(null);
  const daduhuidogVideoRef = useRef<HTMLVideoElement>(null);
  const basketballVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    // Keep the first paint black, then immediately start the normal 0.2 s video fade.
    const revealFrame = window.requestAnimationFrame(() => setHeroStage("video"));

    return () => {
      window.cancelAnimationFrame(revealFrame);
    };
  }, []);

  useEffect(() => {
    setHeroMediaReady(true);
  }, []);

  useEffect(() => {
    if (heroStage === "video") {
      const video = {
        fullCowboy: fullCowboyVideoRef.current,
        partCowboy: partCowboyVideoRef.current,
        daduhuidog: daduhuidogVideoRef.current,
        basketball: basketballVideoRef.current,
      }[activeHeroVideo];
      if (video?.ended) video.currentTime = 0;
      void video?.play();
    }
  }, [activeHeroVideo, heroStage]);

  useEffect(() => {
    const section = heroSectionRef.current;
    if (!section) return;

    let targetPan = { x: 0, y: 0 };
    let currentPan = { x: 0, y: 0 };
    let animationFrame = 0;

    const applyPan = () => {
      currentPan = {
        x: currentPan.x + (targetPan.x - currentPan.x) * 0.12,
        y: currentPan.y + (targetPan.y - currentPan.y) * 0.12,
      };
      heroPanRef.current = { ...currentPan };

      // Camera-like background movement: broad horizontal range and a visible but controlled Y range.
      const objectPosition = `${50 + currentPan.x * 24}% ${50 + currentPan.y * 20}%`;
      [fullCowboyVideoRef, partCowboyVideoRef, daduhuidogVideoRef, basketballVideoRef].forEach((videoRef) => {
        if (videoRef.current) videoRef.current.style.objectPosition = objectPosition;
      });

      if (
        Math.abs(targetPan.x - currentPan.x) > 0.001 ||
        Math.abs(targetPan.y - currentPan.y) > 0.001
      ) {
        animationFrame = window.requestAnimationFrame(applyPan);
      } else {
        currentPan = { ...targetPan };
        heroPanRef.current = { ...currentPan };
      }
    };

    const updateTargetPan = (event: PointerEvent) => {
      const rect = section.getBoundingClientRect();
      const isInsideHero =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;

      if (!isInsideHero) {
        resetTargetPan();
        return;
      }

      targetPan = {
        x: Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1)),
        y: Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height) * 2 - 1)),
      };
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(applyPan);
    };

    const resetTargetPan = () => {
      targetPan = { x: 0, y: 0 };
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(applyPan);
    };

    // Capture from window so the R3F canvas cannot stop the browser-level movement handler.
    window.addEventListener("pointermove", updateTargetPan, true);
    window.addEventListener("blur", resetTargetPan);
    return () => {
      window.removeEventListener("pointermove", updateTargetPan, true);
      window.removeEventListener("blur", resetTargetPan);
      window.cancelAnimationFrame(animationFrame);
    };
  }, []);

  // Setup liquid glass interactivity
  useEffect(() => {
    const handleGlassMouseMove = (e: MouseEvent) => {
      const element = e.currentTarget as HTMLElement;
      const rect = element.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      const filter = element.querySelector('filter feDisplacementMap');
      if (filter) {
        const scaleX = (x / rect.width) * 100;
        const scaleY = (y / rect.height) * 100;
        filter.setAttribute('scale', Math.min(scaleX, scaleY).toString());
      }
      
      const specular = element.querySelector('.glass-specular') as HTMLElement;
      if (specular) {
        specular.style.background = `radial-gradient(
          circle at ${x}px ${y}px,
          rgba(255,255,255,0.2) 0%,
          rgba(255,255,255,0.08) 30%,
          rgba(255,255,255,0) 60%
        )`;
      }
    };

    const handleGlassMouseLeave = (e: MouseEvent) => {
      const element = e.currentTarget as HTMLElement;
      const filter = element.querySelector('filter feDisplacementMap');
      if (filter) filter.setAttribute('scale', '77');
      
      const specular = element.querySelector('.glass-specular') as HTMLElement;
      if (specular) specular.style.background = 'none';
    };

    const glassElements = document.querySelectorAll('.glass-card');
    glassElements.forEach(element => {
      element.addEventListener('mousemove', handleGlassMouseMove as EventListener);
      element.addEventListener('mouseleave', handleGlassMouseLeave as EventListener);
    });

    return () => {
      glassElements.forEach(element => {
        element.removeEventListener('mousemove', handleGlassMouseMove as EventListener);
        element.removeEventListener('mouseleave', handleGlassMouseLeave as EventListener);
      });
    };
  }, []);

  return (
    <div className="w-full bg-white relative overflow-clip font-epilogue">
      {/* Global SVG Filters for Liquid Glass Effect */}
      <svg style={{ display: "none" }}>
        <filter id="glass-distortion">
          <feTurbulence type="turbulence" baseFrequency="0.008" numOctaves="2" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="77" />
        </filter>
      </svg>
      <svg className="glass-surface__filter" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="glass-filter-_r_b_" colorInterpolationFilters="sRGB" x="0%" y="0%" width="100%" height="100%">
            <feImage
              x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="map"
              href="data:image/png;base64,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" />
            <feDisplacementMap in="SourceGraphic" in2="map" id="redchannel" result="dispRed" scale="-20" xChannelSelector="R" yChannelSelector="G"></feDisplacementMap>
            <feDisplacementMap in="SourceGraphic" in2="map" id="greenchannel" result="dispGreen" scale="-24" xChannelSelector="R" yChannelSelector="G"></feDisplacementMap>
            <feColorMatrix in="dispGreen" type="matrix" values="0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0" result="green"></feColorMatrix>
            <feDisplacementMap in="SourceGraphic" in2="map" id="bluechannel" result="dispBlue" scale="-28" xChannelSelector="R" yChannelSelector="G"></feDisplacementMap>
            <feColorMatrix in="dispBlue" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0" result="blue"></feColorMatrix>
            <feBlend in="red" in2="green" mode="screen" result="rg"></feBlend>
            <feBlend in="rg" in2="blue" mode="screen" result="output"></feBlend>
            <feGaussianBlur in="output" stdDeviation="3"></feGaussianBlur>
          </filter>
        </defs>
      </svg>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes marquee-left {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes marquee-right {
          0% { transform: translateX(-50%); }
          100% { transform: translateX(0); }
        }
        .animate-marquee-left {
          display: flex;
          width: max-content;
          animation: marquee-left 32s linear infinite;
        }
        .animate-marquee-right {
          display: flex;
          width: max-content;
          animation: marquee-right 32s linear infinite;
        }
        
        /* 额外给玻璃容器增加滤镜引用 */
        .liquid-filter {
          filter: url(#glass-filter-_r_b_);
        }

        .start-now-pill {
          overflow: hidden;
          isolation: isolate;
        }

        .start-now-pill::before {
          content: "";
          position: absolute;
          inset: 0;
          z-index: 0;
          border-radius: inherit;
          background: #000;
          transform: scaleX(0);
          transform-origin: center;
          transition: transform 210ms ease-out;
        }

        .start-now-control:hover .start-now-pill::before,
        .start-now-control:focus-within .start-now-pill::before,
        .start-now-control:active .start-now-pill::before {
          transform: scaleX(1);
        }

        .footer-nav a,
        .footer-bottom-link {
          transition: color 350ms ease-out;
        }

        .footer-nav a:hover,
        .footer-nav a:focus-visible,
        .footer-nav a:active,
        .footer-bottom-link:hover,
        .footer-bottom-link:focus-visible,
        .footer-bottom-link:active {
          color: #000;
        }

        .hero-video {
          opacity: 0;
          transition: opacity 200ms ease-in-out;
        }

        .hero-video--visible {
          opacity: 1;
        }

      `}} />

      {/* 单一连续容器：Hero、轮播、页脚共享同一个正常文档流和同一条页面滚动条，
          不再作为三个独立的 <section>/<footer> 区块各自成一个滚动或裁剪单元。 */}
      <main className="relative flex w-full flex-col">
      {/* ======================= Desktop - 2 ======================= */}
      <section 
        ref={heroSectionRef}
        className="relative w-full h-[816px] bg-black overflow-hidden flex justify-center"
      >
        {/* 首次播放完整 Cowboy，之后循环播放 Part Cowboy、Daduhuidog、Feichuanlanqiu。 */}
        <video
          ref={fullCowboyVideoRef}
          className={`hero-video absolute inset-0 h-full w-full object-cover pointer-events-none ${heroStage === "video" && activeHeroVideo === "fullCowboy" ? "hero-video--visible" : ""}`}
          src="/website/fullcowboy.mp4"
          muted
          playsInline
          preload="auto"
          onEnded={() => setActiveHeroVideo("daduhuidog")}
        />
        <video
          ref={partCowboyVideoRef}
          className={`hero-video absolute inset-0 h-full w-full object-cover pointer-events-none ${heroStage === "video" && activeHeroVideo === "partCowboy" ? "hero-video--visible" : ""}`}
          src="/website/partofcowboy.mp4"
          muted
          playsInline
          preload="auto"
          onEnded={() => setActiveHeroVideo("daduhuidog")}
        />
        <video
          ref={daduhuidogVideoRef}
          className={`hero-video absolute inset-0 h-full w-full object-cover pointer-events-none ${heroStage === "video" && activeHeroVideo === "daduhuidog" ? "hero-video--visible" : ""}`}
          src="/website/daduhuidog.mp4"
          muted
          playsInline
          preload="auto"
          onEnded={() => setActiveHeroVideo("basketball")}
        />
        <video
          ref={basketballVideoRef}
          className={`hero-video absolute inset-0 h-full w-full object-cover pointer-events-none ${heroStage === "video" && activeHeroVideo === "basketball" ? "hero-video--visible" : ""}`}
          src="/website/feichuanlanqiu.mp4"
          muted
          playsInline
          preload="auto"
          onEnded={() => setActiveHeroVideo("partCowboy")}
        />

        {/* --- Figma 居中的 1440px 容器层 (用于约束元素的定位) --- */}
        <div className="relative w-full max-w-[1440px] h-[816px] pointer-events-none">
        
          {/* 50% 透明度的磨砂导航背景，避免与中心透镜竞争视觉焦点。 */}
          <header className="absolute top-0 -left-[100vw] !w-[300vw] h-[54px] bg-white/16 backdrop-blur-md border-b border-white/15 box-border z-50 pointer-events-auto" />
          
          <div className="absolute top-0 left-0 w-full h-[54px] z-50 hover:cursor-default pointer-events-auto">
            {/* Logo "Mindverse" */}
            <div className="absolute top-[18px] left-[38px] w-[141px] h-[19px]">
              <span className="block text-center italic font-normal text-[16px] leading-[18px] text-white mix-blend-difference drop-shadow-sm">
                Mindverse
              </span>
            </div>

            {/* Menu Items */}
            <div className="absolute top-[21px] left-[241px] w-[699px] h-[14px]">
              <Link href="#" className="absolute left-[16.5px] w-[141px] h-[14px] text-center font-normal text-[13px] leading-[14px] text-white hover:opacity-70 mix-blend-difference drop-shadow-sm">
                Document
              </Link>
              <Link href="#" className="absolute left-[202.5px] w-[141px] h-[14px] text-center font-normal text-[13px] leading-[14px] text-white hover:opacity-70 mix-blend-difference drop-shadow-sm">
                Community
              </Link>
              <Link href="#" className="absolute left-[388.5px] w-[141px] h-[14px] text-center font-normal text-[13px] leading-[14px] text-white hover:opacity-70 mix-blend-difference drop-shadow-sm">
                Studio
              </Link>
              <Link href="#" className="absolute left-[574.5px] w-[141px] h-[14px] text-center font-normal text-[13px] leading-[14px] text-white hover:opacity-70 mix-blend-difference drop-shadow-sm">
                Contact
              </Link>
            </div>

            {/* English */}
            <div className="absolute top-[20px] left-[1097.5px] w-[141px] h-[14px]">
              <span className="block text-center font-normal text-[13px] leading-[14px] text-white cursor-pointer hover:opacity-70 mix-blend-difference drop-shadow-sm">
                English
              </span>
            </div>

            {/* Vector 1 (Arrow/Line beside English) */}
            <div className="absolute top-[23px] left-[1208px] w-[13px] h-[8px] flex items-center justify-center rotate-90">
               <div className="w-full h-[0.5px] bg-white mix-blend-difference"></div>
            </div>

            {/* Start Now / Rectangle 1: center-out black fill on interaction */}
            <div className="start-now-control absolute top-[11px] left-[1267.5px] h-[32px] w-[141px] z-10">
              <div className="start-now-pill absolute left-[14.5px] top-0 h-[32px] w-[112px] rounded-[25px] border border-white mix-blend-difference box-border" />
              <Link
                href="/workspace"
                className="absolute inset-0 flex items-center justify-center font-normal text-[13px] leading-[14px] text-white mix-blend-difference drop-shadow-sm focus-visible:outline focus-visible:outline-1 focus-visible:outline-white"
              >
                Start Now
              </Link>
            </div>
          </div>

          {/* Lens position: top controls Y (up/down), left controls X (left/right). */}
          <div className={`pointer-events-none absolute top-[335px] left-[508.5px] h-[134px] w-[423px] overflow-hidden rounded-[74px] z-10 transition-opacity duration-[200ms] ease-in-out ${heroStage === "video" ? "opacity-100" : "opacity-0"}`}>
            <LensRefraction
              stage="video"
              activeVideoElement={heroMediaReady ? {
                fullCowboy: fullCowboyVideoRef.current,
                partCowboy: partCowboyVideoRef.current,
                daduhuidog: daduhuidogVideoRef.current,
                basketball: basketballVideoRef.current,
              }[activeHeroVideo] : null}
              heroPanRef={heroPanRef}
            />
          </div>

          {/* Mindverse (Big Title) */}
          <div className="absolute top-[370px] left-[430px] w-[581px] h-[66px] pointer-events-none z-20">
            <h1 className="font-baskervville text-center text-[55px] font-bold italic leading-[66px] text-white drop-shadow-lg">
              MINDVERSE
            </h1>
          </div>

          {/* Group 1: Get Started */}
          <Link
            href="/workspace"
            aria-label="Get Started"
            className="get-started-link font-baskervville-bold absolute top-[500px] left-[565px] flex h-[71px] w-[334px] items-start justify-center text-[40px] font-bold leading-[41px] text-white transition-colors duration-[350ms] ease-out hover:text-black focus-visible:text-black active:text-black z-20 pointer-events-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            style={{ fontFamily: "var(--font-baskervville-bold)" }}
          >
            <span className="flex items-start justify-center gap-5 pt-[2px]">
              <span>Get Started</span>
              <svg aria-hidden="true" className="mt-[-1px] h-[37px] w-[42px] shrink-0" fill="none" viewBox="0 0 42 37">
                <path d="M2 1L20 18.5L2 36" stroke="currentColor" strokeWidth="3" />
                <path d="M12 1L30 18.5L12 36" stroke="currentColor" strokeWidth="3" />
              </svg>
            </span>
          </Link>
        </div>
      </section>

      {/* ======================= Desktop - 3 ======================= */}
      <section 
        className="relative flex min-h-[1606px] w-full justify-center overflow-x-clip bg-black"
      >
        {/* Frame 1 overlay */}
        <div className="absolute inset-0 h-full w-full bg-black/[0.004] pointer-events-none" />

        {/* 内部约束容器保留元素定位尺寸 (1440px 居中，仅保留渐变背景) */}
        <div className="relative w-full max-w-[1440px] min-h-[1606px] pointer-events-none">
          {/* Image Grid Row 1 (top: 175px) - Scrolls Left (跨越全屏，向外突围) */}
          <div className="pointer-events-auto absolute top-[175px] left-[50%] w-[100vw] -translate-x-1/2 overflow-hidden">
            <div className="animate-marquee-left">
              {/* Duplicate the eight-card sequence for a seamless loop. */}
              {[...Array(2)].map((_, i) => (
                <div key={i} className="flex shrink-0 gap-[25px] pr-[25px]">
                  {TOPLIST_IMAGES.map((source, index) => (
                    <img
                      key={`${i}-${source}`}
                      src={source}
                      alt={`Top showcase ${index + 1}`}
                      className="h-[160px] w-[295px] shrink-0 rounded-[13px] border border-white/20 object-cover shadow-sm"
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Image Grid Row 2 (top: 354px) - Scrolls Right */}
          <div className="absolute top-[354px] left-[50%] -translate-x-1/2 w-[100vw] overflow-hidden pointer-events-auto">
            <div className="animate-marquee-right">
              {/* Duplicate the eight-card sequence for a seamless loop. */}
              {[...Array(2)].map((_, i) => (
                <div key={i} className="flex shrink-0 gap-[25px] pr-[25px]">
                  {DOWNLIST_IMAGES.map((source, index) => (
                    <img
                      key={`${i}-${source}`}
                      src={source}
                      alt={`Bottom showcase ${index + 1}`}
                      className="h-[160px] w-[295px] shrink-0 rounded-[13px] border border-white/20 object-cover shadow-sm"
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Title: All IN ONE... */}
          <div className="absolute top-[700px] left-[357px] w-[726px] h-[69px]">
            <h2 className="font-baskervville text-center font-semibold italic text-[56px] leading-[72px] text-white drop-shadow-md">
              All IN ONE, All IN ONCE.
            </h2>
          </div>

          {/* Rectangle 20: 单个深色展示面板，GSAP + ScrollTrigger 驱动的 frame1-frame4 滚轮动画 */}
          <DirectorAgentPanel />
        </div>
      </section>

      {/* ======================= MacBook Pro 16 - Footer ======================= */}
      <footer
        className="font-epilogue relative h-[1117px] w-full overflow-hidden font-normal text-white"
        style={{ background: "linear-gradient(180deg, #000000 7.87%, #060402 27.4%, #26190F 68.27%)" }}
      >
        {/* Figma background atmosphere */}
        <div className="pointer-events-none absolute inset-x-[-105px] top-[465px] h-[1009px] bg-[rgba(42,29,20,0.89)] blur-[90px]" />
        <div className="pointer-events-none absolute inset-x-0 top-[684px] h-[884px] bg-[#3C2F1C] blur-[85px]" />
        <div className="pointer-events-none absolute inset-x-0 top-[889px] h-[442px] bg-[#4A3923] blur-[75px]" />
        <div className="pointer-events-none absolute left-1/2 top-[936px] h-[452px] w-[1170px] -translate-x-1/2 bg-[#7B6954] blur-[75px]" />
        <div className="pointer-events-none absolute left-1/2 top-[1060px] h-[174px] w-[818px] -translate-x-1/2 bg-[#B79D7D] blur-[75px]" />
        <div className="pointer-events-none absolute left-1/2 top-[870px] h-[176px] w-[1618px] -translate-x-1/2 rounded-[50%] border-[18px] border-[#9E6796] blur-[97px]" />

        <div className="relative mx-auto h-full w-full max-w-[1440px]">
          <div className="absolute left-[73px] top-[666px] w-[162px]">
            <h3 className="font-baskervville text-[15px] font-bold leading-[19px]">AI Video Generator</h3>
            <nav className="footer-nav mt-[17px] flex flex-col gap-[1px] text-[13px] leading-[25px] text-[#A3A3A3]">
              <Link href="#">Text to Video</Link>
              <Link href="#">Image to Video</Link>
              <Link href="#">One-Click Agent Video</Link>
              <Link href="#">Auto Video Editor</Link>
              <Link href="#">Frame Interpolation</Link>
              <Link href="#">Cartoon Video Generator</Link>
              <Link href="#">Music Video Generator</Link>
            </nav>
          </div>

          <div className="absolute left-[298px] top-[666px] w-[162px]">
            <h3 className="font-baskervville text-[15px] font-bold leading-[19px]">AI Canvas &amp; Workflow</h3>
            <nav className="footer-nav mt-[17px] flex flex-col gap-[1px] text-[13px] leading-[25px] text-[#A3A3A3]">
              <Link href="#">Storyboard Generator</Link>
              <Link href="#">Scene Library</Link>
              <Link href="#">Character Lock</Link>
              <Link href="#">Script to Storyboard</Link>
              <Link href="#">Clip Sequencer</Link>
              <Link href="#">Batch Video Production</Link>
              <Link href="#">Node Workflow</Link>
            </nav>
          </div>

          <div className="absolute left-[544px] top-[666px] w-[162px]">
            <h3 className="font-baskervville text-[15px] font-bold leading-[19px]">AI Digital Human</h3>
            <nav className="footer-nav mt-[17px] flex flex-col gap-[1px] text-[13px] leading-[25px] text-[#A3A3A3]">
              <Link href="#">Digital Human Maker</Link>
              <Link href="#">Talking Avatar Generator</Link>
              <Link href="#">Photo to Avatar</Link>
              <Link href="#">Face Consistency Lock</Link>
              <Link href="#">Lip-Sync Generator</Link>
              <Link href="#">Voice Cloning</Link>
              <Link href="#">Virtual Presenter</Link>
              <Link href="#">Multi-Language Avatar</Link>
            </nav>
          </div>

          <div className="absolute left-[755px] top-[666px] w-[162px]">
            <h3 className="font-baskervville text-[15px] font-bold leading-[19px]">Resource</h3>
            <nav className="footer-nav mt-[17px] flex flex-col gap-[1px] text-[13px] leading-[25px] text-[#A3A3A3]">
              <Link href="#">Help Center</Link>
              <Link href="#">API Documentation</Link>
              <Link href="#">Templates</Link>
              <Link href="#">Pricing</Link>
              <Link href="#">Blog</Link>
              <Link href="#">Case Studies</Link>
              <Link href="#">Community</Link>
              <Link href="#">Contact Us</Link>
            </nav>
          </div>

          <div className="absolute left-[1034px] top-[702px] w-[335px] text-right text-[15px] font-normal leading-[18px]">
            A dreamland that fulfills all your imaginations.
          </div>

          <div className="absolute left-[1191px] top-[661px] w-[226px] text-center">
            <div className="font-baskervville text-[20px] font-bold italic leading-[26px]">MINDVERSE</div>
            <div className="absolute left-[88px] top-[83px] grid h-[89px] w-[89px] grid-cols-7 grid-rows-7 gap-[2px] bg-white p-[7px]">
              {Array.from({ length: 49 }, (_, index) => (
                <span key={index} className={(index * 7 + Math.floor(index / 3)) % 5 < 2 ? "bg-black" : "bg-white"} />
              ))}
            </div>
            <div className="absolute left-[7px] top-[198px] flex items-center gap-[18px]">
              <Link href="#" aria-label="TikTok" className="transition-opacity hover:opacity-70">
                <svg aria-hidden="true" className="h-6 w-[21px] invert" viewBox="0 0 21 24" fill="none"><path d="M15.4401 0H11.2968V16.3478C11.2968 18.2957 9.70322 19.8957 7.72007 19.8957C5.73693 19.8957 4.14334 18.2957 4.14334 16.3478C4.14334 14.4348 5.70152 12.8695 7.61385 12.8V8.69567C3.39966 8.7652 0 12.1391 0 16.3478C0 20.5913 3.47049 24 7.7555 24C12.0405 24 15.5109 20.5565 15.5109 16.3478V7.9652C17.0691 9.07827 18.9814 9.73913 21 9.77393V5.66957C17.8837 5.56522 15.4401 3.06087 15.4401 0Z" fill="black" /></svg>
              </Link>
              <Link href="#" aria-label="YouTube" className="transition-opacity hover:opacity-70">
                <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 20 20" fill="none"><rect width="20" height="20" rx="10" fill="white" /><path d="M15.8236 7.13717C15.6864 6.62737 15.2844 6.22541 14.7746 6.08815C13.8432 5.83325 10.1177 5.83325 10.1177 5.83325C10.1177 5.83325 6.39224 5.83325 5.46087 6.07835C4.96087 6.2156 4.5491 6.62737 4.41185 7.13717C4.16675 8.06855 4.16675 9.99992 4.16675 9.99992C4.16675 9.99992 4.16675 11.9411 4.41185 12.8627C4.5491 13.3725 4.95106 13.7744 5.46087 13.9117C6.40204 14.1666 10.1177 14.1666 10.1177 14.1666C10.1177 14.1666 13.8432 14.1666 14.7746 13.9215C15.2844 13.7842 15.6864 13.3823 15.8236 12.8725C16.0687 11.9411 16.0687 10.0097 16.0687 10.0097C16.0687 10.0097 16.0785 8.06855 15.8236 7.13717Z" fill="black" /><path d="M8.9314 11.7842L12.0294 9.99989L8.9314 8.21558V11.7842Z" fill="white" /></svg>
              </Link>
              <Link href="#" aria-label="Instagram" className="transition-opacity hover:opacity-70">
                <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 20 20" fill="none"><path d="M19.944 5.8767C19.8959 4.81185 19.7239 4.08327 19.4799 3.44676C19.2238 2.79023 18.8837 2.22978 18.3276 1.67734C17.7715 1.1249 17.2154 0.776621 16.5593 0.52442C15.9231 0.276221 15.195 0.108086 14.1308 0.060048C13.0626 0.0120096 12.7225 0 10.01 0C7.29342 0 6.95335 0.0120096 5.88914 0.060048C4.82493 0.108086 4.09678 0.280224 3.46065 0.52442C2.80052 0.780625 2.24041 1.1209 1.6883 1.67734C1.13619 2.23379 0.788118 2.79023 0.536068 3.44676C0.292019 4.08327 0.119985 4.81185 0.0719749 5.8767C0.0239653 6.94556 0.0119629 7.28583 0.0119629 10C0.0119629 12.7182 0.0239653 13.0584 0.0719749 14.1233C0.119985 15.1882 0.292019 15.9167 0.536068 16.5532C0.792119 17.2098 1.13219 17.7702 1.6883 18.3227C2.24041 18.8791 2.80052 19.2234 3.45665 19.4756C4.09278 19.7238 4.82093 19.8919 5.88514 19.94C6.95335 19.988 7.29342 20 10.006 20C12.7225 20 13.0626 19.988 14.1268 19.94C15.191 19.8919 15.9191 19.7198 16.5553 19.4756C17.2114 19.2194 17.7715 18.8791 18.3236 18.3227C18.8757 17.7662 19.2238 17.2098 19.4759 16.5532C19.7239 15.9167 19.8919 15.1882 19.94 14.1233C19.988 13.0544 20 12.7142 20 10C20 7.28583 19.992 6.94155 19.944 5.8767ZM18.1476 14.0432C18.1036 15.02 17.9396 15.5524 17.8035 15.9007C17.6235 16.3651 17.4034 16.7014 17.0514 17.0536C16.6993 17.4059 16.3672 17.6181 15.8991 17.8062C15.5471 17.9424 15.015 18.1065 14.0428 18.1505C12.9906 18.1986 12.6745 18.2106 10.002 18.2106C7.32943 18.2106 7.01336 18.1986 5.96115 18.1505C4.98496 18.1065 4.45285 17.9424 4.10478 17.8062C3.64069 17.6261 3.30462 17.4059 2.95255 17.0536C2.60048 16.7014 2.38844 16.3691 2.2004 15.9007C2.06437 15.5484 1.90034 15.016 1.85633 14.0432C1.80832 12.9904 1.79632 12.6741 1.79632 10C1.79632 7.32586 1.80832 7.00961 1.85633 5.95677C1.90034 4.97998 2.06437 4.44756 2.2004 4.09928C2.38044 3.63491 2.60048 3.29864 2.95255 2.94636C3.30462 2.59408 3.63669 2.38191 4.10478 2.19376C4.45685 2.05765 4.98896 1.89352 5.96115 1.84948C7.01336 1.80144 7.32943 1.78943 10.002 1.78943C12.6745 1.78943 12.9906 1.80144 14.0428 1.84948C15.019 1.89352 15.5511 2.05765 15.8991 2.19376C16.3632 2.3739 16.6993 2.59408 17.0514 2.94636C17.4034 3.29864 17.6155 3.63091 17.8035 4.09928C17.9396 4.45156 18.1036 4.98399 18.1476 5.95677C18.1956 7.00961 18.2076 7.32586 18.2076 10C18.2076 12.6741 18.1916 12.9904 18.1476 14.0432Z" fill="white" /><path d="M10.002 4.85986C7.16145 4.85986 4.86499 7.1617 4.86499 9.99998C4.86499 12.8422 7.16545 15.1401 10.002 15.1401C12.8386 15.1401 15.139 12.8342 15.139 9.99998C15.139 7.1577 12.8426 4.85986 10.002 4.85986ZM10.002 13.3346C8.16165 13.3346 6.66935 11.8414 6.66935 9.99998C6.66935 8.1585 8.16165 6.66531 10.002 6.66531C11.8424 6.66531 13.3347 8.1585 13.3347 9.99998C13.3347 11.8414 11.8424 13.3346 10.002 13.3346Z" fill="white" /><path d="M15.3392 5.86066C16.002 5.86066 16.5394 5.32297 16.5394 4.6597C16.5394 3.99643 16.002 3.45874 15.3392 3.45874C14.6763 3.45874 14.1389 3.99643 14.1389 4.6597C14.1389 5.32297 14.6763 5.86066 15.3392 5.86066Z" fill="white" /></svg>
              </Link>
              <Link href="#" aria-label="Facebook" className="transition-opacity hover:opacity-70">
                <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 20 20" fill="none"><rect width="20" height="20" rx="10" fill="white" /><path d="M13.8926 12.8906L14.3359 10H11.5625V8.125C11.5625 7.33398 11.9492 6.5625 13.1914 6.5625H14.4531V4.10156C14.4531 4.10156 13.3086 3.90625 12.2148 3.90625C9.92969 3.90625 8.4375 5.29102 8.4375 7.79688V10H5.89844V12.8906H8.4375V19.8789C8.94727 19.959 9.46875 20 10 20C10.5313 20 11.0527 19.959 11.5625 19.8789V12.8906H13.8926Z" fill="black" /></svg>
              </Link>
              <Link href="#" aria-label="Twitter" className="transition-opacity hover:opacity-70">
                <svg aria-hidden="true" className="h-4 w-[19px]" viewBox="0 0 19 16" fill="none"><path d="M17.0475 3.98396C17.0552 4.15996 17.0552 4.32796 17.0552 4.50396C17.063 9.83998 13.1426 16 5.97319 16C3.85865 16 1.7827 15.368 0 14.184C0.308692 14.224 0.617384 14.24 0.926076 14.24C2.6779 14.24 4.38343 13.632 5.76483 12.504C4.09789 12.472 2.6316 11.344 2.12226 9.69598C2.70877 9.81598 3.31072 9.79198 3.8818 9.62398C2.06824 9.25598 0.764013 7.59997 0.756296 5.67197C0.756296 5.65597 0.756296 5.63997 0.756296 5.62397C1.29651 5.93597 1.90617 6.11197 2.52356 6.12797C0.818034 4.94396 0.28554 2.58396 1.31966 0.735951C3.30301 3.26396 6.22015 4.79196 9.35337 4.95996C9.03696 3.55996 9.46913 2.08796 10.4801 1.09595C12.0467 -0.432053 14.5162 -0.352052 15.998 1.27195C16.87 1.09595 17.7112 0.759951 18.4752 0.28795C18.182 1.22395 17.5723 2.01596 16.762 2.51996C17.5337 2.42396 18.29 2.20796 19 1.88795C18.4752 2.70396 17.8115 3.40796 17.0475 3.98396Z" fill="white" /></svg>
              </Link>
            </div>
          </div>

          <div className="absolute left-[72.5px] top-[1012px] h-px w-[1295px] bg-white/50" />
          <div className="absolute left-[73px] top-[1035px] h-[18px] w-[645px] text-[15px] font-normal leading-[18px]">
            <span className="absolute left-0 top-0 flex items-center gap-[7px]">
              <svg aria-hidden="true" className="h-[10px] w-[10px]" fill="none" viewBox="0 0 10 10"><path d="M5.00003 9.64289C7.56421 9.64289 9.64289 7.56421 9.64289 5.00003C9.64289 2.43586 7.56421 0.357178 5.00003 0.357178C2.43586 0.357178 0.357178 2.43586 0.357178 5.00003C0.357178 7.56421 2.43586 9.64289 5.00003 9.64289Z" stroke="white" strokeLinecap="round" strokeLinejoin="round" /><path d="M5.00007 6.78578C5.98629 6.78578 6.78578 5.98629 6.78578 5.00007C6.78578 4.01385 5.98629 3.21436 5.00007 3.21436C4.01385 3.21436 3.21436 4.01385 3.21436 5.00007C3.21436 5.98629 4.01385 6.78578 5.00007 6.78578Z" stroke="white" strokeLinecap="round" strokeLinejoin="round" /></svg>
              2026 MNDVERSE Ltd.
            </span>
            <span className="absolute left-[187px] top-0 h-[17px] w-px bg-white/50" />
            <Link href="#" className="footer-bottom-link absolute left-[207px] top-0">Terms of Service</Link>
            <svg aria-hidden="true" className="pointer-events-none absolute left-[341px] top-[3px] h-[13px] w-[192px]" fill="none" viewBox="0 0 192 13"><path d="M0.180298 12.6731L12.1803 0.173096" stroke="white" strokeWidth="0.5" /><path d="M179.18 12.6731L191.18 0.173096" stroke="white" strokeWidth="0.5" /></svg>
            <Link href="#" className="footer-bottom-link absolute left-[366px] top-0">Cookie preferences</Link>
            <Link href="#" className="footer-bottom-link absolute left-[545px] top-0">Privacy Policy</Link>
          </div>
          <div className="absolute left-[1265px] top-[1035px] flex items-center gap-3 text-[15px] font-normal leading-[18px]">
            <svg aria-hidden="true" className="h-[21px] w-[21px]" fill="none" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke="currentColor" /><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18" stroke="currentColor" /></svg>
            <button type="button" className="flex items-center gap-2">English<svg aria-hidden="true" className="h-[5px] w-[10px]" fill="none" viewBox="0 0 10 5"><path d="m1 1 4 3 4-3" stroke="currentColor" /></svg></button>
          </div>
        </div>
      </footer>
      </main>

    </div>
  );
}
