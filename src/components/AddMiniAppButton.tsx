"use client";

import { useCallback, useEffect, useState } from "react";
import sdk from "@farcaster/miniapp-sdk";
import { PlusCircle } from "lucide-react";

export default function AddMiniAppButton() {
  const [isInstalled, setIsInstalled] = useState<boolean | null>(null);
  const [isOpeningDialog, setIsOpeningDialog] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    const bootstrap = async () => {
      try {
        const context = await sdk.context;
        if (!isCancelled) {
          setIsInstalled(context?.client?.added ?? false);
        }
      } catch (error) {
        console.warn("Unable to determine Farcaster mini app install status:", error);
        if (!isCancelled) {
          setIsInstalled(false);
        }
      }
    };

    const handleInstalled = () => setIsInstalled(true);
    const handleRemoved = () => setIsInstalled(false);

    bootstrap();
    sdk.on("miniAppAdded", handleInstalled);
    sdk.on("miniAppRemoved", handleRemoved);

    return () => {
      isCancelled = true;
      sdk.off("miniAppAdded", handleInstalled);
      sdk.off("miniAppRemoved", handleRemoved);
    };
  }, []);

  const handleAddMiniApp = useCallback(async () => {
    try {
      setIsOpeningDialog(true);
      await sdk.actions.addMiniApp();
    } catch (error) {
      console.error("Failed to open Add Mini App dialog:", error);
    } finally {
      setIsOpeningDialog(false);
    }
  }, []);

  if (isInstalled !== false) {
    return null;
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={handleAddMiniApp}
        disabled={isOpeningDialog}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 py-2 text-base font-semibold text-white shadow-sm transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-70"
      >
        <PlusCircle className="h-5 w-5" />
        {isOpeningDialog ? "Opening…" : "Add GridGuessr Mini App"}
      </button>
    </div>
  );
}
