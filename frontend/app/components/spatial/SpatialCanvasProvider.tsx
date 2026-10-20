"use client";

import React, { createContext, useContext, useRef, ReactNode, useState, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { View, PerformanceMonitor } from "@react-three/drei";
import { useQualityTier, useTierCapabilities, stepDownQualityTier } from "../../hooks/useQualityTier";

interface SpatialCanvasContextValue {
  containerRef: React.RefObject<HTMLDivElement>;
  isReady: boolean;
}

const SpatialCanvasContext = createContext<SpatialCanvasContextValue | null>(null);

export function useSpatialCanvas() {
  const ctx = useContext(SpatialCanvasContext);
  if (!ctx) {
    throw new Error("useSpatialCanvas must be used within a SpatialCanvasProvider");
  }
  return ctx;
}

export function SpatialCanvasProvider({ children }: { children: ReactNode }) {
  const containerRef = useRef<HTMLDivElement>(null!);
  const [isReady, setIsReady] = useState(false);
  const tier = useQualityTier();
  const caps = useTierCapabilities();

  useEffect(() => {
    setIsReady(true);
  }, []);

  return (
    <SpatialCanvasContext.Provider value={{ containerRef, isReady }}>
      <div
        ref={containerRef}
        style={{
          position: "relative",
          width: "100%",
          minHeight: "100%",
        }}
      >
        {children}

        {/* Global Shared WebGL Canvas: only mounted if tier !== 'none' and client is ready */}
        {isReady && caps.render3D && (
          <Canvas
            eventSource={containerRef}
            dpr={[1, caps.dpr]}
            frameloop="always"
            gl={{
              powerPreference: "high-performance",
              antialias: tier !== "low",
              alpha: true,
              stencil: false,
              depth: true,
            }}
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              width: "100vw",
              height: "100vh",
              pointerEvents: "none",
              zIndex: 20,
            }}
          >
            {/* Live dynamic downscaling monitor: only steps down, never up */}
            <PerformanceMonitor
              onDecline={() => {
                stepDownQualityTier();
              }}
            />
            <View.Port />
          </Canvas>
        )}
      </div>
    </SpatialCanvasContext.Provider>
  );
}

/**
 * Re-export View from drei for convenience
 */
export { View as SpatialView };
