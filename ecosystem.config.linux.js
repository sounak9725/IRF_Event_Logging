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
        PATH: "/home/suman9725/IRF_Event_Logging/venv/bin:/usr/local/bin:/usr/bin:/bin"
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
