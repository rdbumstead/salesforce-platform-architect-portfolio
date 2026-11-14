# Gold files

A gold file says what a good selection for one posting looks like. The scorer compares every model run against it. Gold files are written by the owner, never by a script or an agent, and they never sit in a tracked path.

## Where they live

- Gold files: `web/tailor-eval/private/gold/<postingId>.json`, one per posting.
- Real postings: `web/tailor-eval/private/postings/<postingId>.json`, in the same format as the files in `../postings/`.
- Run results: `web/tailor-eval/private/runs/`, written by `run-eval.mjs`.

The whole `private/` folder is ignored by git and refused at commit. This folder, `gold/`, holds this README only. A gold file for a synthetic posting also goes under `private/gold/`, so no gold label is ever public.

## Format

```json
{
  "postingId": "posting-id",
  "requirements": [
    {
      "requirement": "Short wording of the requirement",
      "category": "a category id from ../categories.json",
      "match": "strong | partial | gap",
      "keywords": [
        "optional words that identify this requirement in a run's output"
      ]
    }
  ],
  "ids": ["every item id that should come back in owner mode"],
  "visitorIds": ["optional, the ids for visitor mode"],
  "gaps": ["category ids of the requirements that have no evidence"],
  "hardFilters": ["degree | location | citizenship"]
}
```

- `requirements` lists the top requirements in rank order. The scorer maps each requirement in a run's output to one of these by its `keywords` and the category keywords in `../categories.json`. A requirement that maps to nothing counts as unmapped and is reported, not guessed.
- `ids` covers the headline, the summary, the bullets, the skills and the projects together. Precision is the share of returned ids that are in `ids`. Recall is the share of `ids` that came back.
- `visitorIds` is optional. Without it the scorer uses `ids` with every unverified item removed, because visitor mode sees verified items only.
- `gaps` are the requirements a good run reports with `match: "gap"`. Gap recall is the share of them the run reports as gaps.
- `hardFilters` are the kinds a good run flags in `hard_filter_flags`. The scorer matches a kind by its words: degree (degree, bachelor, master), location (on site, onsite, relocate, in the office, hybrid, location), citizenship (citizen, clearance, work authorization, visa, sponsorship).

## Worked example

**This is an example only.** The posting is invented for this README and is not one of the evaluation postings. Do not copy its ids into a real gold file without checking them against the snapshot.

The example posting: "Pinewhistle Freight is hiring a Salesforce Integration Developer, on site in the office four days a week. You will build REST integrations between Salesforce and our transport system, own the release pipeline, and migrate ten years of shipment history into Salesforce. Experience with Field Service is a plus."

```json
{
  "postingId": "example-integration-developer",
  "requirements": [
    {
      "requirement": "REST integrations with the transport system",
      "category": "integration",
      "match": "strong",
      "keywords": ["rest", "integration", "transport system"]
    },
    {
      "requirement": "Own the release pipeline",
      "category": "ci-cd",
      "match": "strong",
      "keywords": ["release", "pipeline"]
    },
    {
      "requirement": "Migrate shipment history into Salesforce",
      "category": "data-migration",
      "match": "partial",
      "keywords": ["migrate", "migration", "shipment history"]
    }
  ],
  "ids": [
    "headline-engineer",
    "summary-site",
    "northwind-release-owner",
    "northwind-agentic-migration",
    "northwind-solution-design",
    "lakeview-devops-lead",
    "skill-git",
    "skill-github-actions",
    "skill-salesforce-cli",
    "project-work-experience-api"
  ],
  "gaps": [],
  "hardFilters": ["location"]
}
```

Field Service is "a plus" in the example posting, so it is not a top requirement and not a gap.
