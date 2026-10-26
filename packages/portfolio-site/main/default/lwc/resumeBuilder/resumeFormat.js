/**
 * @description       : Pure helpers for resumeBuilder. They turn the ResumeController.getResume
 *                      payload into one view model. The preview renders that model, the ATS text
 *                      export reads it as typed lines (buildLines), and the PDF writer (writePdf)
 *                      draws it with the sizes, spacing, colours and section order in
 *                      resumeLayout.js, which the preview reads too. So the preview, the PDF and
 *                      the ATS text carry the same sections, roles and certification groups.
 *                      Past roles with no highlights for the persona fold into one "Earlier roles"
 *                      line at the end of Experience.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/21/2026
 **/
import { toExternalUrl } from "c/externalUrl";
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

function headerLinks(header) {
  return [
    { label: "LinkedIn", url: toExternalUrl(header.linkedInUrl) },
    { label: "GitHub", url: toExternalUrl(header.gitHubUrl) },
    { label: "Trailhead", url: toExternalUrl(header.trailheadUrl) },
    { label: "Portfolio", url: toExternalUrl(header.portfolioUrl) }
  ].filter((link) => link.url);
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

function toRole(role, roleIndex) {
  const dateRange = formatDateRange(role);
  const isRemote = role.isRemote === true;
  return {
    key: role.id || `role-${roleIndex}`,
    title: clean(role.title),
    employer: clean(role.employer),
    heading: [clean(role.title), clean(role.employer)]
      .filter((part) => part)
      .join(", "),
    dateRange,
    datesText: isRemote
      ? `${dateRange} | ${RESUME_LAYOUT.labels.remote}`
      : dateRange,
    isRemote,
    isCurrent: role.isCurrent === true,
    yearRange: formatYearRange(role),
    highlights: (role.highlights || [])
      .map((text, index) => ({
        key: `${role.id || roleIndex}-h${index}`,
        text: clean(text)
      }))
      .filter((highlight) => highlight.text)
  };
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
        push("entry", role.heading);
        push("detail", role.datesText);
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
 * Breaks text into lines no wider than the widths given, measured with the document's current
 * font. The first line can be narrower, for a bold label or a date in the same row.
 */
function wrapText(doc, text, firstWidth, restWidth) {
  const words = String(text)
    .split(/\s+/)
    .filter((word) => word);
  const lines = [];
  let current = "";
  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    const limit = lines.length === 0 ? firstWidth : restWidth;
    if (current && doc.getTextWidth(candidate) > limit) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  });
  if (current || lines.length === 0) {
    lines.push(current);
  }
  return lines;
}

/**
 * Draws the model into a jsPDF document as real text (selectable, in reading order), with the
 * sizes, spacing, colours and section order from resumeLayout.js. A role, a skill group and the
 * header never split across pages, and a section or Retired title always has its first entry
 * under it. Links are clickable. When trace is an array, every drawn piece is pushed onto it as
 * { section, kind, text } in drawing order.
 * @param {object} doc a jsPDF document in points
 * @param {object} model the view model from buildViewModel
 * @param {object} options { family, trace }: the registered font family (the spec's fallback
 *                 when not given) and an optional trace array
 * @returns {object} the document
 */
export function writePdf(doc, model, options = {}) {
  const layout = RESUME_LAYOUT;
  const family = options.family || layout.font.fallback;
  const trace = Array.isArray(options.trace) ? options.trace : null;
  const { type, space, colors, marks } = layout;
  const margin = layout.page.margin;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const width = pageWidth - margin * 2;
  const bottom = pageHeight - margin;
  const blocks = [];
  let section = "header";

  const setType = (style) => {
    doc.setFont(family, style.bold ? "bold" : "normal");
    doc.setFontSize(style.size);
  };
  const lineOf = (style) => style.size * layout.lineHeight;
  const measure = (text, style) => {
    setType(style);
    return doc.getTextWidth(text);
  };
  const shown = (text, style) => (style.upper ? text.toUpperCase() : text);

  // A row is one line box: its height and the pieces drawn in it, x absolute, y from its top.
  const textRow = (pieces, style, extra = 0) => ({
    height: lineOf(style) + extra,
    pieces: pieces.map((piece) => ({ ...piece, style: piece.style || style }))
  });
  const block = (rows, after, keepWithNext = false) => {
    blocks.push({ rows, after, keepWithNext, section });
  };

  const paragraph = (kind, text, style, indent = 0) => {
    setType(style);
    return wrapText(doc, text, width - indent, width - indent).map((part) =>
      textRow([{ kind, text: part, x: margin + indent }], style)
    );
  };

  const labelled = (kind, label, text, style, labelStyle) => {
    const labelText = `${label}:`;
    const labelWidth = measure(`${labelText} `, labelStyle);
    setType(style);
    return wrapText(doc, text, width - labelWidth, width).map((part, index) =>
      textRow(
        index === 0
          ? [
              {
                kind: `${kind}-label`,
                text: labelText,
                x: margin,
                style: labelStyle
              },
              { kind, text: part, x: margin + labelWidth }
            ]
          : [{ kind, text: part, x: margin }],
        style
      )
    );
  };

  // Header: centred name, title and links side by side, then the summary with no heading.
  if (model.header) {
    const rows = [];
    const centred = (kind, text, style) => {
      const textWidth = measure(text, style);
      return textRow(
        [{ kind, text, x: margin + (width - textWidth) / 2 }],
        style,
        space.headerGap
      );
    };
    if (model.header.name) {
      rows.push(centred("name", model.header.name, type.name));
    }
    if (model.header.title) {
      rows.push(centred("title", model.header.title, type.title));
    }
    if (model.header.links.length) {
      const separator = marks.linkSeparator;
      const gap = space.linkGap;
      const separatorWidth = measure(separator, type.links);
      const widths = model.header.links.map((link) =>
        measure(link.label, type.links)
      );
      const total =
        widths.reduce((sum, value) => sum + value, 0) +
        (widths.length - 1) * (separatorWidth + gap * 2);
      let x = margin + (width - total) / 2;
      const pieces = [];
      model.header.links.forEach((link, index) => {
        if (index > 0) {
          pieces.push({ kind: "separator", text: separator, x: x + gap });
          x += separatorWidth + gap * 2;
        }
        pieces.push({ kind: "link", text: link.label, x, url: link.url });
        x += widths[index];
      });
      rows.push(textRow(pieces, type.links, space.headerGap));
    }
    if (model.header.careerObjective) {
      const summary = paragraph(
        "summary",
        model.header.careerObjective,
        type.summary
      );
      summary[0].height += space.summaryBefore;
      summary[0].offset = space.summaryBefore;
      rows.push(...summary);
    }
    block(rows, space.headerAfter);
  }

  model.sections.forEach((entry) => {
    section = entry.title;
    if (blocks.length > 0) {
      blocks.push({ spacer: space.sectionBefore });
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
      model.roles.forEach((role) => {
        const datesWidth = measure(role.datesText, type.roleDates);
        setType(type.roleHeading);
        const rows = wrapText(
          doc,
          role.heading,
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
        block(rows, space.roleAfter);
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
      model.currentCertifications.forEach((cert) =>
        block(paragraph("cert", cert.text, type.text), space.itemGap)
      );
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
        blocks.push({ spacer: space.subheadingBefore });
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

  // Pagination and drawing, one block at a time.
  const heightOf = (item) =>
    item.rows.reduce((sum, row) => sum + row.height, 0);
  let y = margin;
  let page = 1;
  let onPage = false;
  const newPage = () => {
    doc.addPage();
    page += 1;
    y = margin;
    onPage = false;
  };
  const drawRow = (row, label) => {
    const top = y + (row.offset || 0);
    row.pieces.forEach((piece) => {
      const style = piece.style;
      setType(style);
      const baseline = top + lineOf(style) / 2 + style.size * 0.35;
      if (piece.url) {
        doc.setTextColor(colors.link);
        doc.textWithLink(piece.text, piece.x, baseline, { url: piece.url });
      } else {
        doc.setTextColor(colors.ink);
        doc.text(piece.text, piece.x, baseline);
      }
      if (trace) {
        trace.push({
          section: label,
          kind: piece.kind,
          text: piece.text,
          page,
          y: Math.round(baseline)
        });
      }
    });
    if (row.rule) {
      const ruleY = top + row.height - space.ruleWidth / 2;
      doc.setDrawColor(colors.rule);
      doc.setLineWidth(space.ruleWidth);
      doc.line(margin, ruleY, margin + width, ruleY);
    }
    y += row.height;
    onPage = true;
  };

  blocks.forEach((item, index) => {
    if (item.spacer) {
      if (onPage) {
        y += item.spacer;
      }
      return;
    }
    let needed = heightOf(item);
    if (item.keepWithNext) {
      const next = blocks.slice(index + 1).find((candidate) => candidate.rows);
      if (next) {
        needed += item.after + heightOf(next);
      }
    }
    if (onPage && y + needed > bottom) {
      newPage();
    }
    item.rows.forEach((row) => {
      if (onPage && y + row.height > bottom) {
        newPage();
      }
      drawRow(row, item.section);
    });
    y += item.after;
  });
  return doc;
}

export function pdfFileName(model, persona) {
  const name = model && model.header && model.header.name;
  const base = (name || "Resume").replace(/[^A-Za-z0-9]+/g, "_");
  const suffix = persona ? `_${persona}` : "";
  return name ? `${base}_Resume${suffix}.pdf` : `${base}${suffix}.pdf`;
}
