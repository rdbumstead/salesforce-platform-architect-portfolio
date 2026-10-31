# ADR-034: A Recruiter First Home Page

## Status

Accepted (2026-10-26), amended on 2026-10-26, 2026-10-27 and three times on 2026-10-30 (see the amendment sections, the last of which moves "How this site is built" to the Docs page and makes the tour the primary hero button). Checked against the merged home page: the view's component order, `ProjectCardController.getHomeCaseStudies`, the `Project__c` and `Contact` fields, the proof strip list, the credentials strip, the header and footer, and the head markup. The case study text, the title line and the value sentence are records I load with scripts after the deploy, so until then the cards and the value sentence stay hidden by design.

## Context

The home page opened with the platform work: the pillars, the tour and the test counts. That suits a technical reviewer and it serves a hiring manager badly. A hiring manager has about a minute and wants four answers in one scroll: who this is, at what level, what I have solved, and who vouches for me. The platform work answers a different question, "can he build this well", and a reviewer who asks it will look for it.

The site also has two audiences who read it differently. A recruiter or hiring manager reads the first screen and one or two sections, and leaves. A technical reviewer reads deeper, opens the docs and the API reference, and checks claims against the source. The first design served only the second.

## Decision

1. **Order the home page for the recruiter.** The page reads in this order: the hero, the case studies, the testimonials, the contact call, then "How this site is built". Everything built before stays. Only the order and the first screen change.
2. **The hero answers who and what level.** The name is the page's main heading. A meta line gives the current employer title and the location. The title line below it, large and in the accent colour, states the specialty. One sentence says the value delivered, from `Contact.Value_Sentence__c`. The title line is `Contact.Hero_Line__c`. A short proof strip states years on the platform and the number of active certifications from one list, `PROOF_POINTS` in `c/pillarData`, so a stale figure is fixed in one place. Two buttons follow: one scrolls to the case studies and one opens the resume.
3. **Show what I have solved before what I have built.** Three case study cards each show a headline number with its label, the problem, the call made and the result. Client names are left out. Where a case study has a page of its own, the card links to it.
4. **The case study read never touches the featured flag.** The cards are chosen by their own sort number alone, at most three, in that order. The featured flag already drives the featured projects API path, the cover letter grounding and the pillar card order, so a card on the home page must never change what the API returns or what a generated letter says.
5. **The platform card reads a live number.** The card for this site takes its number from the newest successful deploy run that has a test count, through `Headline_Metric_Source__c`, never from a number typed into the record, because a typed number goes stale. The card for the employer hub takes its object count from the ERD the same way.
6. **Vouching comes third.** Approved testimonials show once the `Home_Testimonials_Min` setting (3) is met. Until then a strip takes the place: the count of active certifications, a link to verify them on Trailhead when my Contact holds a safe Trailhead address, and "References available on request". The section never shows an empty wall.
7. **The platform work moves one click deeper, and stays whole.** "How this site is built" holds the pillars, the architecture and decision records, the five minute tour and the live counts. The header's "How it's built" menu reaches the same places from every page. Nothing was deleted: the pillar case studies are still reached from this section, and their analytics events are kept.
8. **The home page does not repeat what the Delivery page proves.** The build section shows the counts and links to `/delivery`, where the by the numbers panel measures them and a closed section lists what each group of tests covers.
9. **Two titles, on purpose.** The meta line and the resume keep the employer's title, because that is what the employer calls the role. The title line states the specialty I sell. Neither claims more than the other.
10. **The header follows the audience.** Work, Resume, How it's built and Contact. Skills and Testimonials move to the footer links, because they are second reads.

## Alternatives Considered

| Option                                        | Rejected because                                                                                               |
| :-------------------------------------------- | :------------------------------------------------------------------------------------------------------------- |
| Keep the platform work first                  | It answers the reviewer's question and not the recruiter's, and the recruiter leaves before the second screen. |
| Two home pages, one per audience              | Two pages to keep true, and a visitor cannot tell which to open. One page in one order serves both.            |
| Drive the cards from the featured flag        | The flag already moves the API, the letters and the pillar cards. A home card edit would change all three.     |
| Type the platform card's number into a record | It goes stale the next deploy. The live number cannot.                                                         |
| Hide the testimonials until there are enough  | The page would lose its third answer. The credentials strip answers it honestly until the wall fills.          |
| Move the platform work to a page of its own   | A reviewer would have to find it. The section keeps it on the home page, one click from the first screen.      |

## Rationale

- A first screen that answers the hiring manager's four questions is the only part most visitors read.
- The platform work is the strongest evidence of my skill, so it is moved, not cut. A reviewer who wants it finds it in one click, and the header reaches it from every page.
- Keeping the cards off the featured flag costs one more sort field on `Project__c` and removes a whole class of surprise edits.
- The proof strip is one constant, so the quarterly check in the maintenance guide has one place to look.

## Implications

- **What was built.** The home view holds `c-hero-banner`, `c-case-study-grid`, `c-home-testimonials`, `c-contact-call` and `c-site-build-section`, in that order. `c-case-study-grid` gives its host the id `case-studies` while it shows cards, and the hero button and the header's Work link scroll to it. The read is `ProjectCardController.getHomeCaseStudies`, with a `Query_Definition__mdt` record equal to its code default ([ADR-033](033-queries-in-custom-metadata.md)): `Home_Sort__c != NULL`, ordered by `Home_Sort__c` then name, at most three, system mode. The card fields on `Project__c` are `Home_Title__c`, `Client_Line__c`, `Case_Tags__c` and `Home_Sort__c`.
- **The head markup** carries the home title and description, the link preview tags and one Person structured data block. Its job title is the employer title.
- **Data lives in the org, not in the code.** The case study text, the title line and the value sentence are records I edit. They reach production through scripts I run and never from CI.
- **Adding, reordering or retiring a case study** is a sort number change on a `Project__c` row, covered in the [Maintenance Guide](../guides/05-Maintenance-Guide.md).
- **When every sort number is cleared,** the page shows no case study section and no empty heading.
- **Related decisions.** [ADR-033](033-queries-in-custom-metadata.md) governs the case study read. [ADR-032](032-operational-settings-in-custom-metadata.md) governs the testimonial minimum. [ADR-007](007-github-api-server-side-caching.md) governs the docs the build section links to.

## Amendment (2026-10-26): the order, the career line, compact cards and a Home link

This changes items 1, 3, 6 and 10 above. The other items stand.

- **Item 1, the order.** The page now reads: the hero, the career line (`c-career-line`), the case studies, the testimonials, "How this site is built" (which opens with the 5 minute tour), then the contact call. The contact call moved to the end, where a reader who has read everything decides to write.
- **Item 3, compact cards.** A card shows the headline number with its label, the title and the client line. The problem, the call and the result are no longer on the card. The full story lives on the page the card links to, and a card with no link is hidden. Case study E links to the Delivery page.
- **Item 6, no credentials strip.** Until three testimonials are approved the section renders nothing. The certifications and their verify link moved to the career line, and "References available on request" is in the contact call.
- **Item 10, the first link reads Home.** The header reads Home, Resume, How it's built and Contact. Home links to the home page from every page. On the home page it carries `aria-current="page"`, scrolls to the top and moves focus to the page content, the same landing as the Back to top arrow. The case studies scroll is the hero's button alone.
- **What was built.** The home view holds `c-hero-banner`, `c-career-line`, `c-case-study-grid`, `c-home-testimonials`, `c-site-build-section` and `c-contact-call`, in that order. The hero's "Short on time? Take the 5 minute tour" link opens the tour in the build section and sends `tour_opened`. `c-experience-timeline` is removed, and its three tabs became the career line's selector (All, Work, Education, Certifications), which sends `career_timeline_filtered`.

## Amendment (2026-10-27): the tour becomes a 10 minute journey

This changes item 7 and the hero link above. The other items stand.

- **Item 7, the tour leaves the build section.** "How this site is built" still holds the pillars, the architecture and decision records and the live counts, and it no longer holds a tour. The tour is now the 10 minute tour, an opt in journey across the five pillar pages. It starts from the hero's "Short on time? Take the 10 minute tour" link and from the first row of the header's "How it's built" menu, and runs in a bar under the header (`c-tour-bar`). Each stop has one task and a Show me button that scrolls to the control and focuses it. Stop minutes (A 2, B 3, C 1, D 3 and E 1) are in `c/pillarData`, and the total is computed.
- **Why 10, not 5.** The five minute tour overran. Two guest walks of the journey on production on 2026-10-27 (GA4 blocked, one letter and one API request per walk) modelled at about 6.9 minutes for a skimmer reading at 300 words a minute and 10.2 minutes for a careful reader at 200. The AI Lab (2.6 to 3.5 minutes) and Solution Architecture (1.8 to 2.7) stops ran longest. Reading speeds, orientation and action times are modelled, and mobile, WebKit and slow connections are not measured. The label now says 10, and the finish line is a measurement of the live journey after the deploy.
- **What stays.** The tour is opt in only, one session storage key says it is running, and nothing goes in the address. `tour_opened` stays in the event list for past data and is no longer sent. The journey sends `tour_step_viewed`, `tour_exited` and `tour_finished`.
- **Detail.** [Technical Guide 2.20](../guides/04-Technical-Guide.md#220-the-10-minute-tour-c-tour-bar).

## Amendment (2026-10-27): Skills and Testimonials return to the header

This changes the header list in item 10. The other items stand.

- **The header reads Home, Resume, Skills, How it's built, Testimonials and Contact.** Skills and Testimonials left the header on 2026-10-26 for the footer, and I want both one click from any page again: Skills is the evidence a recruiter looks for first, and Testimonials is where a reference can leave a quote. The footer keeps its links too.
- **Fit.** Six items and the menu fit on one line from 768 px only with the links a little closer, so the link padding narrows from 12 to 8 px between 768 and 899 px. The brand, the divider, the Back to top arrow and the theme button do not move. Phones keep the menu button, which lists the same six.

## Amendment (2026-10-30): separate card numbers and the deploy success rate

This changes item 5 and the card number rule. The other items stand.

- **The home cards have their own number.** The three case study cards on the home page used to share the Headline fields with the pillar cards in "How this site is built", so the same three numbers showed twice on one page. `Project__c` now has `Case_Metric__c`, `Case_Metric_Label__c` and `Case_Metric_Source__c`. `getHomeCaseStudies` reads them, and `getPillarCards` keeps reading the Headline fields. The source rule is the same for both.
- **A blank Case metric shows no number.** It never falls back to the Headline metric. A card with no number still shows its title and client line.
- **Item 5, the live number.** Item 5 says the platform card takes its number from the newest successful deploy run. That still holds for the pillar cards, which keep reading the Headline fields. The home case card for the delivery work reads the Case fields and uses the new source value "Production deploys", a live success rate over the retained `deploy` runs in `Pipeline_Run__c`. The label fills `{n}` with the successful runs, `{total}` with every retained deploy run and `{recovery}` with a clause on how fast failures were fixed. The clause is empty when nothing failed or the latest failure has no later successful deploy. Like every live source, it is never typed into the record, because a typed number goes stale.
- **The values.** My data script sets them after the deploy: the Employer Hub card reads "8 steps of a partner inquiry, mapped end to end from the web form to the leadership dashboard", the Nonprofit card keeps "$0", and the Delivery card shows the live rate. The build section's nonprofit row reads "3 platforms scored on 10 weighted criteria in a live decision matrix".
- **The tour line.** The hero's link now reads "Have 10 minutes? Take the guided tour", with the minutes computed from `TOUR_MINUTES`. The header menu row keeps "Take the 10 minute tour".
- **Detail.** [Technical Guide 2.12](../guides/04-Technical-Guide.md#212-home-page).

## Amendment (2026-10-30): the home page rebuild, work and credentials apart

This changes items 1, 3, 6 and 8, and the career line from the 2026-10-26 amendment. The other items stand.

- **Item 1, the order.** The page now reads: the hero, the case studies, the work timeline (`c-career-line`), the credentials band (`c-credentials-band`), the testimonials, "How this site is built", then the contact call. Work comes after the case studies, because a reader who has seen what I solved then wants to know where. The testimonials and the build section stay on the home page as cards, after the credentials and before the contact call. Every home component reads one width, `var(--portfolio-content-width, 1024px)`, set once on the theme layout.
- **The career line is work only.** The line that held employers, certifications and the school, with a selector, is replaced. Each employer is one stop on a single track, and a disclosure on the stop opens its roles in place. Several can be open at once, and Expand all and Collapse all open and close them together. The stop shows the newest role that is not part time, and part time roles show inside the disclosure, labelled. `Experience__c.Is_Part_Time__c` says which, because nothing held that before. Each role shows up to three one line highlights, from the new `Experience_Highlight__c.Timeline_Text__c` (Text 70), or the highlight's description until that copy is written. The earlier roles still fold into one last stop. The filter, the "Show all" list for phones and the certifications and school on the line are gone. This reverses the 2026-10-29 rule that nothing on the line opens, which I set when the line was plain points.
- **Item 6, the credentials move to a band.** The certifications and the school have their own section, with the school on the left and the certifications on the right. Each certification is a tile with its badge image, its name and a caption of its issuer and year. The image is a file in the `Certification_Badges` static resource named by the new `Certification__c.Badge_File__c`, so a new certification needs a record and a file and no code change. A certification with no file, or with an image that fails, shows a plain tile. One "Verify on Trailhead" button replaces the link that sat under the line. The testimonials rule in item 6 is unchanged.
- **Item 3, the cards.** A case study card shows its engagement line from `Client_Line__c` and a "Read the case study" button, the first one primary and the others secondary, and the whole card is no longer one stretched link. A framing line above them says client names are left out. The build section and the testimonials use the same card style. In the build section each live pillar is a card with its stat as the big number and one "Open" button, and the case study no longer opens in place.
- **Item 8, the counts move to the hero.** The build section no longer shows the live test counts or the links to the architecture and the guest access section. A proof panel in the hero shows the counts in one line and holds the two buttons, "Architecture and decisions" and "How a request reaches the data". The hero's line under the headline is the value sentence, with a written fallback when the record is blank, and the certification chip counts the active certifications from the timeline read, so it stays right when a certification is added or retired.
- **Data.** `getTimeline` adds `work[].isPartTime`, `work[].highlights` and `certifications[].badgeFile`, and renames or removes nothing, so `getResume` and the resume page do not move. The three new fields are read in the same query definitions the timeline already used ([ADR-033](033-queries-in-custom-metadata.md)). The values reach production through data scripts I run, so until they are loaded the credentials show plain tiles and the long highlights are cut to one line.
- **Analytics.** The career line sends `career_role_opened` {`position`} when a stop opens and `career_timeline_toggled` {`expanded`} from Expand all and Collapse all. `career_timeline_filtered` and `career_timeline_show_all` stay in the event list for past data and are no longer sent. `case_study_opened` stays too and nothing sends it.
- **Detail.** [Technical Guide 2.12](../guides/04-Technical-Guide.md#212-home-page).

## Amendment (2026-10-30, later): the build section moves to the Docs page

This changes items 1 and 7 and the hero's button order. The other items stand.

- **Item 1, the order.** The home page now reads: the hero, the case studies, the work timeline, the credentials band, the testimonials, then the contact call. "How this site is built" leaves it, because on the home page it repeated the hero's proof panel and its two architecture buttons.
- **Item 7, where the platform work sits.** "How this site is built" (`c-site-build-section`) is on the Docs view, in the same column as `c-docs-viewer` and above it. A visitor who clicks "Architecture and decisions" in the hero sees the five pillar cards first and the diagrams right below them. The cards, their live numbers and the Open buttons are unchanged. The Apex test count reads "1,350 Apex tests", with a comma, the same as the hero. The heading is an `h2`, because the docs viewer holds the page's one `h1`.
- **The link in the section's intro** opens "how a visitor's request reaches the data" in place on the Docs page. It sets the address and fires `popstate`, which the docs viewer already listens for, so nothing reloads and the viewer is not changed. On any other page it is a plain link.
- **The hero's buttons.** The 10 minute tour is the one primary button and comes first. "See the case studies" is secondary. The proof panel's two buttons stay secondary.
- **One heading style.** The case studies, work timeline, credentials band, testimonials and build section share one heading and heading row style (`c/sectionHeading`), imported by CSS, so the headings cannot drift apart. The work heading had no style of its own and rendered as small plain text.
- **The work timeline.** Highlights and earlier roles wrap instead of ending in an ellipsis. Inside one employer, roles that read the same years put the full time role first. The first 2026-10-30 amendment said each highlight is held to one line, and that no longer holds.
- **Detail.** [Technical Guide 2.12](../guides/04-Technical-Guide.md#212-home-page).

## Amendment (2026-10-31): the Docs page reads title, cards, then documents

- **Item 7, the order on /docs.** The page title and lead come first, then the five pillar cards, then the document list. `c-docs-viewer` places `c-site-build-section` itself in its list view, after its `h1` and lead, so the Docs view holds only the viewer. I chose this over a separate page intro component because the viewer's title is already the page's one `h1` and opening a document moves focus to a document title that is also an `h1`. A second `h1` would have meant demoting every document heading. The outline is `h1` "Architecture docs", `h2` "How this site is built", `h3` for each card, then the `h2` document group titles. An open document and "Document not found" show their own `h1` and no cards. The in place guest access link still sets the address and fires `popstate`.
