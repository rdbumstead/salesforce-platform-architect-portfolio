const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// Configuration
const SPEC_DIR = path.resolve("packages/integration-api/specs");
const OUTPUT_DIR = path.resolve("docs/api/oas");

const WIDDERSHINS_FLAGS =
  '--search false --language_tabs "javascript:JavaScript" "apex:Apex"';

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const specs = fs
  .readdirSync(SPEC_DIR)
  .filter((file) => file.endsWith(".yaml") || file.endsWith(".yml"));

console.log(
  `Found ${specs.length} API specifications. Generating documentation...`
);

specs.forEach((specFile) => {
  const inputPath = path.join(SPEC_DIR, specFile);
  const fileName = path.parse(specFile).name;
  const outputPath = path.join(OUTPUT_DIR, `${fileName}.md`);

  try {
    console.log(`Processing: ${specFile} -> ${outputPath}`);

    const command = `npx widdershins "${inputPath}" ${WIDDERSHINS_FLAGS} -o "${outputPath}"`;
    execSync(command, { stdio: "inherit" });

    let content = fs.readFileSync(outputPath, "utf8");

    content = content.replace(/^---[\s\S]*?---\s*/, "");

    content = content.replace(/<!--\s*Generator:\s*Widdershins.*?-->\s*/i, "");

    content = content.trimStart();

    fs.writeFileSync(outputPath, content);
  } catch (error) {
    console.error(`Error processing ${specFile}:`, error.message);
    process.exit(1);
  }
});

console.log("Successfully synchronized all API documentation.");
