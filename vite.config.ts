import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      devOptions: { enabled: false },
      includeAssets: ["favicon.ico", "apple-touch-icon.png", "push-sw.js"],
      manifest: {
        name: "Contabilidade Alves",
        short_name: "Alves",
        description: "Portal financeiro e fiscal da Contabilidade Alves",
        id: "/",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        lang: "pt-BR",
        background_color: "#101923",
        theme_color: "#101923",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Handlers de push (push/notificationclick) injetados no SW gerado.
        importScripts: ["push-sw.js"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        skipWaiting: true,
        clientsClaim: true,
        navigateFallbackDenylist: [/^\/~oauth/],
        runtimeCaching: [
          {
            // Dado financeiro NUNCA é cacheado — sempre fresco do Supabase.
            urlPattern: ({ url }) => url.hostname.endsWith("supabase.co"),
            handler: "NetworkOnly",
          },
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: { cacheName: "html", networkTimeoutSeconds: 3 },
          },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
  optimizeDeps: {
    include: ["@tanstack/react-query"],
  },
}));
