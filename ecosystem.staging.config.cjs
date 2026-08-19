module.exports = {
  apps: [
    {
      name: "gpu-erp-api-staging",
      cwd: __dirname,
      script: "server-dist/index.mjs",
      env: {
        NODE_ENV: "staging",
        API_PORT: "3011",
      },
      max_restarts: 5,
      restart_delay: 2000,
    },
  ],
};
