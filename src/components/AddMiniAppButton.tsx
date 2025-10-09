"use client";

import { useCallback, useState } from "react";
import { useMiniApp } from "@neynar/react";
import { PlusCircle } from "lucide-react";

export default function AddMiniAppButton() {
  const { isSDKLoaded, added, actions } = useMiniApp();
  const [isOpeningDialog, setIsOpeningDialog] = useState(false);

  const handleAddMiniApp = useCallback(async () => {
    if (!isSDKLoaded || !actions?.addMiniApp) {
      return;
    }

    try {
      setIsOpeningDialog(true);
      const result = await actions.addMiniApp();
      if (result?.notificationDetails) {
        console.info("Mini app notification token:", result.notificationDetails.token);
      }
    } catch (error) {
      console.error("Failed to open Add Mini App dialog:", error);
    } finally {
      setIsOpeningDialog(false);
    }
  }, [actions, isSDKLoaded]);

  if (!isSDKLoaded || added) {
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
