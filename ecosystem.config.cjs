module.exports = {
  apps: [
    {
      name: "deltacore",
      cwd: "apps/backend",
      script: "dist/adapters/http/server.js",
      node_args: "--env-file=../../.env",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
