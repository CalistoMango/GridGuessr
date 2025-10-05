"use client";

import dynamic from "next/dynamic";

const AppComponent = dynamic(() => import("~/components/App"), {
  ssr: false,
});

export default function App() {
  return <AppComponent />;
}