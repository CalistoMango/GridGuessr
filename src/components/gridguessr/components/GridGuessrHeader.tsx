import React from "react";
import { Award, Home } from "lucide-react";

import { APP_URL } from "~/lib/constants";
import { ViewState } from "../types";

// Shared top navigation for the mini-app shell. Keeps logo, home shortcut, and
// quick link to badges consistent across every view.

interface GridGuessrHeaderProps {
  activeView: ViewState;
  onNavigateHome: () => void;
  onNavigateBadges: () => void;
}

const GridGuessrHeader: React.FC<GridGuessrHeaderProps> = ({
  activeView,
  onNavigateHome,
  onNavigateBadges,
}) => {
  return (
    <div className="bg-gradient-to-r from-red-600 to-red-700 px-4 py-5 text-white sm:p-6">
      <div className="flex items-center justify-between">
        <button
          onClick={onNavigateHome}
          className="flex items-center gap-3 rounded-lg px-2 py-1 text-left transition-colors hover:bg-red-700/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${APP_URL}/logo-transparent.png`} alt="GridGuessr Logo" className="h-8" />
          <span>
            <span className="block text-lg font-semibold tracking-widest text-red-100">GridGuessr</span>
            <span className="block text-sm text-red-100/80">Predict. Score. Compete.</span>
          </span>
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={onNavigateHome}
            className={`rounded-lg p-2 transition-all hover:bg-red-600 ${
              activeView === "home" ? "bg-red-700" : ""
            }`}
            aria-label="Home"
          >
            <Home className="h-6 w-6" />
          </button>
          <button
            onClick={onNavigateBadges}
            className={`rounded-lg p-2 transition-all hover:bg-red-600 ${
              activeView === "badges" ? "bg-red-700" : ""
            }`}
            aria-label="Badges"
          >
            <Award className="h-6 w-6" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default GridGuessrHeader;
