import { spawnSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * ios-run.mjs
 *
 * A wrapper for Capacitor iOS deployment that ensures provisioning profiles
 * are updated automatically. This prevents the "TripCast is no longer available"
 * error caused by expired 7-day free developer certificates.
 */

// 1. Load environment variables from .env.capacitor.local
const envFile = join(process.cwd(), '.env.capacitor.local');
if (existsSync(envFile)) {
  const content = readFileSync(envFile, 'utf8');
  content.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?$/);
    if (match) {
      const key = match[1];
      let value = match[2] || '';
      // Remove quotes if present
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
      if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
      if (!process.env[key]) process.env[key] = value;
    }
  });
}

const teamId = process.env.DEVELOPMENT_TEAM;

function run(command, args, options = {}) {
  console.log(`\x1b[36m> ${command} ${args.join(' ')}\x1b[0m`);
  const result = spawnSync(command, args, { stdio: 'inherit', shell: true, ...options });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

console.log('\x1b[32m[TripCast iOS] Starting Build & Sync...\x1b[0m');

// 1. Build and Sync
run('npm', ['run', 'build:cap']);
run('npx', ['cap', 'sync', 'ios']);

console.log('\x1b[32m[TripCast iOS] Building and Deploying to device...\x1b[0m');
console.log('\x1b[33mNote: If this is your first time or your profile expired, ensure your iPhone is connected via USB.\x1b[0m');

// 2. Prepare arguments for Capacitor
const capArgs = ['cap', 'run', 'ios', '--', '-allowProvisioningUpdates'];

if (teamId) {
  console.log(`\x1b[32mUsing Development Team: ${teamId}\x1b[0m`);
  capArgs.push(`DEVELOPMENT_TEAM=${teamId}`);
} else {
  console.log('\x1b[31mWarning: DEVELOPMENT_TEAM not set in .env.capacitor.local\x1b[0m');
  console.log('Build might fail if not already configured in Xcode.');
}

// 3. Execute
run('npx', capArgs);
