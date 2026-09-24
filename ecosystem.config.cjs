module.exports = {
  apps: [
    {
      name: "deltacore",
      cwd: "apps/backend",
      script: "dist/adapters/http/server.js",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
