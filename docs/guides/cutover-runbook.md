# Cutover Runbook: Static Front End on Cloudflare Pages

Section 0 was run on 2026-11-04 and 2026-11-05, and the notes below say what that run found. Sections 1 onward are not yet run. This runbook moves `ryanbumstead.com` from a Cloudflare 301 to the Experience Cloud site over to the static site on Cloudflare Pages ([ADR-041](../adr/041-headless-static-front-end-on-cloudflare-pages.md)). I run it by hand. Nothing in Salesforce changes at cutover, so the rollback takes minutes.

A fact I could not settle from code or documentation is marked `[unverified]`. I check each one in the dashboard before step 1, and I do not run a step that still carries one.

## 0. Setup that must exist first

### 0.1 The edge user and the External Client App

The Pages Functions sign in to Salesforce as a dedicated edge user with a client credentials token ([ADR-027](../adr/027-platform-native-api-authentication.md) is the pattern).

| Item                                             | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| :----------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User                                             | `site-edge@ryanbumstead.com`, Portfolio API Integration profile, Salesforce Platform licence (6 in the org, 1 used when I last read it on 2026-11-02)                                                                                                                                                                                                                                                                                                                                                     |
| Permission set                                   | `Portfolio_Site_Edge`, which grants the `Site_Edge_Actions` custom permission and the `SiteActionsResource` class. The user holds this and not `Portfolio_Guest`                                                                                                                                                                                                                                                                                                                                          |
| Access that keeps the cover letter on Agentforce | `Portfolio_Site_Edge` also grants the `Gemini`, `Portfolio_API` and `Portfolio_API_Token` principals, create and read on `Testimonial__c` with the guest's seven editable fields, and read on `UserExternalCredential`. There is no Prompt Template User, because the cover letter goes through `/papi/ai/generate` as the integration user. A scratch org proves this with stubs only. `[confirmed 2026-11-05: a cover letter run as the edge user in production came back from Agentforce, 0.1 step 6]` |
| External Client App                              | "Portfolio Site Edge", in the org and not in source, because its retrieved metadata carries the consumer key. Built on 2026-11-03 by a metadata deploy shaped on the Portfolio API app, with a test copy in a scratch org. Steps below.                                                                                                                                                                                                                                                                   |
| Consumer key and secret                          | The consumer secret is never in source. It goes only into the Cloudflare secret `SF_CLIENT_SECRET`.                                                                                                                                                                                                                                                                                                                                                                                                       |

Create the user and the app by hand:

1. Create the user `site-edge@ryanbumstead.com` on the Portfolio API Integration profile. Assign only `Portfolio_Site_Edge`.
2. Setup, External Client App Manager, New External Client App, named "Portfolio Site Edge". Turn OAuth on, add the scope `api`, and turn on the client credentials flow, run as `site-edge@ryanbumstead.com`. The flow has two switches with the same name, and both must be on. One is in the app's OAuth settings (`isClientCredentialsFlowEnabled` in its global OAuth settings metadata), the other in its policies, which also names the run as user. When the app is built from metadata, the global OAuth settings file must carry `isClientCredentialsFlowEnabled` set to true. The 2026-11-03 build left it out, and every token request failed until it was turned on in Setup.
3. Set the policy to admin approved users are pre authorized, and pre authorize through the permission set `Portfolio_Site_Edge`.
4. Copy the consumer key into `SF_CLIENT_ID` and the consumer secret into `SF_CLIENT_SECRET`, in Cloudflare only. Put the My Domain URL, no trailing slash, into `SF_INSTANCE_URL`, and a long random value into `IP_HASH_SALT`. All four are the Secret type (0.2).
5. Put the same four values in the GitHub secrets `SITE_EDGE_CLIENT_ID`, `SITE_EDGE_CLIENT_SECRET`, `SITE_EDGE_INSTANCE_URL` and `SITE_EDGE_IP_HASH_SALT`, which the API Lab recording step reads.
6. **Check the edge user.** `pipeline-status` returns 200 with the edge token. A user without `Site_Edge_Actions` gets 403 from the same call. A cover letter POST with a test hash returns provider Agentforce. I do not go on until all three pass.

A first check needs nothing extra. Every build on `main` runs the Record API Lab responses step as the edge user, and its log says "Recorded N API Lab responses". N must be above 0. The step succeeds even at 0, so read the count, not the tick. When N is 0, the edge user's login history shows why. Each attempt is an OAuth Client Credentials login on "Portfolio Site Edge". A status of "Unknown exception: 1817" meant the client credentials flow was off in the app's OAuth settings, the switch step 2 warns about. On 2026-11-05 the step recorded 21 once that was fixed.

All three step 6 checks passed on 2026-11-05. For the 200 and the cover letter I ran the site locally with `npx wrangler pages dev dist` in `web`, with a gitignored `web/.dev.vars` holding the app's consumer key and secret, `SF_INSTANCE_URL`, an `IP_HASH_SALT`, `PRODUCTION_HOSTS="localhost"` and the two switches set to `live`. Browse it at `http://localhost:8788`, not `127.0.0.1`, or every switch reads `recorded` because that host is not in the list. `/api/live/pipeline-status` answered 200 with the latest runs, and a letter sent from the AI Lab page came back "Written by Agentforce". For the 403 I called `/services/apexrest/site/actions/pipeline-status` with `sf api request rest` as my own admin user, which has no `Site_Edge_Actions`. Delete `.dev.vars` once the checks are done.

Steps 2 and 3 copy the existing Portfolio API app. Its metadata, read from production on 2026-11-03, has the client credentials flow on with a named run as user, permitted users set to admin approved users are pre authorized (`AdminApprovedPreAuthorized`), access granted through a permission set, and the scope `Api`. The field names on the Setup screens are `[unverified: read them on the screen]`, because Salesforce Help does not render without a sign in.

### 0.2 The Cloudflare secrets and variables

Set the secrets on the Pages project `ryanbumstead`, Production environment: Cloudflare dashboard, Workers and Pages, `ryanbumstead`, Settings, with Production chosen, then Variables and secrets, Add (dashboard, read 2026-11-03). Choose the Secret type for every one, `SF_INSTANCE_URL` included. `web/wrangler.toml` is the project's source of truth for plain variables, so a deploy drops any text variable set only in the dashboard (Maintenance Guide section 3.12). The switches and `PRODUCTION_HOSTS` go in `[vars]` in that file instead.

| Name                                                                                                      | Kind                            | Value                                                                                                                                                                     |
| :-------------------------------------------------------------------------------------------------------- | :------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `SF_INSTANCE_URL`                                                                                         | Secret                          | The My Domain URL of the org, no trailing slash. Not sensitive, but a text variable would not survive a deploy                                                            |
| `SF_CLIENT_ID`                                                                                            | Secret                          | The External Client App consumer key                                                                                                                                      |
| `SF_CLIENT_SECRET`                                                                                        | Secret                          | The External Client App consumer secret                                                                                                                                   |
| `IP_HASH_SALT`                                                                                            | Secret                          | A long random string. Visitor addresses are hashed with it at the edge and Salesforce never sees one                                                                      |
| `TURNSTILE_SECRET`                                                                                        | Secret                          | The Turnstile widget's secret key                                                                                                                                         |
| `FEATURE_CONTACT`, `FEATURE_TESTIMONIAL`, `FEATURE_COVER_LETTER`, `FEATURE_API_LAB`, `FEATURE_LIVE_READS` | `[vars]` in `web/wrangler.toml` | `live` or `recorded`, set in the file and not in the dashboard. **On a production host a switch that is not set reads as live.** See 0.4                                  |
| `PRODUCTION_HOSTS`                                                                                        | `[vars]` in `web/wrangler.toml` | Optional. A comma list that replaces the default production hosts `ryanbumstead.pages.dev`, `ryanbumstead.com`, `www.ryanbumstead.com`. Any other host is always recorded |

On GitHub, the variable `TURNSTILE_SITE_KEY` (the widget's site key, read by the build) and the secrets the build reads (Maintenance Guide section 3.12): `SFDX_SITE_BUILD_USERNAME`, `CLOUDFLARE_PAGES_TOKEN`, `SITE_DENYLIST` and the four `SITE_EDGE_*` secrets from 0.1. The Turnstile widget covers `ryanbumstead.com` and `ryanbumstead.pages.dev`. Turnstile checks the contact and testimonial forms only. The build writes the site key into each page, so a build that starts before `TURNSTILE_SITE_KEY` is set ships without it. Rebuild after setting it, then check that a page's build info carries `turnstileSiteKey`. The widget itself renders only when a form is sent, so the full check waits for the first live switch at cutover.

### 0.3 The rate limit

Cloudflare does not document the Workers rate limiting binding for Pages Functions, so the limit is a WAF rate limiting rule on the `ryanbumstead.com` zone: path starts with `/api/`, counted by IP, 10 second period, about 20 requests, action block for 10 seconds. It cannot cover `ryanbumstead.pages.dev`, which is why every switch stays `recorded` there until cutover. I make the rule at cutover, before I flip any switch to `live` (0.4).

Behind it, `SubmissionGuard` rate limits each form by the hashed visitor address, with the `Form_Rate_Per_Hash_Per_Minute` setting in `Portfolio_Setting__mdt`, default 3. The visitor sees "Too many tries. Wait a minute and send again." The daily cap keeps "Try again tomorrow".

### 0.4 Switch order

1. All five `FEATURE_*` switches are `recorded` in `[vars]` in `web/wrangler.toml`, so every deploy carries them. An unset switch reads as live on a production host, which would open the forms to Salesforce before the rate limit exists. The first real data build on 2026-11-04 showed it: the switches had been set in the dashboard, that deploy dropped them, and `ryanbumstead.pages.dev` read all five as `live` until the file carried them.
2. They stay `recorded` on `ryanbumstead.pages.dev` until cutover.
3. At cutover, after the WAF rule in 0.3 exists, flip them to `live` one at a time and check each (section 2, step 4).
4. Each flip is a change to the file and a merge, which runs `site.yml` and deploys (Maintenance Guide section 3.12). Check `/api/features` once that deploy finishes.

### 0.5 Previews behind Cloudflare Access

Cloudflare Access is free for up to 50 users. Cloudflare's Pages documentation says Access protects preview deployments and names the per deployment addresses among them (https://developers.cloudflare.com/pages/configuration/preview-deployments/, read 2026-11-03). It does not cover the `*.pages.dev` production alias or custom domains.

Zero Trust runs on the Free plan, $0 for up to 50 seats, set up on 2026-11-04. If it is ever set up again, Get started is where a plan choice or a payment method may be asked for. I stop there if it asks for payment, and leave previews public with Cloudflare's noindex.

The order matters. The moment previews are restricted, a build's smoke cannot get in until the token is in GitHub, so the token and the secrets come first.

1. Zero Trust, Access controls, Service credentials (dashboard, read 2026-11-03): create a service token for CI. Mine is `github-ci-previews`, non expiring. The client secret is shown once. If it is lost, refresh the token and set the new secret in both environments in step 2.
2. GitHub, Settings, Environments: add `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET` to both `site-preview` and `site-production`, never as repository secrets, so pull requests from forks never get them. Both are needed because a build on `main` smokes its own deployment address, `<hash>.ryanbumstead.pages.dev`, which the wildcard in step 5 also covers. With the secrets in `site-preview` only, every build on `main` failed its smoke on the Access login (run 41969749343, 2026-11-05).
3. Workers and Pages, the `ryanbumstead` project, Settings, General, Preview access, Restrict previews. The dashboard says beside the button: "This protects preview deployment URLs only. Production pages.dev and custom domains are managed separately in Zero Trust." (dashboard, read 2026-11-03) This creates the Access application "ryanbumstead - Cloudflare Pages" with one Allow policy, "Allow Members - Cloudflare Pages", that includes my account email. To allow another address of mine, edit that policy from the application's Access policies list and add it to the same Emails rule. Login is by a one time PIN sent to that address, so it must be one that receives mail.
4. Add a Service Auth policy for the CI token. Include the Service Token rule with `github-ci-previews` picked, not "Any Access Service Token", which would admit every token on the account. It goes on the preview application only, never on a production hostname. A policy made under Access controls, Policies is a reusable policy and does nothing until it is attached: open the application, Edit, add it from the existing policies, and save. The policy list then shows "Used by" 1, and the application shows both policies.
5. Open the application and check its public hostname reads `*.ryanbumstead.pages.dev`.
6. Check it works. Run `site.yml` on `main` by hand. The smoke must pass, the token's Last Seen must change from "Not Seen Yet", `https://ryanbumstead.pages.dev/` must answer 200, and a deployment address such as `https://<hash>.ryanbumstead.pages.dev/` must answer 302 to the Access login. All four passed on 2026-11-05 (run 41972126373).

What the policy covers. Cloudflare's known issues page says the application it creates for previews uses the wildcard hostname `*.<project>.pages.dev` (https://developers.cloudflare.com/pages/platform/known-issues/, read 2026-11-03). Every deployment address, old production builds included, has the form `<hash>.ryanbumstead.pages.dev`, so the wildcard covers them. Only the bare `ryanbumstead.pages.dev` and custom domains stay outside it. Step 5 confirms the hostname on the screen. The deployment clean up in section 6 still applies, because an old build behind Access still holds every record it was built with.

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

1. Cloudflare dashboard, Workers and Pages, `portfolio-cache-warmer`, Settings.
2. Trigger events, Cron triggers. The row reads "Runs: Every 5 minutes" with the next run time beside it (dashboard, read 2026-11-03).
3. Remove that cron trigger with the Delete button on its row (dashboard, read 2026-11-03). The Cloudflare Workers cron triggers documentation still describes a three dot menu, but this Worker's row has a plain Delete button.
4. Confirm in the Worker's logs that no scheduled run happens for ten minutes.

Alternative that I make myself, in the repository: change `crons = ["*/5 * * * *"]` to `crons = []` in `config/wrangler.toml` and let `deploy-worker.yml` deploy it on the merge. This is a protected file, so only I edit it. I prefer the dashboard route now and delete the Worker for good in step 3.

## 2. Cutover

1. In the Pages project `ryanbumstead`, Custom domains, add `ryanbumstead.com` and `www.ryanbumstead.com`. Let Cloudflare create the DNS records when it offers.
2. Make `www` redirect to the apex. The Pages documentation says `_redirects` cannot do domain level redirects and points to Bulk Redirects and Redirect Rules (https://developers.cloudflare.com/pages/configuration/redirects/, read 2026-11-03). So I make a Single Redirect on the `ryanbumstead.com` zone: Rules, Overview, the template "Redirect from WWW to root" (Redirect Rules), Create from template. The zone has used 0 of its 10 Redirect Rules (dashboard, read 2026-11-03).
3. Turn off the redirect that sends visitors to the Experience Cloud site. It is a Page Rule, not a Redirect Rule: `ryanbumstead.com` zone, Rules, Page Rules, position 1, URL `*ryanbumstead.com/*`, Forwarding URL with status 301 to the Salesforce site, path kept with `$2` (dashboard, read 2026-11-03). Its pattern also matches `www`, so `www` keeps forwarding to Salesforce until this rule is off. Turn its Enabled toggle off and keep the rule, so rollback is one toggle.
4. Add the WAF rate limiting rule from 0.3, then flip the five switches to `live` in the order of 0.4, checking `/api/features` after each merge deploys.
5. Check the home page, `/skills` and `/docs`, and two deep links such as `/api-lab` and `/resume`, at `https://ryanbumstead.com`. Each loads the static page. A request to `www` ends on the apex.
6. Check `/api/features` on the apex shows five `live` values, then test each switch both ways: set it to `recorded` in the file and merge, check the page once the deploy finishes, set it back to `live`, merge and check again. Each flip is its own pull request, because only a merged commit deploys.
7. Submit the contact form and the testimonial form once each and confirm both land in Salesforce. Send a request with no Turnstile token and confirm it is refused. Run a cover letter and confirm the provider is Agentforce, not the template.

## 3. Same day

1. Point `smoke.yml`, `performance.yml` and the README at `https://ryanbumstead.com`. In `smoke.yml` the default `SITE_BASE` and the `site_base` input change, and the README's live app line and the STATUS live site row change from the redirect wording to the static site.
2. Retire the cache warmer for good: delete the Worker `portfolio-cache-warmer` in Cloudflare, delete `deploy-worker.yml`, and delete `config/wrangler.toml` and `scripts/cache-warmer.js` if nothing else uses them. [Technical Guide §2.13](./04-Technical-Guide.md#213-cloudflare-cache-warmer-worker) is marked retired, and I remove it from the SAS middleware list.
3. Update `docs/guides/03-SAS.md` section 6.1 from "after cutover" to what runs.

## 4. Rollback for two weeks

Nothing in Salesforce changed, so this takes minutes.

1. Turn the Page Rule `*ryanbumstead.com/*` (Rules, Page Rules) back on.
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

Dashboard path: Cloudflare dashboard, Workers and Pages, `ryanbumstead`, Deployments. The "All deployments" list shows each one's environment, source, address and age. Open Details on an older row, then Manage deployment, Delete deployment (dashboard, read 2026-11-03). The dashboard may refuse to delete the current production deployment, which is correct.

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
