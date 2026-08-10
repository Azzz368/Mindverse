"use client";

import * as THREE from "three";
import { Suspense, useEffect, useMemo, useState, type ReactNode, type RefObject } from "react";
import { Canvas, createPortal, useFrame, useThree } from "@react-three/fiber";
import {
  MeshTransmissionMaterial,
  RoundedBox,
  useFBO,
  useTexture,
} from "@react-three/drei";

type HeroStage = "render" | "video";
type HeroVideo = "cowboy" | "metropolis";

const HERO_HEIGHT = 816;
const DESIGN_WIDTH = 1440;
const LENS_LEFT = 508.5;
const LENS_TOP = 335;
const LENS_WIDTH = 423;
const LENS_HEIGHT = 134;
const OUTER_RING_HORIZONTAL_INSET = -12;
const COWBOY_VIDEO_ZOOM = 1.06;
const DOG_VIDEO_ZOOM = 1.15;

function getMediaSize(texture: THREE.Texture) {
  const image = texture.image as HTMLImageElement | HTMLVideoElement | undefined;
  if (!image) return null;

  const width = "videoWidth" in image ? image.videoWidth : image.naturalWidth || image.width;
  const height = "videoHeight" in image ? image.videoHeight : image.naturalHeight || image.height;
  return width && height ? { width, height } : null;
}

/** Match the exact source pixels visible behind the fixed capsule under CSS object-cover. */
function cropTextureToLens(
  texture: THREE.Texture,
  viewPan = { x: 0, y: 0 },
  videoZoom = 1,
) {
  const media = getMediaSize(texture);
  if (!media || typeof window === "undefined") return;

  const screenWidth = window.innerWidth;
  const layoutWidth = Math.min(screenWidth, DESIGN_WIDTH);
  const lensScreenLeft = Math.max((screenWidth - layoutWidth) / 2, 0) + LENS_LEFT;
  const coverScale = Math.max(screenWidth / media.width, HERO_HEIGHT / media.height) * videoZoom;
  const renderedWidth = media.width * coverScale;
  const renderedHeight = media.height * coverScale;
  const croppedLeft = (renderedWidth - screenWidth) * (0.5 + viewPan.x * 0.24);
  const croppedTop = (renderedHeight - HERO_HEIGHT) * (0.5 + viewPan.y * 0.1);

  const sourceLeft = (croppedLeft + lensScreenLeft) / coverScale;
  const sourceTop = (croppedTop + LENS_TOP) / coverScale;
  const sourceWidth = LENS_WIDTH / coverScale;
  const sourceHeight = LENS_HEIGHT / coverScale;

  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.repeat.set(sourceWidth / media.width, sourceHeight / media.height);
  texture.offset.set(
    sourceLeft / media.width,
    1 - (sourceTop + sourceHeight) / media.height,
  );
  texture.needsUpdate = true;
}

function HeroBackdrop({
  stage,
  activeVideo,
  cowboyVideo,
  metropolisVideo,
  heroPanRef,
}: {
  stage: HeroStage;
  activeVideo: HeroVideo;
  cowboyVideo: HTMLVideoElement | null;
  metropolisVideo: HTMLVideoElement | null;
  heroPanRef: RefObject<{ x: number; y: number }>;
}) {
  const { width, height } = useThree((state) => state.viewport);
  const render = useTexture("/website/2.png");
  const cowboyTexture = useMemo(
    () => (cowboyVideo ? new THREE.VideoTexture(cowboyVideo) : null),
    [cowboyVideo],
  );
  const metropolisTexture = useMemo(
    () => (metropolisVideo ? new THREE.VideoTexture(metropolisVideo) : null),
    [metropolisVideo],
  );

  useEffect(
    () => () => {
      cowboyTexture?.dispose();
      metropolisTexture?.dispose();
    },
    [cowboyTexture, metropolisTexture],
  );

  const texture =
    stage === "render"
      ? render
      : activeVideo === "cowboy"
        ? cowboyTexture ?? render
        : metropolisTexture ?? render;

  useFrame(() => {
    if (texture) {
      cropTextureToLens(
        texture,
        stage === "video" ? heroPanRef.current : { x: 0, y: 0 },
        stage === "video"
          ? activeVideo === "cowboy"
            ? COWBOY_VIDEO_ZOOM
            : DOG_VIDEO_ZOOM
          : 1,
      );
    }
  });

  return (
    <mesh scale={[width, height, 1]}>
      <planeGeometry />
      <meshBasicMaterial map={texture} color={texture ? "white" : "black"} toneMapped={false} />
    </mesh>
  );
}

/**
 * Direct adaptation of PMNDRS scrollcontrols-and-lens-refraction's Lens:
 * a private scene is rendered to an FBO, then the exact GLTF lens refracts it.
 * Pointer tracking is intentionally removed; the lens stays fixed at center.
 */
function Lens({ children }: { children: ReactNode }) {
  const buffer = useFBO();
  const state = useThree();
  const viewport = state.viewport;
  const lensViewport = viewport.getCurrentViewport(state.camera, [0, 0, 15]);
  const [scene] = useState(() => new THREE.Scene());

  useFrame((state) => {
    state.gl.setRenderTarget(buffer);
    state.gl.setClearColor("#000000", 0);
    state.gl.render(scene, state.camera);
    state.gl.setRenderTarget(null);
  });

  return (
    <>
      {createPortal(children, scene)}
      <mesh scale={[viewport.width, viewport.height, 1]}>
        <planeGeometry />
        <meshBasicMaterial map={buffer.texture} toneMapped={false} />
      </mesh>
      <RoundedBox
        args={[
          lensViewport.width * (0.98 - (OUTER_RING_HORIZONTAL_INSET * 2) / LENS_WIDTH),
          lensViewport.height * 0.98,
          0.12,
        ]}
        radius={lensViewport.height * 0.49}
        smoothness={12}
        position={[0, 0, 15]}
      >
        <MeshTransmissionMaterial
          buffer={buffer.texture}
          ior={1.2}
          thickness={1.5}
          anisotropy={0.1}
          chromaticAberration={0.04}
        />
      </RoundedBox>
    </>
  );
}

export function LensRefraction({
  stage,
  activeVideo,
  cowboyVideo,
  metropolisVideo,
  heroPanRef,
}: {
  stage: HeroStage;
  activeVideo: HeroVideo;
  cowboyVideo: HTMLVideoElement | null;
  metropolisVideo: HTMLVideoElement | null;
  heroPanRef: RefObject<{ x: number; y: number }>;
}) {
  return (
    <Canvas
      className="h-full w-full"
      dpr={[1, 1.5]}
      gl={{ alpha: true, antialias: true }}
      camera={{ position: [0, 0, 20], fov: 15 }}
      onCreated={({ gl }) => gl.setClearColor("#000000", 0)}
    >
      <Suspense fallback={null}>
        <Lens>
          <HeroBackdrop
            stage={stage}
            activeVideo={activeVideo}
            cowboyVideo={cowboyVideo}
            metropolisVideo={metropolisVideo}
            heroPanRef={heroPanRef}
          />
        </Lens>
      </Suspense>
    </Canvas>
  );
}
