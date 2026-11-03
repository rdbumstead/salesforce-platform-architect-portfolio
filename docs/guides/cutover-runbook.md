# Cutover Runbook: Static Front End on Cloudflare Pages

This runbook is written and not yet run. It moves `ryanbumstead.com` from a Cloudflare 301 to the Experience Cloud site over to the static site on Cloudflare Pages ([ADR-041](../adr/041-headless-static-front-end-on-cloudflare-pages.md)). I run it by hand. Nothing in Salesforce changes at cutover, so the rollback takes minutes.

Facts that depend on work still to be merged are marked `[to fill]` with what they need, or `[unverified]`. I fill them before step 1, and I do not run a step that still carries one.

## 0. Setup that must exist first

### 0.1 The edge user and the External Client App

The Pages Functions sign in to Salesforce as a dedicated edge user with a client credentials token ([ADR-027](../adr/027-platform-native-api-authentication.md) is the pattern).

| Item                                             | Value                                                                                                                                                                           |
| :----------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| User                                             | `site-edge@ryanbumstead.com`, Portfolio API Integration profile, Salesforce Platform licence (6 in the org, 1 used when I last read it on 2026-11-02)                           |
| Permission set                                   | `Portfolio_Site_Edge`, which grants the `Site_Edge_Actions` custom permission and the `SiteActionsResource` class                                                               |
| Access that keeps the cover letter on Agentforce | `[to fill: either access to the Portfolio_API and Gemini external credential principals, or Prompt Template User on the user. The site actions change proves which one works.]` |
| External Client App                              | `[to fill: name, and whether it deploys as metadata or is made in Setup. Steps below if made in Setup.]`                                                                        |
| Consumer key and secret                          | The consumer secret is never in source. It goes only into the Cloudflare secret `SF_CLIENT_SECRET`.                                                                             |

If the External Client App is made in Setup `[to fill: confirm these steps against the built app]`:

1. Setup, External Client App Manager, New External Client App. Enable OAuth, scope for the REST API, and turn on the client credentials flow.
2. Set the run as user to `site-edge@ryanbumstead.com`.
3. Pre authorize the app through the permission set `Portfolio_Site_Edge`.
4. Copy the consumer key into `SF_CLIENT_ID` and the consumer secret into `SF_CLIENT_SECRET`, in Cloudflare only.
5. Read the token endpoint of My Domain into `SF_INSTANCE_URL`.

### 0.2 The Cloudflare secrets and variables

Set these on the Pages project `ryanbumstead`, Production environment: Cloudflare dashboard, Workers and Pages, `ryanbumstead`, Settings, Variables and Secrets.

| Name                                                                                                      | Kind        | Value                                                                                                |
| :-------------------------------------------------------------------------------------------------------- | :---------- | :--------------------------------------------------------------------------------------------------- |
| `SF_INSTANCE_URL`                                                                                         | Variable    | The My Domain URL of the org, no trailing slash                                                      |
| `SF_CLIENT_ID`                                                                                            | Secret      | The External Client App consumer key                                                                 |
| `SF_CLIENT_SECRET`                                                                                        | Secret      | The External Client App consumer secret                                                              |
| `IP_HASH_SALT`                                                                                            | Secret      | A long random string. Visitor addresses are hashed with it at the edge and Salesforce never sees one |
| `TURNSTILE_SECRET`                                                                                        | Secret      | The Turnstile widget's secret key                                                                    |
| `TURNSTILE_SITE_KEY`                                                                                      | Variable    | The Turnstile widget's site key, added to the page's build info at build time                        |
| `FEATURE_CONTACT`, `FEATURE_TESTIMONIAL`, `FEATURE_COVER_LETTER`, `FEATURE_API_LAB`, `FEATURE_LIVE_READS` | Variable    | `live` or `recorded`. Production defaults to `live`                                                  |
| Any further name the functions read                                                                       | `[to fill]` | `[to fill: the list from the functions change]`                                                      |

Also check the GitHub secrets the build reads (Maintenance Guide section 3.12): `SFDX_SITE_BUILD_USERNAME`, `CLOUDFLARE_PAGES_TOKEN`, `SITE_DENYLIST`. A Turnstile widget needs to exist for the Pages hostnames and later for the apex domain.

### 0.3 The rate limit

`[to fill: the rate limit choice. Either the Workers rate limiting binding declared for the Pages project, or a WAF rate limiting rule on /api/* made in the dashboard. State the limit and the window.]`

Behind it, `SubmissionGuard` rate limits each form by the hashed visitor address, with a limit stored in `Portfolio_Setting__mdt` `[to fill: the setting name and default]`.

## 1. Before cutover

Do not start until every line is true.

- [ ] The production Pages build is green: `site.yml` on `main` succeeded and its summary shows the export read from Salesforce, not fixtures.
- [ ] Smoke is green against the production `*.pages.dev` address: run `scripts/live-smoke.js` with the base set to it. Every row passes.
- [ ] Lighthouse is green against it. The workflow's medians are in the job summary, and I have recorded them in [Technical Guide §2.11](./04-Technical-Guide.md#211-mobile-performance) as Cloudflare numbers, not local ones.
- [ ] Every kill switch is tested both ways on the `*.pages.dev` address: set the variable to `recorded`, run the workflow, check `/api/features` and the page, then set it back to `live` and check again. The five switches are in the table above.
- [ ] A contact form submission and a testimonial submission from the `*.pages.dev` address land in Salesforce, and Turnstile blocks a request with no token.
- [ ] A cover letter from the `*.pages.dev` address reports Agentforce as the provider, not the template, so the edge user's access works.
- [ ] The Cloudflare secrets in 0.2 are set, and the rate limit in 0.3 is in place.
- [ ] The cache warmer is paused (step 1.1 below).
- [ ] The open licensing question in the ADR is either answered or I accept that the kill switches are my fallback.

### 1.1 Pause the cache warmer

The warmer pings `https://ryanbumstead.com/` every five minutes. Today that reaches the Salesforce site as guest traffic. After cutover it would load the static site for no reason. Pause it before cutover so the last hours of the redirect do not add guest traffic.

Dashboard route:

1. Cloudflare dashboard, Workers and Pages, `portfolio-cache-warmer`.
2. Settings, Triggers, Cron Triggers.
3. Remove the `*/5 * * * *` trigger. `[unverified: the exact labels, check them in the dashboard]`
4. Confirm in the Worker's logs that no scheduled run happens for ten minutes.

Alternative that I make myself, in the repository: change `crons = ["*/5 * * * *"]` to `crons = []` in `config/wrangler.toml` and let `deploy-worker.yml` deploy it on the merge. This is a protected file, so only I edit it. I prefer the dashboard route now and delete the Worker for good in step 3.

## 2. Cutover

1. In the Pages project `ryanbumstead`, Custom domains, add `ryanbumstead.com` and `www.ryanbumstead.com`. Let Cloudflare create the DNS records when it offers.
2. Make `www` redirect to the apex `[unverified: the way to do this, a redirect rule or the Pages custom domain setting, depends on the dashboard]`.
3. Turn off the existing 301 redirect rule for `ryanbumstead.com` that sends visitors to the Experience Cloud site. Note its settings first so rollback can recreate it, or disable it and keep it.
4. Check the home page, `/skills` and `/docs`, and two deep links such as `/api-lab` and `/resume`, at `https://ryanbumstead.com`. Each loads the static page. A request to `www` ends on the apex.
5. Check `/api/features` on the apex, then submit the contact form once.

## 3. Same day

1. Point `smoke.yml`, `performance.yml` and the README at `https://ryanbumstead.com`. In `smoke.yml` the default `SITE_BASE` and the `site_base` input change, and the README's live app line and the STATUS live site row change from the redirect wording to the static site.
2. Retire the cache warmer for good: delete the Worker `portfolio-cache-warmer` in Cloudflare, delete `deploy-worker.yml`, and delete `config/wrangler.toml` and `scripts/cache-warmer.js` if nothing else uses them. [Technical Guide §2.13](./04-Technical-Guide.md#213-cloudflare-cache-warmer-worker) is marked retired, and I remove it from the SAS middleware list.
3. Update `docs/guides/03-SAS.md` section 6.1 from "after cutover" to what runs.

## 4. Rollback for two weeks

Nothing in Salesforce changed, so this takes minutes.

1. Turn the 301 redirect rule for `ryanbumstead.com` back on.
2. Remove `ryanbumstead.com` and `www.ryanbumstead.com` as custom domains from the Pages project.
3. Check the home page and one deep link land on the Experience Cloud site with the path kept.
4. Restore the warmer only if the Salesforce site needs waking: put the cron back and redeploy.
5. Leave the Pages project and its `*.pages.dev` address as they are.

## 5. After two weeks with no rollback

I decide whether to take the Salesforce site offline. The API site that vends evaluator tokens stays either way. Then I update ADR-041 to Built, change the README and STATUS status wording, and delete the leftover rollback notes.

## 6. Clean up old Pages deployments, on a schedule

Cloudflare Pages keeps a separate address for every deployment and every pull request preview, and an old build stays reachable to anyone who has its link. If I later pull a record out of Salesforce, every old build that still carries it would keep showing it. So I delete old deployments on a recurring schedule.

- **How often.** Once a month, and after any record is pulled for a reason of safety or privacy. Delete deployments older than a few weeks. I use four weeks `[to fill: confirm four weeks]`.
- **Never inside the rollback window.** Do not delete any deployment made in the two weeks after cutover, or the deployment that was live when I cut over. Rollback depends on them. Start the monthly clean up only after step 5.
- **Never the live one.** Keep the current production deployment and the one before it.
- **Preview builds** send `noindex` so search engines do not list them. The build adds that header `[unverified until the build change is merged]`. It does not stop someone with the link from opening a preview, which is why they are deleted.

Dashboard path: Cloudflare dashboard, Workers and Pages, `ryanbumstead`, Deployments. Filter by environment, sort by date, and delete from the menu on each older row. The dashboard may refuse to delete the current production deployment, which is correct.

Wrangler commands `[unverified: syntax not checked against the current Cloudflare documentation, run --help first]`:

```bash
npx wrangler pages deployment list --project-name ryanbumstead
npx wrangler pages deployment delete <DEPLOYMENT_ID> --project-name ryanbumstead
```

`list` shows each deployment's id, environment, branch and age. Delete only ids older than the cut off and outside the rollback window. A deployment that is the live alias of a branch may need a force flag `[unverified]`, and I do not force the production one.

After a clean up, load three old preview addresses I know and confirm they no longer answer.
