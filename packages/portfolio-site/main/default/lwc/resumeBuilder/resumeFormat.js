/**
 * @description       : Pure helpers for resumeBuilder. They turn the ResumeController.getResume
 *                      payload (plan K1) into a preview view model and into one ordered list of
 *                      typed lines. The ATS text export and the PDF export both read that list,
 *                      so the two exports always carry the same content.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/21/2026
 **/

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

function clean(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function headerLinks(header) {
  return [
    { label: "LinkedIn", url: clean(header.linkedInUrl) },
    { label: "GitHub", url: clean(header.gitHubUrl) },
    { label: "Trailhead", url: clean(header.trailheadUrl) },
    { label: "Portfolio", url: clean(header.portfolioUrl) }
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

/**
 * Builds the preview view model. Keys are stable and unique so the template can
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

  const roles = (resume.roles || []).map((role, roleIndex) => ({
    key: role.id || `role-${roleIndex}`,
    title: clean(role.title),
    employer: clean(role.employer),
    heading: [clean(role.title), clean(role.employer)]
      .filter((part) => part)
      .join(", "),
    dateRange: formatDateRange(role),
    isRemote: role.isRemote === true,
    highlights: (role.highlights || []).map((text, index) => ({
      key: `${role.id || roleIndex}-h${index}`,
      text: clean(text)
    }))
  }));

  const skillGroups = options.includeSkills
    ? (resume.skillGroups || []).map((group, index) => ({
        key: `skills-${index}`,
        category: clean(group.category),
        skillsText: (group.skills || []).map(clean).join(", ")
      }))
    : [];

  const toCredentials = (list, prefix) =>
    (list || []).map((credential, index) => ({
      key: `${prefix}-${index}`,
      text: credentialLine(credential)
    }));

  const certifications = toCredentials(resume.certifications, "cert");
  const education = toCredentials(resume.education, "edu");

  return {
    header,
    roles,
    skillGroups,
    certifications,
    education,
    hasHeader: header !== null,
    hasRoles: roles.length > 0,
    hasSkills: skillGroups.length > 0,
    hasCertifications: certifications.length > 0,
    hasEducation: education.length > 0,
    isEmpty:
      header === null &&
      roles.length === 0 &&
      skillGroups.length === 0 &&
      certifications.length === 0 &&
      education.length === 0
  };
}

/**
 * Flattens the view model into typed lines. Kinds: name, title, meta, text,
 * heading, entry, detail, bullet, spacer.
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

  if (model.roles.length > 0) {
    section("Experience");
    model.roles.forEach((role, index) => {
      if (index > 0) {
        push("spacer", "");
      }
      push("entry", role.heading);
      push(
        "detail",
        role.isRemote ? `${role.dateRange} | Remote` : role.dateRange
      );
      role.highlights.forEach((highlight) => push("bullet", highlight.text));
    });
  }

  if (model.skillGroups.length > 0) {
    section("Skills");
    model.skillGroups.forEach((group) =>
      push(
        "text",
        group.category
          ? `${group.category}: ${group.skillsText}`
          : group.skillsText
      )
    );
  }

  if (model.certifications.length > 0) {
    section("Certifications");
    model.certifications.forEach((credential) => push("text", credential.text));
  }

  if (model.education.length > 0) {
    section("Education");
    model.education.forEach((credential) => push("text", credential.text));
  }

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

const PDF_STYLES = {
  name: { size: 18, style: "bold", after: 4 },
  title: { size: 12, style: "normal", after: 4 },
  meta: { size: 9, style: "normal", after: 2 },
  heading: { size: 11, style: "bold", after: 4, upper: true },
  entry: { size: 10.5, style: "bold", after: 2 },
  detail: { size: 9.5, style: "italic", after: 3 },
  bullet: { size: 10, style: "normal", after: 2, indent: 12 },
  text: { size: 10, style: "normal", after: 3 },
  spacer: { size: 10, style: "normal", after: 0 }
};

/**
 * Writes the lines into a jsPDF document as real text (selectable and readable by
 * parsers), wrapping long lines and adding pages as needed.
 */
export function writePdf(doc, lines) {
  const margin = 54;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const usableWidth = pageWidth - margin * 2;
  let y = margin;

  lines.forEach((line) => {
    const style = PDF_STYLES[line.kind] || PDF_STYLES.text;
    const lineHeight = style.size * 1.25;
    if (line.kind === "spacer") {
      y += lineHeight / 2;
      return;
    }
    doc.setFont("helvetica", style.style);
    doc.setFontSize(style.size);
    const indent = style.indent || 0;
    const text = style.upper ? line.text.toUpperCase() : line.text;
    const prefix = line.kind === "bullet" ? "- " : "";
    const wrapped = doc.splitTextToSize(prefix + text, usableWidth - indent);
    wrapped.forEach((part) => {
      if (y + lineHeight > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(part, margin + indent, y);
      y += lineHeight;
    });
    y += style.after;
  });
  return doc;
}

export function pdfFileName(model, persona) {
  const name = model && model.header && model.header.name;
  const base = (name || "Resume").replace(/[^A-Za-z0-9]+/g, "_");
  const suffix = persona ? `_${persona}` : "";
  return name ? `${base}_Resume${suffix}.pdf` : `${base}${suffix}.pdf`;
}
