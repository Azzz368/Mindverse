"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ThinkingOrb } from "thinking-orbs";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

const PROMPT_TEXT = "Generate a 10s cartoon-style video of a child playing on a skateboard. |";

const STEPS = [
  "prompt (video prompt words)",
  "script (storyline and custom-style script)",
  "video (generate skateboard video)",
];

const CAPTION_TEXT_STYLE = "1930s rubber hose cartoon style, exaggerated squash and stretch proportions, thick wobbly outlines, flat saturated primary colors, vintage animation cel texture, comedic slapstick energy, bouncy......";
const CAPTION_TEXT_SKATE = "A young boy skateboards on a retro-style track through a city street, gliding along a main road surrounded by vehicles.";
const CAPTION_TEXT_CHASSIS = "Generating at the next intersection, the protagonist in black lies face up on the skateboard, hands behind his head, a relaxed expression on his face. He closes his eyes, preparing to enter the chassis. The......";
const CAPTION_TEXT_BUS = "As he crosses an intersection, a school bus suddenly appears on his right, and the boy skillfully changes his posture to get across.";

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
export function DirectorAgentPanel() {
  const panelRef = useRef<HTMLDivElement>(null);
  const ellipse9Ref = useRef<HTMLDivElement>(null);
  const ellipse10Ref = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const pillTextRef = useRef<HTMLParagraphElement>(null);
  const leftPanelRef = useRef<HTMLDivElement>(null);

  // Frame 5 only: brief / Script / Storyboard / Text (final) column grid.
  const stage1Ref = useRef<HTMLDivElement>(null);

  // Frame 6-8: the single track that carries every pipeline element with one shared translateY.
  const pipelineTrackRef = useRef<HTMLDivElement>(null);
  const bigVideoRef = useRef<HTMLDivElement>(null);
  const vector22Ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: panel,
          start: "top top",
          // Virtual scroll distance the pinned panel consumes while the internal
          // motion1-motion8 timeline plays from progress 0 to 1.
          end: () => "+=" + Math.round(window.innerHeight * 3),
          scrub: 1,
          pin: true,
          // The Hero section above this panel uses transform/filter (mouse-parallax
          // objectPosition tweaks, liquid-glass feDisplacementMap/SVG filters) on
          // ancestor elements. Any transform/filter/perspective ancestor creates a new
          // containing block, which breaks GSAP's default position:fixed pin and lets
          // the page keep scrolling past it. Force GSAP to pin via transform instead,
          // which is unaffected by ancestor transform/filter contexts.
          pinType: "transform",
          anticipatePin: 1,
          invalidateOnRefresh: true,
        },
      });

      tl.addLabel("frame1")
        // Frame 1 -> Frame 2: the prompt text types into the pill.
        .to(pillTextRef.current, { autoAlpha: 1, duration: 1 }, "frame1")
        .addLabel("frame2", "+=0.3")
        // Frame 2 -> Frame 3: pill docks top-right and shrinks; glow expands.
        .to(
          ellipse9Ref.current,
          { width: 954, height: 650, left: 53, top: 69, duration: 1 },
          "frame2",
        )
        .to(
          ellipse10Ref.current,
          {
            width: 325,
            height: 834,
            left: 113,
            top: 435,
            backgroundColor: "rgba(170, 142, 94, 0.35)",
            duration: 1,
          },
          "frame2",
        )
        .to(
          pillRef.current,
          { width: 268, height: 60, left: 705, top: 84, duration: 1 },
          "frame2",
        )
        .to(
          pillTextRef.current,
          { fontSize: 10, width: 214, height: 39, left: 732, top: 99, duration: 1 },
          "frame2",
        )
        .addLabel("frame3", "+=0.3")
        // Frame 3 -> Frame 4: left agent detail panel fades in.
        .to(leftPanelRef.current, { autoAlpha: 1, duration: 1 }, "frame3")
        .addLabel("frame4", "+=0.3")
        // Frame 4 -> Frame 5: the brief/Script/Storyboard/Text node grid fades in.
        .to(stage1Ref.current, { autoAlpha: 1, duration: 1 }, "frame4")
        .addLabel("frame5", "+=0.3")
        // Frame 5 -> Frame 6: crossfade to the Text/Image/Video/Video-merge pipeline stage.
        .to(stage1Ref.current, { autoAlpha: 0, duration: 1 }, "frame5")
        .to(pipelineTrackRef.current, { autoAlpha: 1, duration: 1 }, "frame5")
        .addLabel("frame6", "+=0.3")
        // Frame 6 -> Frame 7: the whole pipeline pans up; a small merged-video node + selection box appear.
        .to(pipelineTrackRef.current, { y: -149, duration: 1 }, "frame6")
        .to(
          bigVideoRef.current,
          { autoAlpha: 1, left: 201, width: 114, height: 73, duration: 1 },
          "frame6",
        )
        .to(vector22Ref.current, { autoAlpha: 1, duration: 1 }, "frame6")
        .addLabel("frame7", "+=0.3")
        // Frame 7 -> Frame 8: pan up further; the merged node grows into the final video preview.
        // (top is expressed in the track's local space: 418 - trackY(-258) = 160px visual, matching Figma.)
        .to(pipelineTrackRef.current, { y: -258, duration: 1 }, "frame7")
        .to(
          bigVideoRef.current,
          { left: 70, top: 418, width: 416, height: 267, duration: 1 },
          "frame7",
        );
    }, panel);

    return () => ctx.revert();
  }, []);

  return (
    <div
      ref={panelRef}
      className="pointer-events-auto absolute left-[calc(50%-527px)] top-[921px] h-[558px] w-[1054px] overflow-hidden rounded-[10px] bg-[#0E0404]"
    >
      {/* Ellipse 9 */}
      <div
        ref={ellipse9Ref}
        className="pointer-events-none absolute"
        style={{
          width: 954,
          height: 391,
          left: 53,
          top: 328,
          background: "rgba(92, 58, 40, 0.2)",
          filter: "blur(150px)",
        }}
      />
      {/* Ellipse 10 */}
      <div
        ref={ellipse10Ref}
        className="pointer-events-none absolute"
        style={{
          width: 161,
          height: 134,
          left: 463,
          top: 246,
          background: "rgba(170, 142, 94, 0.6)",
          filter: "blur(100px)",
          transform: "rotate(90deg)",
        }}
      />

      {/* Prompt pill */}
      <div
        ref={pillRef}
        className="pointer-events-none absolute rounded-[50px]"
        style={{ width: 357, height: 80, left: 348, top: 239, background: "rgba(162, 162, 162, 0.2)" }}
      />
      <p
        ref={pillTextRef}
        className="font-epilogue pointer-events-none absolute font-normal leading-[150%] text-[#C0C0C0] opacity-0"
        style={{ width: 293, height: 48, left: 380, top: 260, fontSize: 14 }}
      >
        {PROMPT_TEXT}
      </p>

      {/* Left agent detail panel (frame 4) */}
      <div ref={leftPanelRef} className="pointer-events-none absolute inset-0 opacity-0">
        <div
          className="absolute h-[224px] w-px bg-[#606060]"
          style={{ left: 651, top: 178 }}
        />
        <div
          className="absolute flex h-[32px] w-[41px] items-center justify-center"
          style={{ left: 662, top: 173 }}
        >
          <ThinkingOrb state="working" size={20} />
        </div>
        <p
          className="font-epilogue absolute font-light leading-[150%] text-white"
          style={{ left: 703, top: 180, width: 110, height: 15, fontSize: 10 }}
        >
          Thinking for 3 seconds
        </p>
        <p
          className="font-epilogue absolute font-light leading-[150%] text-[#8F8F8F]"
          style={{ left: 662, top: 218, width: 109, height: 15, fontSize: 10 }}
        >
          Building storyboard......
        </p>
        <p
          className="font-epilogue absolute font-light leading-[150%] text-[#8F8F8F]"
          style={{ left: 662, top: 233, width: 335, height: 30, fontSize: 10 }}
        >
          3 editable steps prepared. Cost-bearing capabilities require preview approval before execution.
        </p>

        {/* Step markers */}
        {STEPS.map((_, index) => {
          const top = 289 + index * 25;
          return (
            <div key={index}>
              <div
                className="absolute box-border h-[10px] w-[10px] rounded-full border-[0.5px] border-[#616161]"
                style={{ left: 662, top }}
              />
              <div
                className="absolute h-[6px] w-[6px] rounded-full bg-[#616161]"
                style={{ left: 664, top: top + 2 }}
              />
            </div>
          );
        })}
        <p
          className="font-epilogue absolute font-light leading-[250%] text-[#8F8F8F]"
          style={{ left: 683, top: 282, width: 205, height: 75, fontSize: 10 }}
        >
          {STEPS.map((step, index) => (
            <span key={index}>
              {step}
              {index < STEPS.length - 1 && <br />}
            </span>
          ))}
        </p>

        {/* Buttons */}
        <div
          className="absolute rounded-[8px]"
          style={{ left: 662, top: 370, width: 98, height: 33, background: "rgba(18, 8, 2, 0.2)" }}
        />
        <div
          className="absolute rounded-[8px]"
          style={{ left: 775, top: 370, width: 98, height: 33, background: "rgba(18, 8, 2, 0.2)" }}
        />
        <p
          className="font-epilogue absolute font-normal leading-[250%] text-white"
          style={{ left: 674, top: 374, width: 74, height: 25, fontSize: 10 }}
        >
          Custom modify
        </p>
        <p
          className="font-epilogue absolute font-normal leading-[250%] text-white"
          style={{ left: 810, top: 374, width: 27, height: 25, fontSize: 10 }}
        >
          Apply
        </p>
      </div>

      {/* Frame 5: brief / Script / Storyboard / Text node grid (fades in, then crossfades out at frame 6). */}
      <div ref={stage1Ref} className="pointer-events-none absolute inset-0 opacity-0">
        <p className={LABEL_CLASS} style={{ left: 23, top: 163, width: 23, height: 15, fontSize: 10 }}>brief</p>
        <p className={LABEL_CLASS} style={{ left: 166, top: 112, width: 29, height: 15, fontSize: 10 }}>Script</p>
        <p className={LABEL_CLASS} style={{ left: 301, top: 112, width: 55, height: 15, fontSize: 10 }}>Storyboard</p>
        <p className={LABEL_CLASS} style={{ left: 436, top: 112, width: 21, height: 15, fontSize: 10 }}>Text</p>

        <div className={NODE_CARD_CLASS} style={{ left: 23, top: 181, width: 114, height: 73 }} />
        <div className={NODE_CARD_CLASS} style={{ left: 166, top: 130, width: 114, height: 73 }} />
        <div className={NODE_CARD_CLASS} style={{ left: 166, top: 230, width: 114, height: 73 }} />
        <div className={NODE_CARD_CLASS} style={{ left: 301, top: 130, width: 114, height: 73 }} />
        <div className={NODE_CARD_CLASS} style={{ left: 301, top: 230, width: 114, height: 73 }} />
        <div className={NODE_CARD_CLASS} style={{ left: 436, top: 130, width: 114, height: 73 }} />
        <div className={NODE_CARD_CLASS} style={{ left: 436, top: 230, width: 114, height: 73 }} />

        <div className={DASHED_V_CLASS} style={{ left: 140, top: 167, width: 21, height: 51, transform: "matrix(-1, 0, 0, 1, 0, 0)" }} />
        <div className={DASHED_V_CLASS} style={{ left: 140, top: 218, width: 21, height: 51, transform: "rotate(180deg)" }} />
        <div className={DASHED_H_CLASS} style={{ left: 283, top: 167, width: 15.5 }} />
        <div className={DASHED_H_CLASS} style={{ left: 418, top: 167, width: 15.5 }} />
        <div className={DASHED_H_CLASS} style={{ left: 283, top: 269, width: 15.5 }} />
        <div className={DASHED_H_CLASS} style={{ left: 418, top: 269, width: 15.5 }} />

        <p className={CAPTION_CLASS} style={{ left: 448, top: 143, width: 92, height: 47, fontSize: 5 }}>{CAPTION_TEXT_STYLE}</p>
        <p className={CAPTION_CLASS} style={{ left: 312, top: 143, width: 92, height: 47, fontSize: 5 }}>{CAPTION_TEXT_SKATE}</p>
        <p className={CAPTION_CLASS} style={{ left: 448, top: 243, width: 92, height: 47, fontSize: 5 }}>{CAPTION_TEXT_CHASSIS}</p>
        <p className={CAPTION_CLASS} style={{ left: 312, top: 243, width: 92, height: 47, fontSize: 5 }}>{CAPTION_TEXT_BUS}</p>
      </div>

      {/* Frames 6-8: Text / Image / Video / Video-merge pipeline. A single translating track carries
          every element with one shared translateY (validated against the Figma deltas: -149 then -258),
          so only the track itself needs to move between frame 6, frame 7 and frame 8. */}
      <div ref={pipelineTrackRef} className="pointer-events-none absolute inset-0 opacity-0">
        <p className={LABEL_CLASS} style={{ left: -9, top: 112, width: 21, height: 15, fontSize: 10 }}>Text</p>
        <p className={LABEL_CLASS} style={{ left: 108, top: 112, width: 30, height: 15, fontSize: 10 }}>Image</p>
        <p className={LABEL_CLASS} style={{ left: 242, top: 112, width: 28, height: 15, fontSize: 10 }}>Video</p>
        <p className={LABEL_CLASS} style={{ left: 381, top: 164, width: 62, height: 15, fontSize: 10 }}>Video merge</p>

        <div className={NODE_CARD_CLASS} style={{ left: -26, top: 130, width: 114, height: 73 }} />
        <div className={NODE_CARD_CLASS} style={{ left: -26, top: 230, width: 114, height: 73 }} />
        <div className={NODE_THUMB_TOP_CLASS} style={{ left: 108, top: 130, width: 114, height: 73 }} />
        <div className={NODE_THUMB_BOTTOM_CLASS} style={{ left: 108, top: 230, width: 114, height: 73 }} />
        <div className={NODE_THUMB_TOP_CLASS} style={{ left: 242, top: 130, width: 114, height: 73 }} />
        <div className={NODE_THUMB_BOTTOM_CLASS} style={{ left: 242, top: 230, width: 114, height: 73 }} />
        <div className={NODE_CARD_CLASS} style={{ left: 381, top: 182, width: 114, height: 73 }} />

        <div className={DASHED_V_CLASS} style={{ left: 360, top: 166, width: 21, height: 51 }} />
        <div className={DASHED_V_CLASS} style={{ left: 360, top: 217, width: 21, height: 51, transform: "matrix(1, 0, 0, -1, 0, 0)" }} />
        <div className={DASHED_H_CLASS} style={{ left: 225, top: 166, width: 15.5 }} />
        <div className={DASHED_H_CLASS} style={{ left: 90, top: 166, width: 15.5 }} />
        <div className={DASHED_H_CLASS} style={{ left: 225, top: 268, width: 15.5 }} />
        <div className={DASHED_H_CLASS} style={{ left: 90, top: 268, width: 15.5 }} />

        <p className={CAPTION_CLASS} style={{ left: -15, top: 143, width: 92, height: 47, fontSize: 5 }}>{CAPTION_TEXT_STYLE}</p>
        <p className={CAPTION_CLASS} style={{ left: -15, top: 243, width: 92, height: 47, fontSize: 5 }}>{CAPTION_TEXT_CHASSIS}</p>

        {/* Frame 7-8 only: merged-video node (grows into the final preview) and its dashed selection box. */}
        <div
          ref={bigVideoRef}
          className={`${NODE_CARD_CLASS} opacity-0`}
          style={{ left: 201, top: 413, width: 114, height: 73 }}
        />
        <div
          ref={vector22Ref}
          className={`${DASHED_V_CLASS} opacity-0`}
          style={{ left: 257.98, top: 265, width: 178.09, height: 139 }}
        />
      </div>
    </div>
  );
}
