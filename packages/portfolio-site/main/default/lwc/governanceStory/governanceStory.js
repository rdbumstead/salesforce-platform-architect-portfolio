/**
 * @description       : The static half of the Governance page (Pillar F): why production change
 *                      needs proof, and the six controls in front of it. Each control says what
 *                      it does, what an IT auditor would test and which file, test or decision
 *                      record proves it, and every proof is a link. The page claims no
 *                      certification and says so. The Context and Decision labels follow the
 *                      other story pages. The evidence list that makes the Outcome is the child
 *                      component c:governanceEvidence, and Alternatives considered and Related
 *                      decisions come from c:storyDecisions under the governance story key. The
 *                      copy lives here and is a draft until the owner approves it.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 11/21/2026
 **/
import { LightningElement } from "lwc";
import basePath from "@salesforce/community/basePath";
import { REPO_URL } from "c/footer";

/**
 * The file on the main branch of this repository, as a link target.
 * @param {string} file the path in the repository
 * @returns {string} the address
 */
function blob(file) {
  return `${REPO_URL}/blob/main/${file}`;
}

/**
 * A decision record in the docs viewer.
 * @param {string} number the three digit record number
 * @returns {string} the address
 */
function adr(number) {
  return `${basePath || ""}/docs?doc=adr-${number}`;
}

/**
 * The controls, in the order a change reaches production. Each proof is a link to a file in
 * this repository on GitHub, or to a decision record in the docs viewer.
 */
export const CONTROLS = Object.freeze([
  {
    key: "approval",
    title: "Approval before every production deploy",
    does: "The deploy job waits in a protected GitHub environment named glassops-deploy. The key that signs the permit lives only in that environment, so nothing deploys until I approve the run. The approver's GitHub login is stored with the deploy and shown in the list below.",
    audit:
      "Pick a deploy from the list. Check that its run shows an approval, that the approver is named in the record, and that the run cannot start without one. I am the only person on this project, so this shows a deliberate approval step with a record of it, not a second person.",
    proofs: [
      {
        label: "The deploy workflow",
        href: blob(".github/workflows/deploy.yml")
      },
      {
        label: "The production policy",
        href: blob(".github/glassops/prod.yaml")
      }
    ]
  },
  {
    key: "gate",
    title: "A signed decision from the gate",
    does: "Before a deploy, GlassOps checks the change against the policy and signs a permit or a deny. The deploy step refuses to run without a permit for that exact commit. The checks include a passing validation, test coverage of at least 75 percent and the environment approval.",
    audit:
      "Check that each deploy in the list shows a permit id and that every check on it passed. Then check the drills, where the gate signed a deny and the rule that failed is named.",
    proofs: [
      {
        label: "The production policy",
        href: blob(".github/glassops/prod.yaml")
      },
      {
        label: "Decision record 44, GlassOps makes the production deploy",
        href: adr("044"),
        internal: true
      }
    ]
  },
  {
    key: "parity",
    title: "The public pages show what a visitor could be shown",
    does: "The static pages are built from data a build user reads. Tests run every allowed read as the guest and as the build user and compare the results, so the build cannot publish more than the guest is allowed to see.",
    audit:
      "Ask for the tests that prove access control and look at what they compare. Check that a read the guest cannot make is not on the allowed list.",
    proofs: [
      {
        label: "The export parity test",
        href: blob(
          "packages/portfolio-site/main/default/classes/SiteExportResourceTest.cls"
        )
      },
      {
        label: "The testimonial parity test",
        href: blob(
          "packages/portfolio-site/main/default/classes/SiteExportTestimonialParityTest.cls"
        )
      },
      {
        label: "Decision record 41, the static front end",
        href: adr("041"),
        internal: true
      }
    ]
  },
  {
    key: "leak-scan",
    title: "A scan of the built site for secrets and personal data",
    does: "After each build the leak scan reads every file in the output. It fails the build on a Salesforce session id, a bearer token, an OAuth token field, a private key or an email address that is not on the allowed list.",
    audit:
      "Ask for the scan's rules and for a build log that shows it ran. Check that a failure stops the build and does not only warn.",
    proofs: [
      { label: "The leak scan", href: blob("web/build/leak-scan.mjs") },
      { label: "The site workflow", href: blob(".github/workflows/site.yml") }
    ]
  },
  {
    key: "tokens",
    title: "Audit rows and rate limits on API access",
    does: "A visitor who wants the API asks for a short lived token. Every attempt, allowed or refused, writes one audit row with its outcome. A request is limited to 15 a minute for each email and address, and no more than 50 tokens are issued in a day. The audit rows are private and the guest cannot read them.",
    audit:
      "Ask for the log of access requests, the limits and how access is stopped. Check that a refused attempt leaves a row as well, and that the daily cap can be set to zero to pause issuing.",
    proofs: [
      {
        label: "The token service",
        href: blob(
          "packages/integration-api/main/default/classes/TokenExchangeService.cls"
        )
      },
      {
        label: "Decision record 28, evaluator access",
        href: adr("028"),
        internal: true
      }
    ]
  },
  {
    key: "kill-switches",
    title: "Kill switches for the features that call Salesforce",
    does: "Five features call Salesforce while a visitor waits: the contact form, testimonials, the cover letter, the API Lab and the live readings. Each has a switch set to live or recorded in one file. Setting it to recorded turns the feature off at the next site deploy. A host that is not the production site is always recorded.",
    audit:
      "Ask how a feature is stopped during an incident and who can do it. Check the switch values in the file and the test that fails when one goes missing.",
    proofs: [
      { label: "The switch values", href: blob("web/wrangler.toml") },
      {
        label: "The switch logic",
        href: blob("web/functions/_lib/features.js")
      },
      { label: "The switch test", href: blob("web/test/functions.test.mjs") }
    ]
  }
]);

export default class GovernanceStory extends LightningElement {
  get glassopsHref() {
    return `${basePath || ""}/glassops`;
  }

  get controls() {
    return CONTROLS.map((control) => ({
      ...control,
      headingId: `control-${control.key}`,
      proofs: control.proofs.map((proof, index) => ({
        ...proof,
        key: `${control.key}-proof-${index + 1}`,
        target: proof.internal ? undefined : "_blank",
        rel: proof.internal ? undefined : "noopener noreferrer",
        external: !proof.internal
      }))
    }));
  }
}
