import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, '..'), '');
  const adminApiTarget = env.ADMIN_API_URL || 'http://localhost:5002';
  const mlApiTarget = env.ML_API_URL || 'http://localhost:8000';

  return {
    server: {
      port: parseInt(env.ADMIN_DEV_PORT || '3006', 10),
      host: '0.0.0.0',
      proxy: {
        '/api/admin': {
          target: adminApiTarget,
          changeOrigin: true,
          secure: false,
        },
        '/api/ml': {
          target: mlApiTarget,
          changeOrigin: true,
          secure: false,
        },
        '/socket.io': {
          target: adminApiTarget,
          changeOrigin: true,
          secure: false,
          ws: true,
        }
      }
    },
    plugins: [react()],
    envDir: path.resolve(__dirname, '..'),
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
