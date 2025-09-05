#!/usr/bin/env node

/**
 * Enhanced startup script with better error handling and environment detection
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Load environment variables if .env exists
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  require('dotenv').config({ path: envPath });
}

const { validateConfig } = require('../config/configValidator');

console.log('🚀 Starting IRF Event Logging Bot...');

// Validate configuration before starting
console.log('📋 Validating configuration...');
const validation = validateConfig();

if (!validation.success) {
  console.error('❌ Configuration validation failed:');
  validation.errors.forEach(error => console.error(`   • ${error}`));
  console.error('\n💡 Please check your .env file and try again.');
  process.exit(1);
}

if (validation.warnings.length > 0) {
  console.warn('⚠️  Configuration warnings:');
  validation.warnings.forEach(warning => console.warn(`   • ${warning}`));
}

console.log('✅ Configuration validated successfully');

// Determine if we should use PM2 or direct node execution
const usePM2 = process.argv.includes('--pm2') || process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development';

if (usePM2) {
  console.log('🔄 Starting with PM2...');
  
  // PM2 ecosystem configuration
  const pm2Config = {
    apps: [{
      name: 'irf-event-bot',
      script: path.join(__dirname, '..', 'index.js'),
      instances: 1,
      autorestart: true,
      watch: isDevelopment,
      max_memory_restart: '200M',
      env: {
        NODE_ENV: 'production',
        ...process.env
      },
      error_file: path.join(__dirname, '..', 'logs', 'pm2-error.log'),
      out_file: path.join(__dirname, '..', 'logs', 'pm2-out.log'),
      log_file: path.join(__dirname, '..', 'logs', 'pm2-combined.log'),
      time: true
    }]
  };

  // Write PM2 config
  const configPath = path.join(__dirname, '..', 'ecosystem.config.js');
  fs.writeFileSync(configPath, `module.exports = ${JSON.stringify(pm2Config, null, 2)};`);

  // Start with PM2
  const pm2Process = spawn('pm2', ['start', configPath], {
    stdio: 'inherit',
    shell: true
  });

  pm2Process.on('close', (code) => {
    if (code !== 0) {
      console.error(`❌ PM2 process exited with code ${code}`);
      process.exit(code);
    }
  });

} else {
  console.log('🔄 Starting with Node.js directly...');
  
  const nodeArgs = ['--max-old-space-size=256']; // Limit memory usage
  if (isDevelopment) {
    nodeArgs.push('--inspect');
  }
  
  const botProcess = spawn('node', [...nodeArgs, path.join(__dirname, '..', 'index.js')], {
    stdio: 'inherit',
    env: { ...process.env }
  });

  // Handle process signals
  process.on('SIGINT', () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...');
    botProcess.kill('SIGINT');
  });

  process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
    botProcess.kill('SIGTERM');
  });

  botProcess.on('close', (code) => {
    if (code !== 0) {
      console.error(`❌ Bot process exited with code ${code}`);
      
      // Auto-restart in production
      if (process.env.NODE_ENV === 'production' && !process.argv.includes('--no-restart')) {
        console.log('🔄 Auto-restarting in 5 seconds...');
        setTimeout(() => {
          console.log('🚀 Restarting bot...');
          // Restart this script
          spawn(process.argv[0], process.argv.slice(1), {
            stdio: 'inherit',
            detached: true
          }).unref();
        }, 5000);
      }
    }
    process.exit(code);
  });
}
