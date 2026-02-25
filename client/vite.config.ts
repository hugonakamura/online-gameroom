import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Proxy /socket.io requests to the backend during development.
// In production the server serves the built client at the same origin.
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // bind to 0.0.0.0 so LAN devices (phones, etc.) can connect
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
