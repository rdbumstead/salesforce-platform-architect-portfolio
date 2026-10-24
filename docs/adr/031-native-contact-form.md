# ADR-031: Native Contact Form

## Status

Accepted (2026-10-23, Round 7). The owner chose a native form on 2026-10-22, and the platform event step was added on 2026-10-23 (Round 7 reading R19) after a scratch org proof.

## Context

The site had no way to reach the owner. Email and phone were removed from the site and the API on purpose, and `Portfolio_Config__mdt.Calendly_URL__c` reaches only the API. The owner asked for a short contact form on the home page that lands in Salesforce as a Lead, so the org's own Lead rules handle it: the assignment rule picks the owner, the auto-response rule thanks the visitor, and a reminder follows if the owner forgets to reply.

The form is public. An auto-response on a public form can be used to send mail to any address someone types in, which spends the org's email allowance and the domain's sending reputation. A single shared rate limit, like the testimonial form's `testimonial-submit` key, would also let a bot lock real visitors out.

## Decision

1. **An LWC and Apex, not Web-to-Lead.** `c-contact-form` sits on the home page after the timeline. It asks for first name, last name, email, an optional company and a message, shows a one line privacy note, and thanks the visitor inline ("Thanks, check your inbox") with no redirect. When the address ends in `#contact` the form scrolls into view and focuses its heading, so a footer link needs to know nothing about the page.
2. **The guest checks, a platform event saves.** `ContactFormController` runs as the site guest. It validates the input, then runs `SubmissionGuard`, then publishes one `Contact_Form_Submission__e`. `ContactFormSubmissionTrigger` runs as the Automated Process user and `ContactFormLeadWriter` inserts the Lead in system mode with `Database.DMLOptions`: the default assignment rule, the auto-response only when the event asks for it, the assignment notification email, and duplicates allowed so a returning visitor is never refused. `LeadSource` is "Portfolio Website". The site guest has no Lead permission at all.
3. **Abuse protection before anything is published.** `SubmissionGuard`, shared with the testimonial form, drops a filled honeypot, a submit faster than a person can type and any sender on the `Submission_Block__c` blocklist (an email, a domain or a keyword in the text) silently: the visitor sees the normal thanks, and nothing is stored or sent. Over 20 contact form Leads in 24 hours the visitor is told to try tomorrow or use LinkedIn. The auto-response is asked for only on the first message from an address in 24 hours. The "Block sender" quick action on Lead adds a sender to the blocklist from the desktop or the mobile app and marks the Lead as spam.
4. **The reminder fallback.** `LeadReminderService` stamps two reply reminder times on the Lead, one and two business days after it arrives, counted on the org's default Business Hours. The `Lead_Contact_Form_Reminders` flow sends a custom notification to the owner's desktop and the Salesforce mobile app on arrival, then at each reminder time while the Lead is still "Open - Not Contacted", not spam and not converted.
5. **Nothing is lost.** A Lead insert that fails is retried by the event bus three times. After that the message is kept as a `Contact_Form_Failure__c` row with the reason, and the `Portfolio_Admin` users get a custom notification.
6. **What stays out of source.** The Lead assignment rule and the Lead auto-response rule hold the owner's user and sending address, so they are created in each org by `.claude\playwright\round-7\e5-email-rules.js` with the owner signed in (owner answer 3). Both email templates are in source with no address in them.

## Rationale

- **On platform.** The Lead, the standard assignment and auto-response rules, the custom notification and the flow are all ordinary Salesforce features an admin can read and change.
- **The same pattern as the testimonial form.** Server validation, a honeypot, a time check and the blocklist now guard both public forms through one class.
- **No cross domain post and no third party script.** The form posts to the site's own Apex, so the site's content security policy and the "no third party script" rule stay as they are.
- **The same Lead rules as Web-to-Lead.** `DMLOptions` asks for exactly the rules Web-to-Lead would run.
- **Why the platform event.** Proved in a scratch org on 2026-10-23: a Lead inserted in the guest's own context with the auto-response rule active fails with `INSUFFICIENT_ACCESS_ON_CROSS_REFERENCE_ENTITY` on the rule's sending user. With only the assignment rule active the same insert works. The trigger's Automated Process user can send it, and the auto-response reached a test inbox from that context.
- **Why no automatic IP blocking.** The review asked for an automatic block on one source sending from three or more addresses in a day, using a salted hash of the visitor's IP. In a guest request `Auth.SessionManagement.getCurrentSession()` ends the request with "Guest users must never have a session ID created", and an IP the browser sends could be faked. So no server side IP is used. `IP Hash` stays on the blocklist as a type the owner can add by hand.

## Alternatives considered

| Option                                                                  | Rejected because                                                                                                                                                                                                                                                                                                            |
| :---------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web-to-Lead                                                             | It posts from the site to a separate Salesforce endpoint, carries the org Id in the page, has no way to run the shared blocklist or the per address auto-response limit before the Lead exists, and redirects the visitor away from the page. It is also an odd fit on an Experience Cloud site that can call its own Apex. |
| A guest Screen Flow                                                     | A flow's Create Records element has no way to set `DMLOptions`, so the assignment and auto-response rules would not run. The blocklist and rate checks would also be flow logic duplicated from the testimonial form's Apex.                                                                                                |
| LWC and Apex inserting the Lead in the guest's own context              | The first version. The auto-response rule fails in that context, as above.                                                                                                                                                                                                                                                  |
| Sending the auto-response from Apex with `Messaging.SingleEmailMessage` | It would bypass the auto-response rule the owner wanted, and every send would count against the single email allowance. Not tried.                                                                                                                                                                                          |

## Implications

- The form shows the same thanks whether a message was saved or dropped, so a bot learns nothing. A real visitor whose address is blocked by mistake is not told. The owner lifts a block by clearing its Active box.
- The Lead is saved a moment after the visitor sees the thanks, not in the same request. A visitor never sees a save error from the trigger.
- The reminders count weekends until the org's default Business Hours are set to the owner's working days, because a new org's default hours are 24 hours a day, 7 days a week.
- The auto-response did not change the `SingleEmail`, `MassEmail` or `DailyWorkflowEmails` figures that `sf org list limits` reports in the scratch org. Which daily allowance it does count against is not established here.
- The auto-response rule entry has no Reply-To field in Setup, so replies go to the sending address. In production that is the verified organization wide address.
- Cloudflare Turnstile stays the next step if abuse appears. It is out of scope because it brings back a third party script.

## Amendment (2026-10-23): the form has its own page

The form moved from the home page to its own route, `/contact` (page title "Contact | Ryan Bumstead"), with the heading "Get in touch" and a short intro. The home page keeps a one line "Get in touch" prompt, `c-contact-call`, with a link styled as a button to `/contact`. The header gains a Contact item, and the footer's Contact link points at `/contact`. An old `/#contact` address sends the visitor on to `/contact`, replacing the history entry. The form's own behaviour, its guard, the platform event and the Lead rules are unchanged. Each answered submit sends `contact_form_submitted` with only its outcome (Technical Guide §2.16).
