import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        {
          name: 'log-saver',
          configureServer(server) {
            server.middlewares.use((req, res, next) => {
              if (req.url === '/api/log' && req.method === 'POST') {
                let body = '';
                req.on('data', chunk => body += chunk);
                req.on('end', () => {
                  try {
                    const logEntry = JSON.parse(body);
                    const logStr = JSON.stringify(logEntry) + '\n';
                    fs.appendFileSync(path.resolve(__dirname, 'app_logs.jsonl'), logStr);
                    res.statusCode = 200;
                    res.end('Log saved');
                  } catch (e) {
                    res.statusCode = 500;
                    res.end('Error saving log');
                  }
                });
              } else {
                next();
              }
            });
          }
        }
      ],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY || ''),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || ''),
        'process.env.OPENROUTER_API_KEY': JSON.stringify(env.OPENROUTER_API_KEY || '')
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
