# Cutover Runbook: Static Front End on Cloudflare Pages

This runbook is written and not yet run. It moves `ryanbumstead.com` from a Cloudflare 301 to the Experience Cloud site over to the static site on Cloudflare Pages ([ADR-041](../adr/041-headless-static-front-end-on-cloudflare-pages.md)). I run it by hand. Nothing in Salesforce changes at cutover, so the rollback takes minutes.

A fact I could not settle from code or documentation is marked `[unverified]`. I check each one in the dashboard before step 1, and I do not run a step that still carries one.

## 0. Setup that must exist first

### 0.1 The edge user and the External Client App

The Pages Functions sign in to Salesforce as a dedicated edge user with a client credentials token ([ADR-027](../adr/027-platform-native-api-authentication.md) is the pattern).

| Item                                             | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| :----------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User                                             | `site-edge@ryanbumstead.com`, Portfolio API Integration profile, Salesforce Platform licence (6 in the org, 1 used when I last read it on 2026-11-02)                                                                                                                                                                                                                                                                                                                             |
| Permission set                                   | `Portfolio_Site_Edge`, which grants the `Site_Edge_Actions` custom permission and the `SiteActionsResource` class. The user holds this and not `Portfolio_Guest`                                                                                                                                                                                                                                                                                                                  |
| Access that keeps the cover letter on Agentforce | `Portfolio_Site_Edge` also grants the `Gemini`, `Portfolio_API` and `Portfolio_API_Token` principals, create and read on `Testimonial__c` with the guest's seven editable fields, and read on `UserExternalCredential`. There is no Prompt Template User, because the cover letter goes through `/papi/ai/generate` as the integration user. A scratch org proves this with stubs only. `[unverified: that production stays on Agentforce, checked in 0.1 after the user exists]` |
| External Client App                              | "Portfolio Site Edge", made in Setup and not in source. The scratch org has no External Client App, so it was not proven there. Steps below.                                                                                                                                                                                                                                                                                                                                      |
| Consumer key and secret                          | The consumer secret is never in source. It goes only into the Cloudflare secret `SF_CLIENT_SECRET`.                                                                                                                                                                                                                                                                                                                                                                               |

Create the user and the app by hand:

1. Create the user `site-edge@ryanbumstead.com` on the Portfolio API Integration profile. Assign only `Portfolio_Site_Edge`.
2. Setup, External Client App Manager, New External Client App, named "Portfolio Site Edge". Turn OAuth on, add the scope `api`, and turn on the client credentials flow, run as `site-edge@ryanbumstead.com`.
3. Set the policy to admin approved users are pre authorized, and pre authorize through the permission set `Portfolio_Site_Edge`.
4. Copy the consumer key into `SF_CLIENT_ID` and the consumer secret into `SF_CLIENT_SECRET`, in Cloudflare only. Put the My Domain URL, no trailing slash, into `SF_INSTANCE_URL`, and a long random value into `IP_HASH_SALT`.
5. Put the same four values in the GitHub secrets `SITE_EDGE_CLIENT_ID`, `SITE_EDGE_CLIENT_SECRET`, `SITE_EDGE_INSTANCE_URL` and `SITE_EDGE_IP_HASH_SALT`, which the API Lab recording step reads.
6. **Check the edge user.** `pipeline-status` returns 200 with the edge token. A user without `Site_Edge_Actions` gets 403 from the same call. A cover letter POST with a test hash returns provider Agentforce. I do not go on until all three pass.

I read the Setup labels in steps 2 and 3 against the screen `[unverified: dashboard labels]`.

### 0.2 The Cloudflare secrets and variables

Set these on the Pages project `ryanbumstead`, Production environment: Cloudflare dashboard, Workers and Pages, `ryanbumstead`, Settings, Variables and Secrets.

| Name                                                                                                      | Kind     | Value                                                                                                                                                                     |
| :-------------------------------------------------------------------------------------------------------- | :------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SF_INSTANCE_URL`                                                                                         | Variable | The My Domain URL of the org, no trailing slash                                                                                                                           |
| `SF_CLIENT_ID`                                                                                            | Secret   | The External Client App consumer key                                                                                                                                      |
| `SF_CLIENT_SECRET`                                                                                        | Secret   | The External Client App consumer secret                                                                                                                                   |
| `IP_HASH_SALT`                                                                                            | Secret   | A long random string. Visitor addresses are hashed with it at the edge and Salesforce never sees one                                                                      |
| `TURNSTILE_SECRET`                                                                                        | Secret   | The Turnstile widget's secret key                                                                                                                                         |
| `FEATURE_CONTACT`, `FEATURE_TESTIMONIAL`, `FEATURE_COVER_LETTER`, `FEATURE_API_LAB`, `FEATURE_LIVE_READS` | Variable | `live` or `recorded`. **On a production host a switch that is not set reads as live.** See 0.4                                                                            |
| `PRODUCTION_HOSTS`                                                                                        | Variable | Optional. A comma list that replaces the default production hosts `ryanbumstead.pages.dev`, `ryanbumstead.com`, `www.ryanbumstead.com`. Any other host is always recorded |

On GitHub, the variable `TURNSTILE_SITE_KEY` (the widget's site key, read by the build) and the secrets the build reads (Maintenance Guide section 3.12): `SFDX_SITE_BUILD_USERNAME`, `CLOUDFLARE_PAGES_TOKEN`, `SITE_DENYLIST` and the four `SITE_EDGE_*` secrets from 0.1. The Turnstile widget covers `ryanbumstead.com` and `ryanbumstead.pages.dev`. Turnstile checks the contact and testimonial forms only.

### 0.3 The rate limit

Cloudflare does not document the Workers rate limiting binding for Pages Functions, so the limit is a WAF rate limiting rule on the `ryanbumstead.com` zone: path starts with `/api/`, counted by IP, 10 second period, about 20 requests, action block for 10 seconds. It cannot cover `ryanbumstead.pages.dev`, which is why every switch stays `recorded` there until cutover. I make the rule at cutover, before I flip any switch to `live` (0.4).

Behind it, `SubmissionGuard` rate limits each form by the hashed visitor address, with the `Form_Rate_Per_Hash_Per_Minute` setting in `Portfolio_Setting__mdt`, default 3. The visitor sees "Too many tries. Wait a minute and send again." The daily cap keeps "Try again tomorrow".

### 0.4 Switch order

1. **Before the first real data build reaches production**, set all five `FEATURE_*` variables to `recorded` on the Production environment. An unset switch reads as live on a production host, so a real data build with no variables would open the forms to Salesforce before the rate limit exists.
2. They stay `recorded` on `ryanbumstead.pages.dev` until cutover.
3. At cutover, after the WAF rule in 0.3 exists, flip them to `live` one at a time and check each (section 2, step 4).
4. A change to a variable applies from the next deployment, so run `site.yml` by hand after each flip (Maintenance Guide section 3.12).

### 0.5 Previews behind Cloudflare Access

Cloudflare Access is free for up to 50 users. Cloudflare's Pages documentation says Access protects preview deployments and names the per deployment addresses among them (https://developers.cloudflare.com/pages/configuration/preview-deployments/, read 2026-11-03). It does not cover the `*.pages.dev` production alias or custom domains.

1. Workers and Pages, the `ryanbumstead` project, Settings, turn on the access policy for preview deployments. Allow my own email.
2. Zero Trust, Access, Service Auth, create a service token for CI. Add a Service Auth rule for that token to the preview application only, never to a production hostname.
3. GitHub, Settings, Environments, `site-preview` (the first run creates it): add `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET` there, not as repository secrets, so pull requests from forks never get them.

Whether the policy also covers the per deployment addresses of old production builds is `[unverified]`, because the documentation example is a preview address. The deployment clean up in section 6 still applies.

## 1. Before cutover

Do not start until every line is true.

- [ ] The production Pages build is green: `site.yml` on `main` succeeded and its summary shows the export read from Salesforce, not fixtures.
- [ ] Smoke is green against the production `*.pages.dev` address: run `scripts/live-smoke.js` with the base set to it. Every row passes.
- [ ] Lighthouse is green against it. The workflow's medians are in the job summary, and I have recorded them in [Technical Guide §2.11](./04-Technical-Guide.md#211-mobile-performance) as Cloudflare numbers, not local ones.
- [ ] All five switches read `recorded` on the `*.pages.dev` address: `/api/features` shows five `recorded` values and each page shows its paused note, sample letter or build snapshot. They stay that way until cutover (0.4), because the rate limit cannot cover that address.
- [ ] The edge user check in 0.1 passed, including a cover letter that reports Agentforce as the provider.
- [ ] The Cloudflare secrets in 0.2 are set, the rate limit in 0.3 is in place and the switch order in 0.4 was followed.
- [ ] The Turnstile widget exists, and the edge user and the External Client App exist.
- [ ] Previews are behind Cloudflare Access (0.5).
- [ ] The cache warmer is paused (step 1.1 below).
- [ ] The open licensing question in the ADR is either answered or I accept that the kill switches are my fallback.

### 1.1 Pause the cache warmer

The warmer pings `https://ryanbumstead.com/` every five minutes. Today that reaches the Salesforce site as guest traffic. After cutover it would load the static site for no reason. Pause it before cutover so the last hours of the redirect do not add guest traffic.

Dashboard route:

1. Cloudflare dashboard, Workers and Pages, `portfolio-cache-warmer`.
2. Triggers.
3. Select the three dot icon next to the `*/5 * * * *` Cron Trigger and choose Delete (Cloudflare Workers cron triggers documentation, https://developers.cloudflare.com/workers/configuration/cron-triggers/, read 2026-11-03). `[unverified: the labels on this Worker's own page, check them in the dashboard]`
4. Confirm in the Worker's logs that no scheduled run happens for ten minutes.

Alternative that I make myself, in the repository: change `crons = ["*/5 * * * *"]` to `crons = []` in `config/wrangler.toml` and let `deploy-worker.yml` deploy it on the merge. This is a protected file, so only I edit it. I prefer the dashboard route now and delete the Worker for good in step 3.

## 2. Cutover

1. In the Pages project `ryanbumstead`, Custom domains, add `ryanbumstead.com` and `www.ryanbumstead.com`. Let Cloudflare create the DNS records when it offers.
2. Make `www` redirect to the apex. The Pages documentation says `_redirects` cannot do domain level redirects and points to Bulk Redirects and Redirect Rules (https://developers.cloudflare.com/pages/configuration/redirects/, read 2026-11-03). So I make a redirect rule on the `ryanbumstead.com` zone from `www.ryanbumstead.com` to the apex, path kept `[unverified: the rule type and its dashboard labels, check them in the dashboard]`.
3. Turn off the existing 301 redirect rule for `ryanbumstead.com` that sends visitors to the Experience Cloud site. Note its settings first so rollback can recreate it, or disable it and keep it.
4. Add the WAF rate limiting rule from 0.3, then flip the five switches to `live` in the order of 0.4, checking `/api/features` after each run of `site.yml`.
5. Check the home page, `/skills` and `/docs`, and two deep links such as `/api-lab` and `/resume`, at `https://ryanbumstead.com`. Each loads the static page. A request to `www` ends on the apex.
6. Check `/api/features` on the apex shows five `live` values, then test each switch both ways: set it to `recorded`, run `site.yml`, check the page, set it back to `live` and check again.
7. Submit the contact form and the testimonial form once each and confirm both land in Salesforce. Send a request with no Turnstile token and confirm it is refused. Run a cover letter and confirm the provider is Agentforce, not the template.

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

- **How often.** Once a month, and after any record is pulled for a reason of safety or privacy. Delete deployments older than a few weeks. I use four weeks, which is my choice and not a Cloudflare setting.
- **Never inside the rollback window.** Do not delete any deployment made in the two weeks after cutover, or the deployment that was live when I cut over. Rollback depends on them. Start the monthly clean up only after step 5.
- **Never the live one.** Keep the current production deployment and the one before it.
- **Preview builds** send `noindex` so search engines do not list them. Cloudflare sends `X-Robots-Tag: noindex` on every preview deployment by its own default (Pages preview deployments documentation, https://developers.cloudflare.com/pages/configuration/preview-deployments/, read 2026-11-03), and the preview build also adds the header for `/*` itself (`NOINDEX_RULE` in `web/build/build.mjs`). It does not stop someone with the link from opening a preview, which is why they are deleted.

Dashboard path: Cloudflare dashboard, Workers and Pages, `ryanbumstead`, Deployments. Filter by environment, sort by date, and delete from the menu on each older row. The dashboard may refuse to delete the current production deployment, which is correct.

Wrangler commands, checked with `npx wrangler pages deployment --help` on wrangler 4.156.2 (run from `web/` after `npm ci --prefix web`), 2026-11-03:

```bash
npx wrangler pages deployment list --project-name ryanbumstead --environment preview
npx wrangler pages deployment delete <DEPLOYMENT_ID> --project-name ryanbumstead
```

The help text I relied on:

```text
wrangler pages deployment delete <deployment-id>
  Delete a deployment in your Cloudflare Pages project
  --project-name  The name of the project the deployment belongs to
  -f, --force     Delete even if the deployment has an active alias  [default: false]

wrangler pages deployment list
  --project-name  The name of the project you would like to list deployments for
  --environment   Environment type to list deployments for  [choices: production, preview]
  --json          Return output as JSON  [default: false]
```

`list` shows the deployments of a project (`--json` gives them as data). Delete only ids older than the cut off and outside the rollback window. A deployment with an active alias needs `--force`, and I never force the production one.

After a clean up, load three old preview addresses I know and confirm they no longer answer.
