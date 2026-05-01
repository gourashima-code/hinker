import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import LinkHire from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <LinkHire />
  </StrictMode>
);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
