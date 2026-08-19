module.exports = {
  apps: [
    {
      name: "gpu-erp-api",
      cwd: "/home/ubuntu/gpu-erp",
      script: "npm",
      args: "run start:api",
      env: {
        NODE_ENV: "production",
        API_PORT: "3001",
      },
      max_restarts: 10,
      restart_delay: 3000,
    },
  ],
};
