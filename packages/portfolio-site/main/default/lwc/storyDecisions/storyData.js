/**
 * @description       : The Related decisions and Alternatives considered for each story page, one
 *                      entry per story key. A service module with no template, read by
 *                      c/storyDecisions. Every related entry names a record in docs/adr. An entry
 *                      with onDocs true opens in the docs viewer at /docs?doc=adr-NNN, which
 *                      works only for the decision records that have a Source_File record, and
 *                      any other entry carries its file name and opens on GitHub. Each
 *                      alternative is a one line option and a short reason. The text is the
 *                      owner's to edit before release.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 11/20/2026
 **/

const SCHEMA = {
  adr: "029",
  title:
    "Schema Visualizer Scope, Discovery and Caching Without Platform Cache",
  note: "How the data model on this page is found in the org at each build, so the diagram cannot drift from it.",
  onDocs: true
};

const MOBILE_SVG = {
  adr: "020",
  title: "Mobile Performance: Static SVG Fallback Strategy",
  note: "Why a phone sees the list of objects and relationships first, and the graph engine never loads there.",
  onDocs: true
};

const GRAPHQL = {
  adr: "021",
  title: "Native GraphQL (Door 1) vs. Apex REST for UI",
  note: "How the gallery of process maps and dashboards reads its project records.",
  onDocs: true
};

const MATRIX = {
  adr: "030",
  title: "Decision Matrix as Custom Metadata",
  note: "How the matrix on this page stores its options, criteria and scores, and why the totals are worked out in the browser.",
  onDocs: true
};

const JIRA = {
  adr: "008",
  title: "Jira Integration vs. Agile Accelerator",
  note: "Why the roadmap on the Delivery page reads Jira directly.",
  onDocs: false,
  file: "008-jira-integration-vs-agile-accelerator.md"
};

const GITHUB_CACHE = {
  adr: "007",
  title: "GitHub API Server-Side Caching",
  note: "How the recent commits and the roadmap are cached and kept fresh.",
  onDocs: true
};

const GOVERNANCE = {
  adr: "019",
  title: "Executable Governance: Platform Events for Documentation Logic",
  note: "Why the checklist on this page reacts to the pipeline's own events.",
  onDocs: true
};

const JWT = {
  adr: "006",
  title: "JWT Bearer Flow for CI/CD",
  note: "How GitHub Actions signs in to the org to deploy, with no login prompt and no password to rotate.",
  onDocs: false,
  file: "006-jwt-bearer-flow-for-ci-cd.md"
};

const GLASSOPS = {
  adr: "044",
  title: "GlassOps Makes the Production Deploy",
  note: "Why a merge to main waits for my approval, and how GlassOps records that the change was allowed.",
  onDocs: false,
  file: "044-glassops-makes-the-production-deploy.md"
};

const STATIC_FRONT_END = {
  adr: "041",
  title: "Headless Static Front End on Cloudflare Pages",
  note: "Why the public pages moved off Experience Cloud to static pages, with Salesforce still the system of record.",
  onDocs: false,
  file: "041-headless-static-front-end-on-cloudflare-pages.md"
};

export const STORIES = Object.freeze({
  "business-architecture": {
    related: [SCHEMA, MOBILE_SVG, GRAPHQL],
    alternatives: [
      {
        option: "Route by the service the partner asks for.",
        why: "It is the usual answer when each department owns a service. Here the departments offer much the same services, a job posting, a career event or training, each to the employers in its own industries. Each team owns every relationship with the employers in its industries, so the case records the service and the industry decides the queue."
      },
      {
        option: "Build one custom partner request object in place of Case.",
        why: "A single object would be simple to explain. It would lose the queues, assignment rules, email handling and service tools that Case already gives, so I kept Case."
      },
      {
        option: "Keep money requests on the case to the end.",
        why: "One record for every request would be simpler. It would lose opportunity stages, pipeline reporting and contract creation, and leadership had no shared investment numbers, which live naturally in the pipeline."
      }
    ]
  },
  "nonprofit-solutions": {
    related: [MATRIX],
    alternatives: [
      {
        option: "Choose Education Cloud.",
        why: "It has standard assessment and employment objects, but its academic model is built for credit bearing study and is heavier than adult literacy cohorts. It needs a paid licence that Power of Us does not cover and has no volunteer objects, so it scored 152 of 330."
      },
      {
        option: "Choose Nonprofit Cloud.",
        why: "It has native programs, volunteers and outcome management, and it is where Salesforce is investing. Person Accounts, its setup prerequisites and a newer product leave more to keep running when nobody on staff looks after Salesforce, so it scored 260 against 268."
      }
    ]
  },
  delivery: {
    related: [JIRA, GITHUB_CACHE, GOVERNANCE, JWT, GLASSOPS, STATIC_FRONT_END],
    alternatives: [
      {
        option: "Stay on the Experience Cloud site.",
        why: "It was the least change, and the Salesforce site kept working. It left the licensing question open and held mobile LCP at 6.5 to 8.3 s, and every change I measured moved it by less than the run to run spread."
      },
      {
        option:
          "Switch on server side rendering for the Experience Cloud site.",
        why: "Salesforce offered it as the Experience Delivery beta, which would have kept everything in one place. That beta is discontinued as of Winter '27, so there was no mode to switch on, and it would have kept the site inside the Developer Edition org."
      },
      {
        option: "Rewrite the front end in React, Astro or similar.",
        why: "A rewrite would have been the cleaner road to a fast static site. It would give two copies of every component, and the View source tab, the tests and the docs would describe code that no longer runs."
      },
      {
        option: "Prerender every page at build time.",
        why: "It would let a crawler or a link preview read every section, and I built it. It raised mobile LCP by 541 to 876 ms across the six audited routes, over my limit of 200 ms, so it stays switched off."
      }
    ]
  },
  glassops: {
    related: [GLASSOPS, JWT],
    alternatives: [
      {
        option: "Keep the pipeline I already had.",
        why: "Workflow steps calling the Salesforce CLI worked. But every rule was hand built in a workflow file, tied to one CI system and mine alone to maintain."
      },
      {
        option: "Buy a commercial Salesforce DevOps platform.",
        why: "These platforms are stronger than GlassOps at deployment intelligence, data deployments and release orchestration, and they are the right call for many teams. I wanted the policy to be mine, in the open and independent of whatever runs the deploy, in a plan, check and apply model, and I did not find a Salesforce tool that works that way."
      },
      {
        option: "Adopt an existing open source Salesforce CI toolkit.",
        why: "It automates deployment well but has no governance layer. I kept my own so the policy decision and the deploy run in one tool with nothing else to install."
      },
      {
        option: "Keep the first version.",
        why: "It began as a GitHub Action written in TypeScript, and I rewrote it in Go for the reasons in the decision above."
      }
    ]
  }
});
