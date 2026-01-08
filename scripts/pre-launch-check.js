#!/usr/bin/env node
/* eslint-disable no-console */

const { execSync } = require("child_process");

const checks = [
  { name: "Code Formatting", cmd: "npm run prettier:verify" },
  { name: "Security Scan (PMD)", cmd: "npm run scan" },
  { name: "Delta Package Validation", cmd: "npm run delta:validate" },
  { name: "LWC Unit Tests", cmd: "npm run test:unit" },
  { name: "Apex Test Coverage (90%)", cmd: "npm run sf:coverage" },
  {
    name: "Lighthouse Performance",
    cmd: "npm run test:lighthouse",
    optional: true
  }
];

console.log("🚀 Starting Pre-Launch Check...\n");

for (const check of checks) {
  try {
    console.log(`⏳ Running: ${check.name}`);
    execSync(check.cmd, { stdio: "inherit" });
    console.log(`✅ ${check.name} PASSED\n`);
  } catch {
    if (check.optional) {
      console.log(`⚠️  ${check.name} SKIPPED (optional)\n`);
    } else {
      console.error(`❌ ${check.name} FAILED`);
      process.exit(1);
    }
  }
}

console.log("✅ PRE-LAUNCH CHECK PASSED");
