import { spawn } from "node:child_process";
const child = spawn(process.execPath, ["dist-server/index.js"], {
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "development",
    APP_MODE: "demo",
    APP_URL: "http://127.0.0.1:3000",
    PORT: "3000",
  },
});
child.on("exit", (code) => process.exit(code || 0));
