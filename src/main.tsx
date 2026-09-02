import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Home from "../app/page";
import { CareTeamsPage, ContactPage, HowItWorksPage, NotFoundPage } from "../app/SecondaryPages";
import "../app/globals.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("PulseWindow could not find its page root.");
}

const route = window.location.pathname.replace(/\/$/, "") || "/";
const Page = route === "/"
  ? Home
  : route === "/how-it-works"
    ? HowItWorksPage
    : route === "/for-care-teams"
      ? CareTeamsPage
      : route === "/contact"
        ? ContactPage
        : NotFoundPage;

createRoot(root).render(
  <StrictMode>
    <Page />
  </StrictMode>,
);
