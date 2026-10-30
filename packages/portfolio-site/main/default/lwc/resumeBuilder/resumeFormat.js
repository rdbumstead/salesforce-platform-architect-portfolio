/**
 * @description       : Pure helpers for resumeBuilder. They turn the ResumeController.getResume
 *                      payload into one view model. The preview renders that model, the ATS text
 *                      export reads it as typed lines (buildLines), and the PDF writer (writePdf)
 *                      draws it through c/documentPdf's block writer with the sizes, spacing,
 *                      colours and section order in resumeLayout.js, which the preview reads too.
 *                      So the preview and the PDF carry the same sections, employers and
 *                      certification groups. Experience groups roles by employer name (the read
 *                      carries no employer Id). An employer with several roles is a heading with
 *                      its overall span and each title under it, newest first, with its own dates
 *                      and highlights. An employer with one role reads as one "Title, Employer"
 *                      block. Certifications on the page and the PDF are one flat list per
 *                      issuer, newest first, as the short name and the year under the issuer
 *                      label. The ATS text does not stack: one line per role with the employer
 *                      repeated ("Title | Employer | dates") and certifications by their full
 *                      names. Past roles with no highlights for the persona fold into one
 *                      "Earlier roles" line at the end of Experience.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/21/2026
 **/
import { headerLinks } from "c/profileLinks";
import { createPdfWriter, fileNamePart, wrapText } from "c/documentPdf";
import { RESUME_LAYOUT } from "./resumeLayout";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec"
];

/**
 * Formats an Apex Date ("YYYY-MM-DD") as "Mon YYYY" without going through the
 * browser time zone, which can move a first-of-month date into the previous month.
 */
export function formatMonthYear(value) {
  if (!value) {
    return "";
  }
  const match = /^(\d{4})-(\d{2})/.exec(String(value));
  if (!match) {
    return String(value);
  }
  const monthIndex = Number(match[2]) - 1;
  const month = MONTHS[monthIndex];
  return month ? `${month} ${match[1]}` : match[1];
}

export function formatDateRange(role) {
  const start = formatMonthYear(role.startDate);
  const end =
    role.isCurrent || !role.endDate ? "Present" : formatMonthYear(role.endDate);
  return start ? `${start} - ${end}` : end;
}

function yearOf(value) {
  const match = /^(\d{4})/.exec(value ? String(value) : "");
  return match ? match[1] : "";
}

/**
 * The years of an earlier role: "2017 to 2021", or one year when it starts and ends in the
 * same year or only one end is known.
 */
export function formatYearRange(role) {
  const start = yearOf(role.startDate);
  const end = yearOf(role.endDate);
  if (start && end && start !== end) {
    return `${start} to ${end}`;
  }
  return start || end;
}

function clean(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function credentialLine(credential) {
  return [
    clean(credential.name),
    clean(credential.detail),
    clean(credential.issuer),
    formatMonthYear(credential.dateValue)
  ]
    .filter((part) => part)
    .join(", ");
}

const HTTP_URL = /^https?:\/\//i;

/**
 * The verification link. The href is the stored value exactly, never
 * trimmed, encoded or rebuilt, so a plus sign in the query string stays a plus sign. Only an
 * http or https value becomes a link.
 */
function verificationUrl(value) {
  return typeof value === "string" && HTTP_URL.test(value) ? value : null;
}

function byNewestDate(left, right) {
  const leftDate = left.dateValue ? String(left.dateValue) : "";
  const rightDate = right.dateValue ? String(right.dateValue) : "";
  if (leftDate === rightDate) {
    return 0;
  }
  return leftDate < rightDate ? 1 : -1;
}

/**
 * The certification block: the current ones newest first with name, issuer and
 * earned month and year, then the retired ones with name and date only.
 */
function certificationBlock(list) {
  const all = list || [];
  const current = all
    .filter((credential) => credential.isRetired !== true)
    .sort(byNewestDate)
    .map((credential, index) => ({
      key: `current-cert-${index}`,
      text: [
        clean(credential.name),
        clean(credential.issuer),
        formatMonthYear(credential.dateValue)
      ]
        .filter((part) => part)
        .join(", ")
    }));
  const retired = all
    .filter((credential) => credential.isRetired === true)
    .sort(byNewestDate)
    .map((credential, index) => ({
      key: `retired-cert-${index}`,
      text: [clean(credential.name), formatMonthYear(credential.dateValue)]
        .filter((part) => part)
        .join(", ")
    }));
  return { current, retired };
}

/**
 * The certification name without the issuer's own prefix: "Salesforce Certified Data 360
 * Consultant" under the issuer "Salesforce" becomes "Data 360 Consultant". A name that does not
 * start with the issuer is kept whole.
 */
export function shortCertName(name, issuer) {
  const full = clean(name);
  const vendor = clean(issuer);
  if (!vendor || !full.toLowerCase().startsWith(vendor.toLowerCase() + " ")) {
    return full;
  }
  const rest = full
    .slice(vendor.length)
    .trim()
    .replace(/^certified\s+/i, "")
    .trim();
  return rest || full;
}

/**
 * The current certifications grouped by issuer, in order of first appearance (so newest first),
 * each group one flat list "Short Name (Year)" newest first.
 */
function certificationGroupsByIssuer(list) {
  const groups = [];
  const byKey = new Map();
  (list || [])
    .filter((credential) => credential.isRetired !== true)
    .sort(byNewestDate)
    .forEach((credential, index) => {
      const issuer = clean(credential.issuer);
      const groupKey = issuer.toLowerCase();
      if (!byKey.has(groupKey)) {
        const group = {
          key: `cert-group-${groups.length}`,
          issuer,
          hasIssuer: issuer !== "",
          certifications: []
        };
        byKey.set(groupKey, group);
        groups.push(group);
      }
      const year = yearOf(credential.dateValue);
      const short = shortCertName(credential.name, issuer);
      byKey.get(groupKey).certifications.push({
        key: `cert-${index}`,
        text: year ? `${short} (${year})` : short
      });
    });
  return groups;
}

function toRole(role, roleIndex) {
  const dateRange = formatDateRange(role);
  const isRemote = role.isRemote === true;
  const datesText = isRemote
    ? `${dateRange} | ${RESUME_LAYOUT.labels.remote}`
    : dateRange;
  return {
    key: role.id || `role-${roleIndex}`,
    title: clean(role.title),
    employer: clean(role.employer),
    heading: [clean(role.title), clean(role.employer)]
      .filter((part) => part)
      .join(", "),
    dateRange,
    datesText,
    isRemote,
    isCurrent: role.isCurrent === true,
    startDate: role.startDate ? String(role.startDate) : "",
    endDate: role.endDate ? String(role.endDate) : "",
    atsLine: [clean(role.title), clean(role.employer), datesText]
      .filter((part) => part)
      .join(" | "),
    yearRange: formatYearRange(role),
    highlights: (role.highlights || [])
      .map((text, index) => ({
        key: `${role.id || roleIndex}-h${index}`,
        text: clean(text)
      }))
      .filter((highlight) => highlight.text)
  };
}

function byNewestRole(left, right) {
  if (left.startDate !== right.startDate) {
    return left.startDate < right.startDate ? 1 : -1;
  }
  const leftEnd = left.isCurrent ? "9999-99" : left.endDate;
  const rightEnd = right.isCurrent ? "9999-99" : right.endDate;
  if (leftEnd === rightEnd) {
    return 0;
  }
  return leftEnd < rightEnd ? 1 : -1;
}

/**
 * Groups roles by employer name, in order of first appearance. Inside a group the roles run
 * newest first. A group of several roles carries the overall span, earliest start to latest
 * end, or "Present" when any role in it is current or has no end. A role with no employer
 * stands alone. Highlights stay on their own role.
 */
function groupByEmployer(roles) {
  const groups = [];
  const byKey = new Map();
  roles.forEach((role, index) => {
    const name = role.employer;
    const groupKey = name ? name.toLowerCase() : `none-${index}`;
    if (!byKey.has(groupKey)) {
      const group = {
        key: `employer-${groups.length}`,
        employer: name,
        roles: []
      };
      byKey.set(groupKey, group);
      groups.push(group);
    }
    byKey.get(groupKey).roles.push(role);
  });
  return groups.map((group) => {
    const members = group.roles.slice().sort(byNewestRole);
    const starts = members
      .map((role) => role.startDate)
      .filter(Boolean)
      .sort();
    const ends = members
      .map((role) => role.endDate)
      .filter(Boolean)
      .sort();
    const open = members.some((role) => role.isCurrent || !role.endDate);
    const spanText = formatDateRange({
      startDate: starts[0],
      endDate: open ? null : ends[ends.length - 1],
      isCurrent: open
    });
    return {
      key: group.key,
      employer: group.employer,
      spanText,
      isSingle: members.length === 1,
      isStacked: members.length > 1,
      roles: members
    };
  });
}

/**
 * The one line for the past roles with no highlights: "Title, Employer (2017 to 2021)" for
 * each, joined by a middle dot.
 */
function earlierRolesText(roles) {
  return roles
    .map((role) => {
      return role.yearRange
        ? `${role.heading} (${role.yearRange})`
        : role.heading;
    })
    .join(" · ");
}

function sectionList(model) {
  const has = {
    experience: model.hasRoles,
    skills: model.hasSkills,
    certifications: model.hasCertifications,
    education: model.hasEducation
  };
  return RESUME_LAYOUT.sections
    .filter((key) => has[key])
    .map((key) => ({
      key,
      title: RESUME_LAYOUT.labels[key],
      className: `resume-section resume-${key}`,
      isExperience: key === "experience",
      isSkills: key === "skills",
      isCertifications: key === "certifications",
      isEducation: key === "education"
    }));
}

/**
 * Builds the view model. Keys are stable and unique so the template can
 * iterate without collisions when two highlights or skills share the same text.
 */
export function buildViewModel(resume, options) {
  if (!resume) {
    return null;
  }
  const header =
    options.includeHeader && resume.header
      ? {
          name: clean(resume.header.name),
          title: clean(resume.header.title),
          careerObjective: clean(resume.header.careerObjective),
          links: headerLinks(resume.header).map((link) => ({
            ...link,
            key: link.label
          }))
        }
      : null;

  const allRoles = (resume.roles || []).map(toRole);
  const roles = allRoles.filter(
    (role) => role.isCurrent || role.highlights.length > 0
  );
  const earlier = allRoles.filter(
    (role) => !role.isCurrent && role.highlights.length === 0
  );

  const skillGroups = options.includeSkills
    ? (resume.skillGroups || []).map((group, index) => ({
        key: `skills-${index}`,
        category: clean(group.category),
        labelText: clean(group.category) ? `${clean(group.category)}: ` : "",
        skillsText: (group.skills || []).map(clean).join(", ")
      }))
    : [];

  const certificationGroups = certificationBlock(resume.certifications);
  const certificationCount =
    certificationGroups.current.length + certificationGroups.retired.length;
  const education = (resume.education || []).map((credential, index) => ({
    key: `edu-${index}`,
    text: credentialLine(credential)
  }));
  const verifyUrl = verificationUrl(resume.credentialVerificationUrl);

  const model = {
    header,
    roles,
    employers: groupByEmployer(roles),
    earlierRoles: earlier.length
      ? {
          label: RESUME_LAYOUT.labels.earlierRoles,
          labelText: `${RESUME_LAYOUT.labels.earlierRoles}: `,
          text: earlierRolesText(earlier),
          count: earlier.length
        }
      : null,
    skillGroups,
    currentCertifications: certificationGroups.current,
    certificationGroups: certificationGroupsByIssuer(resume.certifications),
    retiredCertifications: certificationGroups.retired,
    verificationUrl: verifyUrl,
    verifyLabel: RESUME_LAYOUT.labels.verify,
    retiredLabel: RESUME_LAYOUT.labels.retired,
    education,
    hasHeader: header !== null,
    hasRoles: allRoles.length > 0,
    hasEarlierRoles: earlier.length > 0,
    hasSkills: skillGroups.length > 0,
    hasCertifications: certificationCount > 0,
    hasCurrentCertifications: certificationGroups.current.length > 0,
    hasRetiredCertifications: certificationGroups.retired.length > 0,
    hasVerificationLink:
      verifyUrl !== null && certificationGroups.current.length > 0,
    hasEducation: education.length > 0,
    isEmpty:
      header === null &&
      allRoles.length === 0 &&
      skillGroups.length === 0 &&
      certificationCount === 0 &&
      education.length === 0
  };
  model.sections = sectionList(model);
  return model;
}

/**
 * Flattens the view model into typed lines for the ATS text, sections in the spec's order.
 * Kinds: name, title, meta, text, heading, subheading, entry, detail, bullet, spacer.
 */
export function buildLines(model) {
  const lines = [];
  if (!model) {
    return lines;
  }
  const push = (kind, text) => lines.push({ kind, text });
  const section = (title) => {
    if (lines.length > 0) {
      push("spacer", "");
    }
    push("heading", title);
  };

  if (model.header) {
    if (model.header.name) {
      push("name", model.header.name);
    }
    if (model.header.title) {
      push("title", model.header.title);
    }
    model.header.links.forEach((link) =>
      push("meta", `${link.label}: ${link.url}`)
    );
    if (model.header.careerObjective) {
      section("Summary");
      push("text", model.header.careerObjective);
    }
  }

  model.sections.forEach((entry) => {
    section(entry.title);
    if (entry.isExperience) {
      model.roles.forEach((role, index) => {
        if (index > 0) {
          push("spacer", "");
        }
        push("entry", role.atsLine);
        role.highlights.forEach((highlight) => push("bullet", highlight.text));
      });
      if (model.earlierRoles) {
        if (model.roles.length > 0) {
          push("spacer", "");
        }
        push("text", `${model.earlierRoles.label}: ${model.earlierRoles.text}`);
      }
    } else if (entry.isSkills) {
      model.skillGroups.forEach((group) =>
        push(
          "text",
          group.category
            ? `${group.category}: ${group.skillsText}`
            : group.skillsText
        )
      );
    } else if (entry.isCertifications) {
      model.currentCertifications.forEach((cert) => push("text", cert.text));
      if (model.hasVerificationLink) {
        push("text", `${model.verifyLabel}: ${model.verificationUrl}`);
      }
      if (model.hasRetiredCertifications) {
        push("subheading", model.retiredLabel);
        model.retiredCertifications.forEach((cert) => push("text", cert.text));
      }
    } else if (entry.isEducation) {
      model.education.forEach((credential) => push("text", credential.text));
    }
  });

  return lines;
}

/**
 * Plain text for applicant tracking systems: no tables, no columns, upper case
 * section headings and "- " bullets.
 */
export function toAtsText(lines) {
  return lines
    .map((line) => {
      if (line.kind === "heading") {
        return line.text.toUpperCase();
      }
      if (line.kind === "bullet") {
        return `- ${line.text}`;
      }
      return line.text;
    })
    .join("\n");
}

/**
 * Draws the model into a jsPDF document as real text (selectable, in reading order), with the
 * sizes, spacing, colours and section order from resumeLayout.js, through the shared block
 * writer in c/documentPdf. A role, a skill group and the header never split across pages, and
 * a section or Retired title always has its first entry under it. Links are clickable. When
 * trace is an array, every drawn piece is pushed onto it as { section, kind, text, page, y } in
 * drawing order.
 * @param {object} doc a jsPDF document in points
 * @param {object} model the view model from buildViewModel
 * @param {object} options { family, trace }: the registered font family (the spec's fallback
 *                 when not given) and an optional trace array
 * @returns {object} the document
 */
export function writePdf(doc, model, options = {}) {
  const layout = RESUME_LAYOUT;
  const writer = createPdfWriter(doc, {
    family: options.family,
    trace: options.trace,
    layout
  });
  const { type, space, marks } = layout;
  const { margin, width, textRow, block, paragraph, labelled, measure, shown } =
    writer;

  // Header: centred name, title and links side by side, then the summary with no heading.
  writer.header(model.header);

  model.sections.forEach((entry) => {
    writer.setSection(entry.title);
    if (writer.blockCount > 0) {
      writer.spacer(space.sectionBefore);
    }
    const titleRow = textRow(
      [
        {
          kind: "section",
          text: shown(entry.title, type.sectionTitle),
          x: margin
        }
      ],
      type.sectionTitle,
      space.ruleGap + space.ruleWidth
    );
    titleRow.rule = true;
    block([titleRow], space.sectionTitleAfter, true);

    if (entry.isExperience) {
      model.employers.forEach((group) => {
        if (group.isStacked) {
          const spanWidth = measure(group.spanText, type.roleDates);
          writer.setType(type.roleHeading);
          const employerRows = wrapText(
            doc,
            group.employer || "",
            width - spanWidth - space.linkGap * 2,
            width
          ).map((part, index) =>
            textRow(
              index === 0
                ? [
                    { kind: "employer", text: part, x: margin },
                    {
                      kind: "dates",
                      text: group.spanText,
                      x: margin + width - spanWidth,
                      style: type.roleDates
                    }
                  ]
                : [{ kind: "employer", text: part, x: margin }],
              type.roleHeading
            )
          );
          block(employerRows, space.itemGap, true);
        }
        group.roles.forEach((role) => {
          const heading = group.isStacked ? role.title : role.heading;
          const datesWidth = measure(role.datesText, type.roleDates);
          writer.setType(type.roleHeading);
          const rows = wrapText(
            doc,
            heading,
            width - datesWidth - space.linkGap * 2,
            width
          ).map((part, index) =>
            textRow(
              index === 0
                ? [
                    { kind: "role", text: part, x: margin },
                    {
                      kind: "dates",
                      text: role.datesText,
                      x: margin + width - datesWidth,
                      style: type.roleDates
                    }
                  ]
                : [{ kind: "role", text: part, x: margin }],
              type.roleHeading
            )
          );
          role.highlights.forEach((highlight) => {
            const bulletRows = paragraph(
              "bullet",
              highlight.text,
              type.bullet,
              space.bulletIndent
            );
            bulletRows[0].pieces.unshift({
              kind: "marker",
              text: marks.bullet,
              x: margin + space.bulletMarker,
              style: type.bullet
            });
            bulletRows[bulletRows.length - 1].height += space.itemGap;
            rows.push(...bulletRows);
          });
          block(rows, group.isStacked ? space.itemGap : space.roleAfter);
        });
        if (group.isStacked) {
          writer.spacer(space.roleAfter - space.itemGap);
        }
      });
      if (model.earlierRoles) {
        block(
          labelled(
            "earlier",
            model.earlierRoles.label,
            model.earlierRoles.text,
            type.text,
            type.label
          ),
          space.itemGap
        );
      }
    } else if (entry.isSkills) {
      model.skillGroups.forEach((group) => {
        block(
          group.category
            ? labelled(
                "skill",
                group.category,
                group.skillsText,
                type.text,
                type.label
              )
            : paragraph("skill", group.skillsText, type.text),
          space.itemGap
        );
      });
    } else if (entry.isCertifications) {
      model.certificationGroups.forEach((group) => {
        if (group.hasIssuer) {
          block(
            [
              textRow(
                [
                  {
                    kind: "cert-issuer",
                    text: shown(group.issuer, type.label),
                    x: margin
                  }
                ],
                type.label
              )
            ],
            space.itemGap,
            true
          );
        }
        group.certifications.forEach((cert) =>
          block(paragraph("cert", cert.text, type.text), space.itemGap)
        );
      });
      if (model.hasVerificationLink) {
        block(
          [
            textRow(
              [
                {
                  kind: "verify",
                  text: model.verifyLabel,
                  x: margin,
                  url: model.verificationUrl
                }
              ],
              type.text
            )
          ],
          space.itemGap
        );
      }
      if (model.hasRetiredCertifications) {
        writer.spacer(space.subheadingBefore);
        block(
          [
            textRow(
              [
                {
                  kind: "retired-title",
                  text: shown(model.retiredLabel, type.subheading),
                  x: margin
                }
              ],
              type.subheading
            )
          ],
          space.itemGap,
          true
        );
        model.retiredCertifications.forEach((cert) =>
          block(paragraph("retired", cert.text, type.text), space.itemGap)
        );
      }
    } else if (entry.isEducation) {
      model.education.forEach((credential) =>
        block(paragraph("education", credential.text, type.text), space.itemGap)
      );
    }
  });

  return writer.draw();
}

export function pdfFileName(model, persona) {
  const name = model && model.header && model.header.name;
  const base = fileNamePart(name || "Resume", "_");
  const suffix = persona ? `_${persona}` : "";
  return name ? `${base}_Resume${suffix}.pdf` : `${base}${suffix}.pdf`;
}
