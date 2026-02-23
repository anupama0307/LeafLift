/**
 * LeafLift Ngrok Tunnel Starter
 * ─────────────────────────────
 * Creates public tunnels for the backend (port 5001)
 * and frontend (port 3005), then auto-updates .env
 * so the frontend uses the ngrok backend URL.
 *
 * USAGE:  node start-ngrok.js
 */

import ngrok from '@ngrok/ngrok';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACKEND_PORT = 5001;
const FRONTEND_PORT = 3005;
const ENV_FILE = path.join(__dirname, '.env');
const NGROK_AUTHTOKEN = '39lP4kYx5VsukeEakVJaveZbKr6_4D6cizDH1zMz2JVJsrSMs';

async function main() {
    console.log('🚀 LeafLift Ngrok Tunnel Starter');
    console.log('─'.repeat(40));

    try {
        // Start backend tunnel
        console.log(`\n📡 Starting backend tunnel (port ${BACKEND_PORT})...`);
        const backendListener = await ngrok.forward({
            addr: BACKEND_PORT,
            authtoken: NGROK_AUTHTOKEN,
            proto: 'http',
        });
        const backendUrl = backendListener.url();
        console.log(`✅ Backend tunnel: ${backendUrl}`);

        // Start frontend tunnel
        console.log(`\n🌐 Starting frontend tunnel (port ${FRONTEND_PORT})...`);
        const frontendListener = await ngrok.forward({
            addr: FRONTEND_PORT,
            authtoken: NGROK_AUTHTOKEN,
            proto: 'http',
        });
        const frontendUrl = frontendListener.url();
        console.log(`✅ Frontend tunnel: ${frontendUrl}`);

        // Update .env file with the ngrok backend URL
        let envContent = fs.readFileSync(ENV_FILE, 'utf-8');
        envContent = envContent.replace(
            /VITE_API_BASE_URL=.*/,
            `VITE_API_BASE_URL=${backendUrl}`
        );
        fs.writeFileSync(ENV_FILE, envContent);
        console.log(`\n📝 Updated .env: VITE_API_BASE_URL=${backendUrl}`);

        // Print summary
        console.log('\n' + '═'.repeat(50));
        console.log('🎉 TUNNELS ARE LIVE!');
        console.log('═'.repeat(50));
        console.log(`\n📱 Share this URL with testers on ANY network:`);
        console.log(`   Frontend: ${frontendUrl}`);
        console.log(`   Backend:  ${backendUrl}`);
        console.log(`\n🧪 Driver on phone 1 → open ${frontendUrl}`);
        console.log(`🧪 Rider on phone 2  → open ${frontendUrl}`);
        console.log(`\n⚠️  IMPORTANT: Restart 'npm run dev' now so Vite picks`);
        console.log(`   up the updated .env\n`);
        console.log('Press Ctrl+C to stop tunnels...\n');

        // Keep process alive
        process.stdin.resume();

        // Cleanup on exit
        const cleanup = async () => {
            console.log('\n🛑 Shutting down tunnels...');

            // Restore .env to local IP
            let env = fs.readFileSync(ENV_FILE, 'utf-8');
            env = env.replace(
                /VITE_API_BASE_URL=.*/,
                `VITE_API_BASE_URL=http://10.12.225.177:5001`
            );
            fs.writeFileSync(ENV_FILE, env);
            console.log('📝 Restored .env to local IP');

            await ngrok.disconnect();
            console.log('✅ Tunnels closed. Remember to restart npm run dev!');
            process.exit(0);
        };

        process.on('SIGINT', cleanup);
        process.on('SIGTERM', cleanup);

    } catch (err) {
        console.error('\n❌ Error:', err.message || err);
        process.exit(1);
    }
}

main();
