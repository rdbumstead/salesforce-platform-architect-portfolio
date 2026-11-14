# ADR-043: A Provider Router for Tailored Letters

## Status

- **Decision:** Accepted.
- **Build:** Designed, and not yet live. The router, its policies and the JS template are on the branch `feat/provider-router`, which has not merged, and they run in the tailoring evaluation kit only. The cover letter on the site still runs the Apex chain in [ADR-015](015-strategy-pattern-for-generative-ai.md).

Accepted on 2026-11-14. The provider comparison that sets the owner policy order has not run yet, because the Gemini and Claude keys arrive on 2026-11-16 at the earliest.

## Context

- **One chain, inside the org.** Today `ContentGenerationController.dispatch` writes every cover letter. It asks Agentforce through the API first, then Gemini through a Named Credential, then the Apex class `LocalTemplateService` ([ADR-015](015-strategy-pattern-for-generative-ai.md), [SAS §5.4.1](../guides/03-SAS.md#541-feature-spotlight-generative-cover-letter-engine)). Every step runs in the org, and the order is code.
- **A bigger pipeline.** Tailoring adds a selector that picks the evidence for a posting and a letter written from it, in a visitor mode and an owner mode that share the prompts and the validators. Both modes write five paragraphs and 300 to 400 words: an opener, three evidence paragraphs (one per top requirement) and a close.
- **No paid spend.** The public site stays at $0. A paid model never serves it.
- **The terms question.** Whether a Developer Edition org may serve a public site is still open ([ADR-041](041-headless-static-front-end-on-cloudflare-pages.md#open-question)). A letter that can be written without the org keeps the feature working if the answer goes against me.

## Decision

**A provider router is the first layer of the tailoring pipeline. Every provider sits behind one interface. A request goes to the first route in a policy, falls to the next when a route fails, and always ends at a local template that needs no model. The policies are config, not code.**

1. **One interface.** Every route is a provider with a name, a model and `complete({ kind, system, user, context, signal })`. Workers AI, Gemini, Claude and the template all take this shape.
2. **Whole runs.** The router runs the full selector and letter for one route, with their usual retry, and reads the result before it tries the next. A validator failure is only known after that retry, so a router that saw single calls could not fall through on it.
3. **When a route falls through.** On an outage (a network error, an HTTP 5xx or a timeout), a quota refusal (an HTTP 429 or a quota message), a validator failure after the retry, a missing key, or any other refused call. A 401 or 403 falls through and is recorded as refused. A model route does not start when less than the policy's floor is left of its time budget. A policy can list validator codes that stop the run instead of falling through. None are listed yet, because the validators flag no posting injection today.
4. **The template is always last.** A policy that does not end with the template, names an unknown provider, has no routes or repeats one is refused when it loads, with a plain message. Past the monthly spend cap, the visitor letter also goes to the template. The cap does not exist yet.
5. **Policy as config.** The policies live in `web/tailor-eval/routes.json`. `public` tries Workers AI, then Gemini, then the template. `owner` holds an order I set after the comparison. The order in the file today is a placeholder, and so are the floor and the route timeout.
6. **The public policy refuses any paid route.** A `public` policy that names `paid` or `claude` is refused on load.
7. **Workers AI first on the public site.** An open weight model on Cloudflare Workers AI runs at the edge at $0 with no org dependency. On the site it will be called through the Pages AI binding. The evaluation calls it over the REST API, and its default model is `@cf/meta/llama-3.3-70b-instruct-fp8-fast`.
8. **Agentforce stays a possible route.** It needs the org, so the evaluation has no adapter for it, and a policy that names it is refused on load for now. It is evaluated in the second phase, with the org.
9. **Topic routing only if the evaluation supports it.** Sending Salesforce postings to Agentforce and other postings to Workers AI is an idea, not a plan. It goes on only if Agentforce scores higher on Salesforce postings. If it is built, the posting is classified in code, never by a model. `orderRoutes` in the router is where it would plug in, and today it returns the policy order as written.
10. **A native Claude adapter for my comparison only.** It calls the Anthropic SDK with server side fallbacks on and no SDK retries, so the router decides what follows a failure, and it throws on a refusal so the router falls through. It bills per call, so only owner runs can use it.

## The template

The template is a JS port of `LocalTemplateService` in `web/functions/_lib/tailor/template.js`. It is pure code with no org call and no network, so a Pages Function can import it. It started as a straight port and now meets the same letter rules as a model letter: five paragraphs, 300 to 400 words, the current employer named, and every number and product or tool name grounded in the selected evidence.

- It opens with the role and the current employer, writes three evidence paragraphs that start from the highest ranked requirements with evidence, strong matches first, and closes with a sentence that says no model wrote it.
- With fewer than three evidenced requirements it keeps five paragraphs and the validator warns. A gap is never claimed.
- Length comes from real evidence first. Each paragraph quotes up to two selected bullets or projects, and no item appears twice. Skills are listed in one sentence and never quoted as sentences. Only when the evidence runs out does it add sentences from a short neutral set of five, each at most once, which make no claim about me.
- A sentence that could carry a name or a number, such as the year I started on Salesforce, goes in only when the grounding check passes it.
- **Planned, not done:** the snapshot sends a project's business value and solution text, so the template can quote it. Today a project item carries its name only, and on the sample snapshot the letters fall 13 to 84 words short of 300. A run that reaches the template there ends on the word count check.

## The trace

Every run records which route answered and one step per route tried: the route, its model, its outcome class, a short fixed reason, its wait and its validator codes. The trace never holds posting text, letter text, a key or a provider's error message. "Show your work" will name the provider that answered.

## Consequences

- Once this reaches the site, a public letter can be written with no call to the org, and the template is the last route when every model fails.
- Changing the order is a config edit. Adding a provider is one adapter in the same shape.
- A validator failure costs a whole selector and letter before the next route starts, so a slow first route leaves less time for the rest. The 115 second budget, the floor and the route timeout bound that.
- Until the site moves to the router there are two templates, the Apex one in the live chain and the JS one here.
- With no keys set, every model route is skipped as a missing key and the run reaches the template.

## Alternatives considered

| Option                                    | Why not                                                                           |
| :---------------------------------------- | :-------------------------------------------------------------------------------- |
| Keep the Apex chain as the only path      | Every letter needs the org, and the order is code.                                |
| A router that wraps each provider call    | It cannot fall through on a letter that fails the validators after its retry.     |
| Route by posting topic from the start     | Nothing shows yet that Agentforce writes better Salesforce letters.               |
| A paid model on the public site           | It breaks the $0 rule.                                                            |
| A template that may fail the letter rules | A visitor would get a letter that breaks the rules every model letter is held to. |

## Related

- [ADR-015](015-strategy-pattern-for-generative-ai.md) is the live chain this sits in front of once it reaches the site.
- [ADR-041](041-headless-static-front-end-on-cloudflare-pages.md) is the static front end and the Pages Functions the router would run in.
- [ADR-009](009-granular-resume-data-model.md) is the data model behind the snapshot the selector and the template read.
