module.exports = {
  apps: [
    {
      name: "deltacore",
      cwd: "apps/backend",
      script: "dist/adapters/http/server.js",
      node_args: "--disable-warning=ExperimentalWarning",
      instances: 1,
      exec_mode: "fork",
      watch: false,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
