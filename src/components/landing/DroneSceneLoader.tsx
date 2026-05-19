"use client";

import dynamic from "next/dynamic";

export const DroneSceneLoader = dynamic(
  () => import("./DroneScene").then(m => m.DroneScene),
  { ssr: false }
);
