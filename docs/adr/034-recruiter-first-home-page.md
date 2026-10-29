# ADR-034: A Recruiter First Home Page

## Status

Accepted (2026-10-26), amended the same day (see the last section). Checked against the merged home page: the view's component order, `ProjectCardController.getHomeCaseStudies`, the `Project__c` and `Contact` fields, the proof strip list, the credentials strip, the header and footer, and the head markup. The case study text, the title line and the value sentence are records I load with scripts after the deploy, so until then the cards and the value sentence stay hidden by design.

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
