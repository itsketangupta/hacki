module.exports = {
  apps: [
    {
      name: 'hacki',
      script: 'npm',
      args: 'start',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    }
  ]
};
