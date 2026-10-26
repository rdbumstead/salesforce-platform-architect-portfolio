# ADR-034: A Recruiter First Home Page

## Status

Draft (2026-10-26). Written before the home page is built, from the decision and the design notes. It becomes Accepted when the page is deployed and every line under Decision and Implications has been checked against the merged code. Until then, treat any sentence here as intent, not as a description of what runs.

## Context

The home page opened with the platform work: the pillars, the tour and the test counts. That suits a technical reviewer and it serves a hiring manager badly. A hiring manager has about a minute and wants four answers in one scroll: who this is, at what level, what he has solved, and who vouches for him. The platform work answers a different question, "can he build this well", and a reviewer who asks it will look for it.

The site also has two audiences who read it differently. A recruiter or hiring manager reads the first screen and one or two sections, and leaves. A technical reviewer reads deeper, opens the docs and the API reference, and checks claims against the source. The first design served only the second.

## Decision

1. **Order the home page for the recruiter.** The page reads in this order: the hero, the case studies, the testimonials, the contact call, then "How this site is built". Everything built before stays. Only the order and the first screen change.
2. **The hero answers who and what level.** The name is the page's main heading. A meta line gives the current employer title and the location. The title line below it, large and in the accent colour, states the specialty. One sentence says the value delivered. A short proof strip states years on the platform and the number of active certifications from one constant, so a stale figure is fixed in one place. Two buttons follow: one scrolls to the case studies and one opens the resume.
3. **Show what he has solved before what he has built.** Three case study cards each show a headline number with its label, the problem, the call made and the result. Client names are left out. Where a case study has a page of its own, the card links to it.
4. **The case study read never touches the featured flag.** The cards are chosen by their own sort number alone, at most three, in that order. The featured flag already drives the featured projects API path, the cover letter grounding and the pillar card order, so a card on the home page must never change what the API returns or what a generated letter says.
5. **The platform card reads a live number.** The card for this site takes its number from the newest deploy run, never from a number typed into the record, because a typed number goes stale.
6. **Vouching comes third.** Approved testimonials show when there are enough of them. While there are fewer than three, a strip of credentials takes the place, with a link to verify them, so the section never shows an empty wall.
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

- **Drafted before it is built.** The list below is the checklist for turning this record from Draft to Accepted. Each line is checked against the merged code and the deployed site first.
  - the home view order and the `case-studies` anchor
  - the case study read in `ProjectCardController` and its query definition record (ADR-033)
  - the fields on `Project__c` and the value sentence field on the owner Contact
  - the proof strip constant
  - the credentials strip and the three testimonial minimum
  - the header menu and the footer links
  - the home page title, description and structured data, and the link preview tags
- **Data lives in the org, not in the code.** The case study text, the title line and the value sentence are records the owner edits. They reach production through owner run scripts and never from CI.
- **Adding, reordering or retiring a case study** is a sort number change on a `Project__c` row, covered in the maintenance guide.
- **When every sort number is cleared,** the page shows no case study section and no empty heading.
- **Related decisions.** [ADR-033](033-queries-in-custom-metadata.md) governs the case study read. [ADR-032](032-operational-settings-in-custom-metadata.md) governs the testimonial minimum. [ADR-007](007-github-api-server-side-caching.md) governs the docs the build section links to.
