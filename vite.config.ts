import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 3001,
    strictPort: true,
    allowedHosts: ["shooter.typing-game.local"],
    hmr: {
      host: "shooter.typing-game.local",
      protocol: "wss",
      clientPort: 443,
    },
  },
});
