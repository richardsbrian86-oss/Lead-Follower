import { defineConfig, devices } from "@playwright/test";
import { execSync } from "child_process";

const DOMAIN = process.env.REPLIT_DEV_DOMAIN;
const BASE_URL = DOMAIN ? `https://${DOMAIN}` : "http://localhost:3000";

function systemChromiumPath(): string | undefined {
  try {
    const path = execSync("which chromium", { encoding: "utf8" }).trim();
    return path || undefined;
  } catch {
    return undefined;
  }
}

const chromiumExecutable =
  process.env.CHROMIUM_PATH ??
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ??
  systemChromiumPath();

const launchOptions = chromiumExecutable
  ? {
      executablePath: chromiumExecutable,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    }
  : { args: ["--no-sandbox", "--disable-setuid-sandbox"] };

export default defineConfig({
  testDir: "./tests",
  timeout: 45_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: BASE_URL,
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        browserName: "chromium",
        ignoreHTTPSErrors: true,
        launchOptions,
      },
    },
  ],
});
