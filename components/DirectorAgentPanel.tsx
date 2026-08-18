"use client";

import { useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ThinkingOrb } from "thinking-orbs";
import { baskervvilleRegular } from "@/app/fonts";
import type { LandingStrings } from "@/shared/i18n/landing";

// The package creates browser-only visual resources. Do not evaluate it while
// Next.js renders the page on the server; load it after this client component hydrates.
const LiquidGlass = dynamic(() => import("liquid-glass-react"), {
  ssr: false,
  loading: () => <div className="h-full w-full rounded-[42px] bg-white/10 backdrop-blur-[18px]" />,
});

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

const CAPTION_TEXT_STYLE = "1930s rubber hose cartoon style, exaggerated squash and stretch proportions, thick wobbly outlines, flat saturated primary colors, vintage animation cel texture, comedic slapstick energy, bouncy......";
const CAPTION_TEXT_SKATE = "A young boy skateboards on a retro-style track through a city street, gliding along a main road surrounded by vehicles.";
const CAPTION_TEXT_CHASSIS = "Generating at the next intersection, the protagonist in black lies face up on the skateboard, hands behind his head, a relaxed expression on his face. He closes his eyes, preparing to enter the chassis. The......";
const CAPTION_TEXT_BUS = "As he crosses an intersection, a school bus suddenly appears on his right, and the boy skillfully changes his posture to get across.";

// Manual prompt layout controls: edit these values to reposition or resize the
// large prompt bubble/wording, or its compact panel state after motion2.
const PROMPT_PILL_INITIAL = { width: 318, height: 80, left: 368, top: 242 };
const PROMPT_PILL_COMPACT = { width: 268, height: 60, left: 705, top: 84 };
const PROMPT_TEXT_INITIAL = { width: 248, height: 48, left: 410, top: 253, fontSize: 14 };
const PROMPT_TEXT_COMPACT = { width: 214, height: 39, left: 732, top: 99, fontSize: 10 };
// Increase these two values to make the motion4 information reveal consume more scroll.
const DIRECTOR_DETAIL_STAGGER = 2.55;
const DIRECTOR_DETAIL_FADE_DURATION = 0.45;

/** Shared node-card style (Rectangle 40/41/42/43/44/45/46 etc.): black card, thin border, 15px radius. */
const NODE_CARD_CLASS = "absolute box-border rounded-[15px] border-[0.5px] border-[#535353] bg-black";
/** Placeholder fill for nodes whose Figma source used a generated thumbnail (asset not available locally). */
const NODE_THUMB_TOP_CLASS = "absolute box-border rounded-[15px] border-[0.5px] border-[#535353] bg-gradient-to-br from-[#3a2c1f] to-black";
const NODE_THUMB_BOTTOM_CLASS = "absolute box-border rounded-[15px] border-[0.5px] border-[#535353] bg-gradient-to-br from-[#2a1f33] to-black";
const DASHED_V_CLASS = "pointer-events-none absolute border border-dashed border-[#606060]";
const DASHED_H_CLASS = "pointer-events-none absolute border-t border-dashed border-[#606060]";
const LABEL_CLASS = "font-epilogue pointer-events-none absolute font-light leading-[150%] text-white";
const CAPTION_CLASS = "font-epilogue pointer-events-none absolute font-light leading-[150%] text-white";

/**
 * "Rectangle 20" dark showcase panel with a GSAP + ScrollTrigger pin + scrub sequence.
 * The panel is pinned (page scroll locked) for the full length of the internal
 * motion1-motion8 timeline: scrolling forward drives the timeline from progress 0 to 1,
 * and the page only unpins/continues scrolling once the timeline finishes. Scrolling
 * back up reverses the timeline in lockstep and re-unlocks upward scroll once progress
 * returns to 0.
 * Implements Figma frames movtion1 -> motion8:
 *  frame1: empty prompt pill, base background glow.
 *  frame2: prompt text types into the pill.
 *  frame3: pill docks to the top-right and shrinks; background glow expands.
 *  frame4: left agent detail panel (thinking status, steps, buttons) fades in.
 *  frame5: a 4-column storyboard node grid (brief / Script / Storyboard / Text) fades in on the left.
 *  frame6: the grid crossfades into the next pipeline stage (Text / Image / Video / Video merge),
 *          filled thumbnail placeholders appear, and a "Video merge" node appears on the right.
 *  frame7: the whole pipeline pans upward, revealing a small merged-video node + selection box.
 *  frame8: the pipeline pans up further and the merged node grows into the final video preview.
 *
 * Note: motion5-motion8 referenced Figma-exported thumbnail images (e.g. "66131566-....png") that
 * were not provided as local asset files, so those nodes use gradient placeholders instead of <img>.
 */
export function DirectorAgentPanel({ copy }: { copy: LandingStrings }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const backgroundGlowRefs = useRef<Array<HTMLDivElement | null>>([]);
  const pillRef = useRef<HTMLDivElement>(null);
  const pillTextRef = useRef<HTMLParagraphElement>(null);
  const directorTitleRef = useRef<HTMLHeadingElement>(null);
  const directorOrbRef = useRef<HTMLDivElement>(null);
  const directorOrbInnerRef = useRef<HTMLDivElement>(null);
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const thinkingIconRef = useRef<HTMLDivElement>(null);
  const thinkingTextRef = useRef<HTMLParagraphElement>(null);
  const buildingTextRef = useRef<HTMLParagraphElement>(null);
  const detailTextRef = useRef<HTMLParagraphElement>(null);
  const stepRowRefs = useRef<Array<HTMLDivElement | null>>([]);
  const customModifyRef = useRef<HTMLDivElement>(null);
  const applyRef = useRef<HTMLDivElement>(null);

  // Frame 5 only: brief / Script / Storyboard / Text (final) column grid.
  const stage1Ref = useRef<HTMLDivElement>(null);
  const briefStageRef = useRef<HTMLDivElement>(null);
  const scriptStageRef = useRef<HTMLDivElement>(null);
  const storyboardStageRef = useRef<HTMLDivElement>(null);
  const textStageRef = useRef<HTMLDivElement>(null);
  const textContentRef = useRef<HTMLDivElement>(null);

  // Frame 6-8: the single track that carries every pipeline element with one shared translateY.
  const pipelineTrackRef = useRef<HTMLDivElement>(null);
  const imageStageRef = useRef<HTMLDivElement>(null);
  const videoStageRef = useRef<HTMLDivElement>(null);
  const mergeStageRef = useRef<HTMLDivElement>(null);
  const bigVideoRef = useRef<HTMLDivElement>(null);
  const mergedPreviewVideoRef = useRef<HTMLVideoElement>(null);
  const vector22Ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const ctx = gsap.context(() => {
      const glowAnimationConfig = [
        { opacity: 0.05, duration: 7.2, delay: 0 },
        { opacity: 0.18, duration: 5.8, delay: 0.7 },
        { opacity: 0.08, duration: 8.4, delay: 1.4 },
        { opacity: 0.28, duration: 6.6, delay: 0.3 },
        { opacity: 0.12, duration: 9.1, delay: 1.1 },
        { opacity: 0.22, duration: 5.2, delay: 1.8 },
      ];

      backgroundGlowRefs.current.forEach((glow, index) => {
        if (!glow) return;
        gsap.to(glow, {
          ...glowAnimationConfig[index],
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
        });
      });

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: panel,
          // Begin when the panel reaches the exact centre of the viewport. From
          // here through `end`, the panel stays at this camera position while
          // scrolling advances the timeline below.
          start: "center center",
          // Virtual scroll distance the pinned panel consumes while the internal
          // motion1-motion8 timeline plays from progress 0 to 1.
          end: () => "+=" + Math.round(window.innerHeight * 1.25),
          scrub: 1,
          pin: true,
          // Keep a finite spacer in document flow. It is what lets the browser
          // scroll normally during the pinned scene and releases the next
          // section when the timeline reaches its end.
          pinSpacing: true,
          // Use an actual viewport-fixed pin rather than a transform-based pin.
          // Reparenting while pinned prevents any transformed/filter ancestor from
          // becoming the fixed-position containing block, keeping the canvas at a
          // stable screen pixel position throughout the whole scroll scene.
          pinType: "fixed",
          pinReparent: true,
          anticipatePin: 0,
          invalidateOnRefresh: true,
        },
      });

      tl.addLabel("frame1")
        // Motion2 prompt: first row reveals left-to-right, then the second row fades in.
        .to(pillTextRef.current, { autoAlpha: 1, duration: 0.01 }, "frame1")
        .to(
          gsap.utils.toArray<HTMLElement>("[data-prompt-character]", pillTextRef.current),
          { autoAlpha: 1, duration: 0.04, stagger: 0.095 },
          "frame1",
        )
        .addLabel("frame2", "+=0.3")
        // Frame 2 -> Frame 3: pill docks top-right and shrinks; glow expands.
        .to(
          pillRef.current,
          { ...PROMPT_PILL_COMPACT, duration: 1 },
          "frame2",
        )
        .to(
          pillTextRef.current,
          { ...PROMPT_TEXT_COMPACT, duration: 1 },
          "frame2",
        )
        .to(
          directorTitleRef.current,
          { width: 280, height: 22, left: 695, top: 30, fontSize: 17, lineHeight: "22px", duration: 1 },
          "frame2",
        )
        .to(
          directorOrbRef.current,
          { width: 55, height: 43, left: 675, top: 21, duration: 1 },
          "frame2",
        )
        .to(directorOrbInnerRef.current, { scale: 0.3125, duration: 1 }, "frame2")
        .addLabel("frame3", "+=0.3")
        // Frame 3 -> Frame 4: director details reveal in reading/workflow order.
        .to(leftPanelRef.current, { autoAlpha: 1, duration: 0.01 }, "frame3")
        .to([thinkingIconRef.current, thinkingTextRef.current], { autoAlpha: 1, duration: DIRECTOR_DETAIL_FADE_DURATION }, "frame3")
        .to(buildingTextRef.current, { autoAlpha: 1, duration: DIRECTOR_DETAIL_FADE_DURATION }, `frame3+=${DIRECTOR_DETAIL_STAGGER}`)
        .to(detailTextRef.current, { autoAlpha: 1, duration: DIRECTOR_DETAIL_FADE_DURATION }, `frame3+=${DIRECTOR_DETAIL_STAGGER * 2}`)
        .to(stepRowRefs.current[0], { autoAlpha: 1, duration: DIRECTOR_DETAIL_FADE_DURATION }, `frame3+=${DIRECTOR_DETAIL_STAGGER * 3}`)
        .to(stepRowRefs.current[1], { autoAlpha: 1, duration: DIRECTOR_DETAIL_FADE_DURATION }, `frame3+=${DIRECTOR_DETAIL_STAGGER * 4}`)
        .to(stepRowRefs.current[2], { autoAlpha: 1, duration: DIRECTOR_DETAIL_FADE_DURATION }, `frame3+=${DIRECTOR_DETAIL_STAGGER * 5}`)
        .to(customModifyRef.current, { autoAlpha: 1, duration: DIRECTOR_DETAIL_FADE_DURATION }, `frame3+=${DIRECTOR_DETAIL_STAGGER * 6}`)
        .to(applyRef.current, { autoAlpha: 1, duration: DIRECTOR_DETAIL_FADE_DURATION }, `frame3+=${DIRECTOR_DETAIL_STAGGER * 7}`)
        .addLabel("frame4", "+=0.3")
        // Frame 4 -> Frame 5: the four initial workflow columns reveal in order.
        .to(stage1Ref.current, { autoAlpha: 1, duration: 4 }, "frame4")
        .to(briefStageRef.current, { autoAlpha: 1, duration: 1.2 }, "frame4")
        .to(scriptStageRef.current, { autoAlpha: 1, duration: 1.2 }, "frame4+=1.12")
        .to(storyboardStageRef.current, { autoAlpha: 1, duration: 1.2 }, "frame4+=2.24")
        .to(textStageRef.current, { autoAlpha: 1, duration: 1.2 }, "frame4+=3.36")
        .addLabel("frame5", "+=1.2")
        // Frame 5 -> Frame 6: pan all four initial columns left. Text lands at
        // x = -9 (its motion6 clipped position), then the next three nodes reveal.
        .to(stage1Ref.current, { x: -445, duration: 1.92 }, "frame5")
        .to(textStageRef.current, { x: -445, duration: 1.92 }, "frame5")
        .to(textContentRef.current, { x: -17, duration: 1.92 }, "frame5")
        .to(imageStageRef.current, { autoAlpha: 1, duration: 0.64 }, "frame5+=2")
        .to(videoStageRef.current, { autoAlpha: 1, duration: 0.64 }, "frame5+=2.72")
        .to(mergeStageRef.current, { autoAlpha: 1, duration: 0.64 }, "frame5+=3.44")
        .addLabel("frame6", "+=1.2")
        // Frame 6 -> Frame 7: the whole pipeline pans up; a small merged-video node + selection box appear.
        .to(pipelineTrackRef.current, { y: -149, duration: 4 }, "frame6")
        .to(stage1Ref.current, { y: -149, duration: 4 }, "frame6")
        .to(textStageRef.current, { y: -149, duration: 4 }, "frame6")
        .to(
          bigVideoRef.current,
          { autoAlpha: 1, left: 201, width: 114, height: 73, duration: 4 },
          "frame6",
        )
        .to(vector22Ref.current, { autoAlpha: 1, duration: 4 }, "frame6")
        .addLabel("frame7", "+=1.2")
        // Frame 7 -> Frame 8: pan up further; the merged node grows into the final video preview.
        // (top is expressed in the track's local space: 418 - trackY(-258) = 160px visual, matching Figma.)
        .to(pipelineTrackRef.current, { y: -258, duration: 2 }, "frame7")
        .to(stage1Ref.current, { y: -258, duration: 2 }, "frame7")
        .to(textStageRef.current, { y: -258, duration: 2 }, "frame7")
        .to(
          bigVideoRef.current,
          {
            left: 70,
            top: 418,
            width: 416,
            height: 267,
            duration: 2,
            onComplete: () => void mergedPreviewVideoRef.current?.play(),
            onReverseComplete: () => mergedPreviewVideoRef.current?.pause(),
          },
          "frame7",
        );
    }, panel);

    return () => ctx.revert();
  }, []);

  return (
    // Outer wrapper: this is the actual GSAP pin target. `mt-[921px]` reserves its
    // real location in normal document flow (unlike a relative `top` offset), so
    // ScrollTrigger's pin spacer expands the page by the finite animation distance.
    // This produces: normal scroll -> centered pinned scene -> normal scroll.
    <div
      ref={panelRef}
      className="pointer-events-auto relative left-[calc(50%-527px)] mt-[921px] h-[558px] w-[1054px] overflow-hidden rounded-[10px] bg-[#0E0404]"
    >
      {/* Inner wrapper: purely a positioning boundary (inset-0 matches the outer box exactly),
          so every decorative child below keeps its original absolute + top/left pixel values
          completely unchanged. */}
      <div className="pointer-events-none absolute inset-0">
      {/* Motion1 title/orb: both move and reduce to the motion2 Figma coordinates. */}
      <h3
        ref={directorTitleRef}
        className={`${baskervvilleRegular.className} pointer-events-none absolute z-10 text-center font-normal text-white`}
        style={{ width: 420, height: 39, left: 350, top: 36, fontSize: 30, lineHeight: "39px" }}
      >
        {copy.directorTitle}
      </h3>
      <div
        ref={directorOrbRef}
        className="pointer-events-none absolute z-10 flex items-center justify-center"
        style={{ width: 89, height: 70, left: 260, top: 19 }}
      >
        <div ref={directorOrbInnerRef} style={{ transformOrigin: "center" }}>
          <ThinkingOrb state="connecting" size={64} theme="dark" speed={1.15} />
        </div>
      </div>

      {/* New motion1 background: Dark Gradient 08 plus the supplied warm glows. */}
      <div className="pointer-events-none absolute inset-0 bg-black" />
      <div ref={(element) => { backgroundGlowRefs.current[0] = element; }} className="pointer-events-none absolute bg-[rgba(171,71,0,0.46)] blur-[200px]" style={{ width: 546, height: 849, left: 184, top: 262 }} />
      <div ref={(element) => { backgroundGlowRefs.current[1] = element; }} className="pointer-events-none absolute bg-[#FFF4F5] blur-[150px]" style={{ width: 888.58, height: 358.3, left: 156.63, top: 483.27, transform: "rotate(9.05deg)" }} />
      <div ref={(element) => { backgroundGlowRefs.current[2] = element; }} className="pointer-events-none absolute bg-[#FF9900] blur-[150px]" style={{ width: 665, height: 568, left: -302, top: 513 }} />
      <div ref={(element) => { backgroundGlowRefs.current[3] = element; }} className="pointer-events-none absolute bg-[#FFA467] blur-[125px]" style={{ width: 357.98, height: 235.94, left: 850, top: 513, transform: "rotate(27.8deg)" }} />
      <div ref={(element) => { backgroundGlowRefs.current[4] = element; }} className="pointer-events-none absolute bg-[#FFF4F5] blur-[75px]" style={{ width: 572.22, height: 234.78, left: 284.31, top: 653.52, transform: "rotate(-2.2deg)" }} />
      <div ref={(element) => { backgroundGlowRefs.current[5] = element; }} className="pointer-events-none absolute bg-[#AB4700] blur-[150px]" style={{ width: 161.56, height: 538.35, left: -169.05, top: 125.21, transform: "rotate(-24.04deg)" }} />

      {/* Figma-like dither: masks 8-bit browser blur banding without changing the palette. */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full" style={{ mixBlendMode: "soft-light", opacity: 0.1 }} aria-hidden="true">
        <filter id="director-background-dither" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="19" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#director-background-dither)" />
      </svg>
      <svg className="pointer-events-none absolute inset-0 h-full w-full" style={{ mixBlendMode: "overlay", opacity: 0.035 }} aria-hidden="true">
        <filter id="director-background-low-frequency-dither" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feTurbulence type="fractalNoise" baseFrequency="0.17" numOctaves="2" seed="73" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#director-background-low-frequency-dither)" />
      </svg>

      {/* Prompt pill: the animated wrapper is kept separate from LiquidGlass so
          GSAP can move and resize the same glass object in every frame. */}
      <div
        ref={pillRef}
        className="pointer-events-auto absolute isolate overflow-hidden rounded-[42px] border border-white/20 bg-white/[0.06] shadow-[inset_0_1px_3px_rgba(255,255,255,0.28),inset_0_-1px_4px_rgba(0,0,0,0.25)]"
        style={PROMPT_PILL_INITIAL}
      >
        <LiquidGlass
          displacementScale={70}
          blurAmount={0.015}
          saturation={125}
          aberrationIntensity={2}
          elasticity={0.15}
          cornerRadius={42}
          mouseContainer={pillRef}
          mode="polar"
          padding="0"
          className="h-full w-full overflow-hidden"
          style={{ position: "relative", width: "100%", height: "100%" }}
        >
          <span aria-hidden="true" className="block h-full w-full" />
        </LiquidGlass>
      </div>
      <p
        ref={pillTextRef}
        className="font-epilogue pointer-events-none absolute z-10 font-normal leading-[150%] text-[#C0C0C0] opacity-0"
        style={PROMPT_TEXT_INITIAL}
      >
        {copy.promptLines.map((line, lineIndex) => (
          <span key={lineIndex} className="block">
            {Array.from(line).map((character, characterIndex) => (
              <span
                key={`${lineIndex}-${characterIndex}`}
                data-prompt-character
                className="inline-block opacity-0"
                style={{ whiteSpace: "pre" }}
              >
                {character}
              </span>
            ))}
          </span>
        ))}
      </p>

      {/* Left agent detail panel (frame 4) */}
      <div ref={leftPanelRef} className="pointer-events-none absolute inset-0 opacity-0">
        <div
          className="absolute h-[224px] w-px bg-[#606060]"
          style={{ left: 651, top: 178 }}
        />
        <div
          ref={thinkingIconRef}
          className="absolute flex h-[32px] w-[41px] items-center justify-center opacity-0"
          style={{ left: 662, top: 173 }}
        >
          <ThinkingOrb state="working" size={20} />
        </div>
        <p
          ref={thinkingTextRef}
          className="font-epilogue absolute font-light leading-[150%] text-white opacity-0"
          style={{ left: 703, top: 180, width: 110, height: 15, fontSize: 10 }}
        >
          {copy.thinking}
        </p>
        <p
          ref={buildingTextRef}
          className="font-epilogue absolute font-light leading-[150%] text-[#8F8F8F] opacity-0"
          style={{ left: 662, top: 218, width: 109, height: 15, fontSize: 10 }}
        >
          {copy.building}
        </p>
        <p
          ref={detailTextRef}
          className="font-epilogue absolute font-light leading-[150%] text-[#8F8F8F] opacity-0"
          style={{ left: 662, top: 233, width: 335, height: 30, fontSize: 10 }}
        >
          {copy.approval}
        </p>

        {/* Steps */}
        {copy.steps.map((step, index) => {
          const top = 282 + index * 25;
          return (
            <div
              key={index}
              ref={(element) => { stepRowRefs.current[index] = element; }}
              className="absolute h-[25px] w-[226px] opacity-0"
              style={{ left: 662, top }}
            >
              <div
                className="absolute top-[7px] box-border h-[10px] w-[10px] rounded-full border-[0.5px] border-[#616161]"
              />
              <div
                className="absolute left-[2px] top-[9px] h-[6px] w-[6px] rounded-full bg-[#616161]"
              />
              <p
                className="font-epilogue absolute font-light leading-[250%] text-[#8F8F8F]"
                style={{ left: 21, top: 0, width: 205, height: 25, fontSize: 10 }}
              >
                {step}
              </p>
            </div>
          );
        })}

        {/* Buttons */}
        <div
          ref={customModifyRef}
          className="pointer-events-auto absolute z-10 isolate overflow-hidden rounded-[8px] border border-[#B58A5B]/20 bg-[rgba(70,42,20,0.14)] opacity-0 shadow-[inset_0_1px_2px_rgba(255,227,184,0.2),inset_0_-1px_3px_rgba(18,8,2,0.35)]"
          style={{ left: 662, top: 370, width: 98, height: 33 }}
        >
          <LiquidGlass
            displacementScale={24}
            blurAmount={0.12}
            saturation={110}
            aberrationIntensity={1}
            elasticity={0.02}
            cornerRadius={8}
            mouseContainer={customModifyRef}
            mode="standard"
            padding="0"
            className="h-full w-full"
            style={{ position: "relative", width: "100%", height: "100%" }}
          >
            <span aria-hidden="true" className="block h-full w-full" />
          </LiquidGlass>
          <p className="font-epilogue absolute z-10 font-normal leading-[250%] text-white" style={{ left: 12, top: 4, width: 74, height: 25, fontSize: 10 }}>
            {copy.customModify}
          </p>
        </div>
        <div
          ref={applyRef}
          className="pointer-events-auto absolute z-10 isolate overflow-hidden rounded-[8px] border border-[#B58A5B]/20 bg-[rgba(70,42,20,0.14)] opacity-0 shadow-[inset_0_1px_2px_rgba(255,227,184,0.2),inset_0_-1px_3px_rgba(18,8,2,0.35)]"
          style={{ left: 775, top: 370, width: 98, height: 33 }}
        >
          <LiquidGlass
            displacementScale={24}
            blurAmount={0.12}
            saturation={110}
            aberrationIntensity={1}
            elasticity={0.02}
            cornerRadius={8}
            mouseContainer={applyRef}
            mode="standard"
            padding="0"
            className="h-full w-full"
            style={{ position: "relative", width: "100%", height: "100%" }}
          >
            <span aria-hidden="true" className="block h-full w-full" />
          </LiquidGlass>
          <p className="font-epilogue absolute z-10 font-normal leading-[250%] text-white" style={{ left: 35, top: 4, width: 27, height: 25, fontSize: 10 }}>
            {copy.apply}
          </p>
        </div>
      </div>

      {/* Frame 5: columns reveal in workflow order. Frame 6 keeps them on-screen and slides the set left. */}
      <div ref={stage1Ref} className="pointer-events-none absolute inset-0 opacity-0">
        <div ref={briefStageRef} className="absolute inset-0 opacity-0">
          <p className={LABEL_CLASS} style={{ left: 23, top: 163, width: 40, height: 15, fontSize: 10 }}>{copy.brief}</p>
          <div className={NODE_CARD_CLASS} style={{ left: 23, top: 181, width: 114, height: 73 }} />
          <p className={CAPTION_CLASS} style={{ left: 34, top: 193, width: 92, height: 47, fontSize: 5 }}>{copy.briefDescription}</p>
          <svg className="pointer-events-none absolute" style={{ left: 140, top: 167, width: 22, height: 103 }} viewBox="0 0 22 103" fill="none" aria-hidden="true">
            <path d="M21 0.928915C17.046 -0.536425 9.13796 0.782381 9.13796 17.7803C9.13796 39.0278 9.76716 51.4832 0 51.4832" stroke="#606060" strokeDasharray="2 2" />
            <path d="M21 102.037C17.046 103.503 9.13796 102.184 9.13796 85.186C9.13796 63.9385 9.76716 51.4832 0 51.4832" stroke="#606060" strokeDasharray="2 2" />
          </svg>
        </div>

        <div ref={scriptStageRef} className="absolute inset-0 opacity-0">
          <p className={LABEL_CLASS} style={{ left: 166, top: 112, width: 40, height: 15, fontSize: 10 }}>{copy.script}</p>
          <div className={NODE_CARD_CLASS} style={{ left: 166, top: 130, width: 114, height: 73 }} />
          <div className={NODE_CARD_CLASS} style={{ left: 166, top: 230, width: 114, height: 73 }} />
          <p className={CAPTION_CLASS} style={{ left: 177, top: 143, width: 92, height: 47, fontSize: 5 }}>{copy.scriptDescriptions[0]}</p>
          <p className={CAPTION_CLASS} style={{ left: 177, top: 243, width: 92, height: 47, fontSize: 5 }}>{copy.scriptDescriptions[1]}</p>
          <div className={DASHED_H_CLASS} style={{ left: 283, top: 167, width: 15.5 }} />
          <div className={DASHED_H_CLASS} style={{ left: 283, top: 269, width: 15.5 }} />
        </div>

        <div ref={storyboardStageRef} className="absolute inset-0 opacity-0">
          <p className={LABEL_CLASS} style={{ left: 301, top: 112, width: 65, height: 15, fontSize: 10 }}>{copy.storyboard}</p>
          <div className={NODE_CARD_CLASS} style={{ left: 301, top: 130, width: 114, height: 73 }} />
          <div className={NODE_CARD_CLASS} style={{ left: 301, top: 230, width: 114, height: 73 }} />
          <p className={CAPTION_CLASS} style={{ left: 312, top: 143, width: 92, height: 47, fontSize: 5 }}>{CAPTION_TEXT_SKATE}</p>
          <p className={CAPTION_CLASS} style={{ left: 312, top: 243, width: 92, height: 47, fontSize: 5 }}>{CAPTION_TEXT_BUS}</p>
          <div className={DASHED_H_CLASS} style={{ left: 418, top: 167, width: 15.5 }} />
          <div className={DASHED_H_CLASS} style={{ left: 418, top: 269, width: 15.5 }} />
        </div>

      </div>

      {/* Text starts as the fourth motion5 column. Its content gets a 17px
          additional offset during the transition, matching the original motion6
          clipped card position (label -9px; cards -26px). */}
      <div ref={textStageRef} className="pointer-events-none absolute inset-0 opacity-0">
        <p className={LABEL_CLASS} style={{ left: 436, top: 112, width: 40, height: 15, fontSize: 10 }}>{copy.text}</p>
        <div ref={textContentRef} className="absolute inset-0">
          <div className={NODE_CARD_CLASS} style={{ left: 436, top: 130, width: 114, height: 73 }} />
          <div className={NODE_CARD_CLASS} style={{ left: 436, top: 230, width: 114, height: 73 }} />
          <p className={CAPTION_CLASS} style={{ left: 448, top: 143, width: 92, height: 47, fontSize: 5 }}>{CAPTION_TEXT_STYLE}</p>
          <p className={CAPTION_CLASS} style={{ left: 448, top: 243, width: 92, height: 47, fontSize: 5 }}>{CAPTION_TEXT_CHASSIS}</p>
        </div>
      </div>

      {/* Frames 6-8: Image / Video / Video-merge pipeline. A single translating track carries
          every element with one shared translateY (validated against the Figma deltas: -149 then -258),
          so only the track itself needs to move between frame 6, frame 7 and frame 8. */}
      <div ref={pipelineTrackRef} className="pointer-events-none absolute inset-0">
        <div ref={imageStageRef} className="absolute inset-0 opacity-0">
          <p className={LABEL_CLASS} style={{ left: 108, top: 112, width: 40, height: 15, fontSize: 10 }}>{copy.image}</p>
          <div className={`${NODE_THUMB_TOP_CLASS} overflow-hidden`} style={{ left: 108, top: 130, width: 114, height: 73 }}>
            <img src="/website/agent/imagetop.png" alt="Generated top scene" className="h-full w-full object-cover" />
          </div>
          <div className={`${NODE_THUMB_BOTTOM_CLASS} overflow-hidden`} style={{ left: 108, top: 230, width: 114, height: 73 }}>
            <img src="/website/agent/imagedown.png" alt="Generated bottom scene" className="h-full w-full object-cover" />
          </div>
          <div className={DASHED_H_CLASS} style={{ left: 90, top: 166, width: 15.5 }} />
          <div className={DASHED_H_CLASS} style={{ left: 90, top: 268, width: 15.5 }} />
        </div>

        <div ref={videoStageRef} className="absolute inset-0 opacity-0">
          <p className={LABEL_CLASS} style={{ left: 242, top: 112, width: 40, height: 15, fontSize: 10 }}>{copy.video}</p>
          <div className={`${NODE_THUMB_TOP_CLASS} overflow-hidden`} style={{ left: 242, top: 130, width: 114, height: 73 }}>
            <video src="/website/agent/videotop.mp4" muted playsInline preload="auto" className="h-full w-full scale-105 object-cover blur-[2px]" />
          </div>
          <div className={`${NODE_THUMB_BOTTOM_CLASS} overflow-hidden`} style={{ left: 242, top: 230, width: 114, height: 73 }}>
            <video src="/website/agent/videodown.mp4" muted playsInline preload="auto" className="h-full w-full scale-105 object-cover blur-[2px]" />
          </div>
          <div className={DASHED_H_CLASS} style={{ left: 225, top: 166, width: 15.5 }} />
          <div className={DASHED_H_CLASS} style={{ left: 225, top: 268, width: 15.5 }} />
        </div>

        <div ref={mergeStageRef} className="absolute inset-0 opacity-0">
          <p className={LABEL_CLASS} style={{ left: 381, top: 164, width: 70, height: 15, fontSize: 10 }}>{copy.videoMerge}</p>
          <div className={`${NODE_CARD_CLASS} overflow-hidden`} style={{ left: 381, top: 182, width: 114, height: 73 }}>
            <video src="/website/agent/full1.mp4" muted playsInline preload="auto" className="h-full w-full object-cover" />
          </div>
          <svg className="pointer-events-none absolute" style={{ left: 360, top: 166, width: 22, height: 103, transform: "scaleX(-1)", transformOrigin: "center" }} viewBox="0 0 22 103" fill="none" aria-hidden="true">
            <path d="M21 0.928915C17.046 -0.536425 9.13796 0.782381 9.13796 17.7803C9.13796 39.0278 9.76716 51.4832 0 51.4832" stroke="#606060" strokeDasharray="2 2" />
            <path d="M21 102.037C17.046 103.503 9.13796 102.184 9.13796 85.186C9.13796 63.9385 9.76716 51.4832 0 51.4832" stroke="#606060" strokeDasharray="2 2" />
          </svg>
        </div>

        {/* Frame 7-8 only: merged-video node (grows into the final preview) and its dashed selection box. */}
        <div
          ref={bigVideoRef}
          className={`${NODE_CARD_CLASS} overflow-hidden opacity-0`}
          style={{ left: 201, top: 413, width: 114, height: 73 }}
        >
          <video
            ref={mergedPreviewVideoRef}
            src="/website/agent/full1.mp4"
            muted
            playsInline
            preload="auto"
            className="h-full w-full object-cover"
          />
        </div>
        <svg
          ref={vector22Ref}
          className="pointer-events-none absolute opacity-0"
          style={{ left: 257.98, top: 265, width: 180, height: 139 }}
          viewBox="0 0 180 139"
          fill="none"
          aria-hidden="true"
        >
          <path d="M178.594 0.00317383L178.5 14.4757C178.5 55.6423 173.925 71.9757 141.925 71.9757C102.725 71.9757 48.6667 71.9757 32 71.9757C11.9253 71.9757 0.5 77.1757 0.5 113.976C0.5 130.003 0.5 120.515 0.5 139.003" stroke="#606060" strokeDasharray="2 2" />
        </svg>
      </div>
      </div>
    </div>
  );
}
