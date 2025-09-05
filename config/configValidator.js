require('dotenv').config();
const fs = require('fs');
const path = require('path');

/**
 * Validates environment variables
 * @returns {Object} Validation result with success status and any errors
 */
function validateConfig() {
  const errors = [];
  const warnings = [];

  // Check if .env file exists
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    warnings.push('.env file not found - using system environment variables');
  }

  // Validate required environment variables
  const requiredEnvVars = [
    'BOT_TOKEN',
    'MONGODB_URI'
  ];

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      errors.push(`Missing required environment variable: ${envVar}`);
    }
  }

  // Validate optional but recommended environment variables
  const recommendedEnvVars = [
    { name: 'MP_DISCIPLINE_URI', message: 'MP discipline database will not be available' },
    { name: 'ROWIFI_API_KEY', message: 'RoWifi integration will not work' },
    { name: 'MAIN_SERVER_ID', message: 'Some features may not work properly' },
    { name: 'ADMIN_SERVER_ID', message: 'Admin commands will not load properly' },
    { name: 'LOG_CHANNEL_ID', message: 'Console logging to Discord will not work' },
    { name: 'ROBLOX_GROUP_ID', message: 'Roblox integration will not work' }
  ];

  for (const envVar of recommendedEnvVars) {
    if (!process.env[envVar.name]) {
      warnings.push(`Missing ${envVar.name} - ${envVar.message}`);
    }
  }

  return {
    success: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Loads configuration from environment variables
 * @returns {Object} Configuration object
 */
function loadConfig() {
  const validation = validateConfig();
  
  if (!validation.success) {
    console.error('Configuration validation failed:');
    validation.errors.forEach(error => console.error(`  ❌ ${error}`));
    process.exit(1);
  }

  if (validation.warnings.length > 0) {
    console.warn('Configuration warnings:');
    validation.warnings.forEach(warning => console.warn(`  ⚠️  ${warning}`));
  }

  // Build configuration object from environment variables
  const config = {
    bot: {
      token: process.env.BOT_TOKEN,
      uri: process.env.MONGODB_URI,
      uri1: process.env.MP_DISCIPLINE_URI,
      rowifiApiKey: process.env.ROWIFI_API_KEY
    },
    discord: {
      mainServer: process.env.MAIN_SERVER_ID,
      adminServerId: process.env.ADMIN_SERVER_ID,
      logChannel: process.env.LOG_CHANNEL_ID
    },
    roblox: {
      groupId: process.env.ROBLOX_GROUP_ID
    },
    environment: {
      nodeEnv: process.env.NODE_ENV || 'production',
      enableMetrics: process.env.ENABLE_METRICS === 'true',
      metricsPort: parseInt(process.env.METRICS_PORT) || 3001
    }
  };

  console.log('✅ Configuration loaded successfully from environment variables');
  return config;
}

module.exports = {
  validateConfig,
  loadConfig
};
