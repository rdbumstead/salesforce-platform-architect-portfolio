/* eslint-disable */
const { execSync } = require("child_process");
const fs = require("fs");

// The org is required, because the CLI default in the main checkout is the production org.
const orgArg = process.argv.indexOf("--target-org");
const targetOrg = orgArg >= 0 ? process.argv[orgArg + 1] : undefined;
if (!targetOrg) {
  console.error("Name the org: node scripts/validate.js --target-org <alias>");
  process.exit(2);
}

console.log("--- 1. Generating Delta ---");
try {
  // Run the existing delta command defined in package.json
  execSync("npm run delta", { stdio: "inherit" });
} catch (error) {
  console.error("Delta generation failed.");
  process.exit(1);
}

// Check if package.xml exists
const packageXmlPath = "changed/package/package.xml";
if (!fs.existsSync(packageXmlPath)) {
  console.log("No package.xml found. Skipping validation.");
  process.exit(0);
}

// Check if package.xml actually has metadata changes (looks for <types> tag)
const content = fs.readFileSync(packageXmlPath, "utf8");
if (!content.includes("<types>")) {
  console.log("No metadata changes detected. Skipping validation.");
  process.exit(0);
}

// Older sfdx-git-delta releases write their own default API version into the manifest
// instead of the project's, and metadata such as viewAllFields then fails to validate.
const { sourceApiVersion } = JSON.parse(
  fs.readFileSync("sfdx-project.json", "utf8")
);
fs.writeFileSync(
  packageXmlPath,
  content.replace(
    /<version>[^<]*<\/version>/,
    `<version>${sourceApiVersion}</version>`
  )
);

console.log("--- 2. Validating Changes (Dry Run) ---");
try {
  execSync(
    [
      "sf project deploy start --manifest changed/package/package.xml",
      "--target-org",
      targetOrg,
      "--dry-run --test-level RunLocalTests"
    ].join(" "),
    { stdio: "inherit" }
  );
} catch (error) {
  console.error("Validation Failed.");
  process.exit(1);
}
