"use client";

import { useEffect } from "react";
import { useMiniApp } from "@neynar/react";
import GridGuessr from "./GridGuessr";

export default function App() {
  const { isSDKLoaded, actions } = useMiniApp();

  useEffect(() => {
    if (!isSDKLoaded) return;

    // Signal to the Farcaster host that the frame is ready once the SDK loads
    actions?.ready().catch((error) => {
      console.error("Error signaling Farcaster ready state:", error);
    });
  }, [isSDKLoaded, actions]);

  if (!isSDKLoaded) {
    return (
      <div className="flex items-center justify-center h-screen bg-black">
        <div className="text-center">
          <div className="spinner h-8 w-8 mx-auto mb-4"></div>
          <p className="text-white">Loading SDK...</p>
        </div>
      </div>
    );
  }

  return <GridGuessr />;
}
