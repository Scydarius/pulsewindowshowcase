import { StrictMode, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import Home from "../app/page";
import { CliniciansPage, ContactPage, DemoPage, HowItWorksPage, NotFoundPage, ResearchPage, TechnologyPage } from "../app/SecondaryPages";
import "../app/globals.css";

const root = document.getElementById("root");
if (!root) throw new Error("PulseWindow could not find its page root.");

const route = window.location.pathname.replace(/\/$/, "") || "/";
const pages: Record<string, ComponentType> = {
  "/": Home,
  "/how-it-works": HowItWorksPage,
  "/technology": TechnologyPage,
  "/for-clinicians": CliniciansPage,
  "/for-care-teams": CliniciansPage,
  "/research": ResearchPage,
  "/demo": DemoPage,
  "/contact": ContactPage,
};
const Page = pages[route] ?? NotFoundPage;
createRoot(root).render(<StrictMode><Page /></StrictMode>);
