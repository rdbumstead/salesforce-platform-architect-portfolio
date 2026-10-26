# ADR-034: A Recruiter First Home Page

## Status

Accepted (2026-10-26). Checked against the merged home page: the view's component order, `ProjectCardController.getHomeCaseStudies`, the `Project__c` and `Contact` fields, the proof strip list, the credentials strip, the header and footer, and the head markup. The case study text, the title line and the value sentence are records the owner loads with scripts after the deploy, so until then the cards and the value sentence stay hidden by design.

## Context

The home page opened with the platform work: the pillars, the tour and the test counts. That suits a technical reviewer and it serves a hiring manager badly. A hiring manager has about a minute and wants four answers in one scroll: who this is, at what level, what he has solved, and who vouches for him. The platform work answers a different question, "can he build this well", and a reviewer who asks it will look for it.

The site also has two audiences who read it differently. A recruiter or hiring manager reads the first screen and one or two sections, and leaves. A technical reviewer reads deeper, opens the docs and the API reference, and checks claims against the source. The first design served only the second.

## Decision

1. **Order the home page for the recruiter.** The page reads in this order: the hero, the case studies, the testimonials, the contact call, then "How this site is built". Everything built before stays. Only the order and the first screen change.
2. **The hero answers who and what level.** The name is the page's main heading. A meta line gives the current employer title and the location. The title line below it, large and in the accent colour, states the specialty. One sentence says the value delivered, from `Contact.Value_Sentence__c`. The title line is `Contact.Hero_Line__c`. A short proof strip states years on the platform and the number of active certifications from one list, `PROOF_POINTS` in `c/pillarData`, so a stale figure is fixed in one place. Two buttons follow: one scrolls to the case studies and one opens the resume.
3. **Show what he has solved before what he has built.** Three case study cards each show a headline number with its label, the problem, the call made and the result. Client names are left out. Where a case study has a page of its own, the card links to it.
4. **The case study read never touches the featured flag.** The cards are chosen by their own sort number alone, at most three, in that order. The featured flag already drives the featured projects API path, the cover letter grounding and the pillar card order, so a card on the home page must never change what the API returns or what a generated letter says.
5. **The platform card reads a live number.** The card for this site takes its number from the newest successful deploy run that has a test count, through `Headline_Metric_Source__c`, never from a number typed into the record, because a typed number goes stale. The card for the employer hub takes its object count from the ERD the same way.
6. **Vouching comes third.** Approved testimonials show once the `Home_Testimonials_Min` setting (3) is met. Until then a strip takes the place: the count of active certifications, a link to verify them on Trailhead when the owner Contact holds a safe Trailhead address, and "References available on request". The section never shows an empty wall.
7. **The platform work moves one click deeper, and stays whole.** "How this site is built" holds the pillars, the architecture and decision records, the five minute tour and the live counts. The header's "How it's built" menu reaches the same places from every page. Nothing was deleted: the pillar case studies are still reached from this section, and their analytics events are kept.
8. **The home page does not repeat what the Delivery page proves.** The build section shows the counts and links to `/delivery`, where the by the numbers panel measures them and a closed section lists what each group of tests covers.
9. **Two titles, on purpose.** The meta line and the resume keep the employer's title, because that is what the employer calls the role. The title line states the specialty the owner sells. Neither claims more than the other.
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
- The platform work is the strongest evidence of the owner's skill, so it is moved, not cut. A reviewer who wants it finds it in one click, and the header reaches it from every page.
- Keeping the cards off the featured flag costs one more sort field on `Project__c` and removes a whole class of surprise edits.
- The proof strip is one constant, so the quarterly check in the maintenance guide has one place to look.

## Implications

- **What was built.** The home view holds `c-hero-banner`, `c-case-study-grid`, `c-home-testimonials`, `c-contact-call` and `c-site-build-section`, in that order. `c-case-study-grid` gives its host the id `case-studies` while it shows cards, and the hero button and the header's Work link scroll to it. The read is `ProjectCardController.getHomeCaseStudies`, with a `Query_Definition__mdt` record equal to its code default ([ADR-033](033-queries-in-custom-metadata.md)): `Home_Sort__c != NULL`, ordered by `Home_Sort__c` then name, at most three, system mode. The card fields on `Project__c` are `Home_Title__c`, `Client_Line__c`, `Case_Tags__c` and `Home_Sort__c`.
- **The head markup** carries the home title and description, the link preview tags and one Person structured data block. Its job title is the employer title.
- **Data lives in the org, not in the code.** The case study text, the title line and the value sentence are records the owner edits. They reach production through owner run scripts and never from CI.
- **Adding, reordering or retiring a case study** is a sort number change on a `Project__c` row, covered in the [Maintenance Guide](../guides/05-Maintenance-Guide.md).
- **When every sort number is cleared,** the page shows no case study section and no empty heading.
- **Related decisions.** [ADR-033](033-queries-in-custom-metadata.md) governs the case study read. [ADR-032](032-operational-settings-in-custom-metadata.md) governs the testimonial minimum. [ADR-007](007-github-api-server-side-caching.md) governs the docs the build section links to.
