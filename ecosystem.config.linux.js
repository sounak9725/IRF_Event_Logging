require('dotenv').config();

module.exports = {
  apps: [
    {
      name: "irf-event-bot",
      script: "./index.js",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "200M",
      cwd: "/home/suman9725/IRF_Event_Logging",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        PATH: "/home/suman9725/IRF_Event_Logging/venv/bin:/usr/local/bin:/usr/bin:/bin",
        BOT_TOKEN: process.env.BOT_TOKEN,
        ROWIFI_API_KEY: process.env.ROWIFI_API_KEY,
        MONGODB_URI: process.env.MONGODB_URI,
        MP_DISCIPLINE_URI: process.env.MP_DISCIPLINE_URI,
        MAIN_SERVER_ID: process.env.MAIN_SERVER_ID,
        ADMIN_SERVER_ID: process.env.ADMIN_SERVER_ID,
        LOG_CHANNEL_ID: process.env.LOG_CHANNEL_ID,
        ENABLE_METRICS: process.env.ENABLE_METRICS || "false",
        METRICS_PORT: process.env.METRICS_PORT || "3001"
      },
      error_file: "./logs/pm2-error.log",
      out_file: "./logs/pm2-out.log",
      log_file: "./logs/pm2-combined.log",
      time: true,
      merge_logs: true,
      log_date_format: "YYYY-MM-DD HH:mm:ss Z"
    }
  ]
};
