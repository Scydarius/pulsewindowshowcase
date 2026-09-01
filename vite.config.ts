import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [vinext(), cloudflare({ viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] }, config: { main: "./worker/index.ts", compatibility_flags: ["nodejs_compat"] } })],
  server: { allowedHosts: [".trycloudflare.com", ".loca.lt"] },
});
