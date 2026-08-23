module.exports = {
  apps: [
    {
      name: "gpu-erp-api-staging",
      cwd: __dirname,
      script: "npm",
      args: "run start:api",
      env: {
        NODE_ENV: "staging",
        API_PORT: "3011",
      },
      max_restarts: 5,
      restart_delay: 2000,
    },
  ],
};
