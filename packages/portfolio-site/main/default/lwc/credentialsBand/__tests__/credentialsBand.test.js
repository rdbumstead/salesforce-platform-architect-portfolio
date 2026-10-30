/**
 * @description       : Unit tests for credentialsBand LWC: the degree tile with and without a
 *                      field of study, the certification tiles exactly as the read sends them
 *                      (newest first, ties by name, caption from issuer and year, the issuer
 *                      prefix dropped), the badge image attributes, the plain tile on a null
 *                      badge file and on an image error, the verify button, and nothing on an
 *                      error or with no data.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 10/30/2026
 **/
import { createElement } from "@lwc/engine-dom";
import CredentialsBand, {
  buildCertifications,
  initialsOf,
  shortCertificationName
} from "c/credentialsBand";
import getTimeline from "@salesforce/apex/ResumeController.getTimeline";

jest.mock(
  "@salesforce/resourceUrl/Certification_Badges",
  () => ({ __esModule: true, default: "/resource/Certification_Badges" }),
  { virtual: true }
);

jest.mock(
  "@salesforce/apex/ResumeController.getTimeline",
  () => {
    const { createApexTestWireAdapter } = require("@salesforce/sfdx-lwc-jest");
    return { default: createApexTestWireAdapter(jest.fn()) };
  },
  { virtual: true }
);

const VERIFY = "https://trailhead.example.com/credentials?id=1";

function cert(id, name, earnedDate, badgeFile = `${id}.webp`) {
  return { id, name, issuer: "Salesforce", earnedDate, badgeFile };
}

// Seven active certifications, newest first in the order the server sends. A retired one is
// never in the read, so none is in the fixture.
const SEVEN = [
  cert("c1", "Salesforce Certified Data 360 Consultant", "2025-03-17"),
  cert("c2", "Salesforce Certified Education Cloud Consultant", "2025-03-12"),
  cert("c3", "Salesforce Certified Agentforce Specialist", "2025-01-03"),
  cert("c4", "Marketing Cloud Engagement Foundations", "2025-01-03"),
  cert("c5", "Salesforce Certified Platform App Builder", "2024-09-30"),
  cert("c6", "Salesforce Certified Platform Administrator II", "2024-07-22"),
  cert("c7", "Salesforce Certified Platform Administrator", "2024-06-19")
];

const SCHOOL = {
  key: "e1",
  school: "Metropolitan Community College",
  credential: "Associate's Degree",
  fieldOfStudy: "General Studies",
  completedDate: "2025-05-01"
};

const TIMELINE = {
  work: [],
  education: [SCHOOL],
  certifications: SEVEN,
  verificationUrl: VERIFY
};

function text(node) {
  return node.textContent.replace(/\s+/g, " ").trim();
}

async function renderWith(timeline = TIMELINE) {
  const element = createElement("c-credentials-band", { is: CredentialsBand });
  document.body.appendChild(element);
  getTimeline.emit(timeline);
  await Promise.resolve();
  return element;
}

function one(element, id) {
  return element.shadowRoot.querySelector(`[data-id="${id}"]`);
}

function many(element, id) {
  return Array.from(element.shadowRoot.querySelectorAll(`[data-id="${id}"]`));
}

describe("c-credentials-band", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    jest.clearAllMocks();
  });

  describe("helpers", () => {
    it("drops the issuer prefix only when it leads and something follows", () => {
      expect(
        shortCertificationName(
          "Salesforce Certified Platform Administrator",
          "Salesforce"
        )
      ).toBe("Platform Administrator");
      expect(
        shortCertificationName("Marketing Cloud Foundations", "Salesforce")
      ).toBe("Marketing Cloud Foundations");
      expect(
        shortCertificationName("Salesforce Certified ", "Salesforce")
      ).toBe("Salesforce Certified");
    });

    it("takes up to two initials", () => {
      expect(initialsOf("Platform Administrator II")).toBe("PA");
      expect(initialsOf("Agentforce")).toBe("A");
      expect(initialsOf("")).toBe("");
    });

    it("orders by date then name and marks a failed image", () => {
      const tiles = buildCertifications(
        [
          cert("b", "Beta", "2025-01-01"),
          cert("a", "Alpha", "2025-01-01"),
          cert("z", "Zulu", "2026-01-01")
        ],
        ["a"],
        "/r"
      );
      expect(tiles.map((tile) => tile.full)).toEqual(["Zulu", "Alpha", "Beta"]);
      expect(tiles[1].hasImage).toBe(false);
      expect(tiles[2].src).toBe("/r/b.webp");
    });
  });

  describe("education", () => {
    it("shows the credential, the field and a caption of school and year", async () => {
      const element = await renderWith();
      expect(text(one(element, "degree-text"))).toBe(
        "Associate's Degree, General Studies"
      );
      expect(text(one(element, "degree-caption"))).toBe(
        "Metropolitan Community College · 2025"
      );
      expect(one(element, "degree-tile").querySelector("svg")).not.toBeNull();
      expect(one(element, "degree-tile").querySelector("img")).toBeNull();
    });

    it("shows just the credential when the field is blank", async () => {
      const element = await renderWith({
        ...TIMELINE,
        education: [{ ...SCHOOL, fieldOfStudy: "" }]
      });
      expect(text(one(element, "degree-text"))).toBe("Associate's Degree");
      const none = await renderWith({
        ...TIMELINE,
        education: [{ ...SCHOOL, fieldOfStudy: null }]
      });
      expect(text(one(none, "degree-text"))).toBe("Associate's Degree");
    });
  });

  describe("certifications", () => {
    it("shows exactly the seven it receives, newest first", async () => {
      const element = await renderWith();
      const tiles = many(element, "cert-tile");
      expect(tiles).toHaveLength(7);
      expect(many(element, "cert-text").map(text)).toEqual([
        "Data 360 Consultant",
        "Education Cloud Consultant",
        "Agentforce Specialist",
        "Marketing Cloud Engagement Foundations",
        "Platform App Builder",
        "Platform Administrator II",
        "Platform Administrator"
      ]);
    });

    it("builds the caption from the issuer and the year", async () => {
      const element = await renderWith();
      const captions = many(element, "cert-caption").map(text);
      expect(captions[0]).toBe("Salesforce · 2025");
      expect(captions[6]).toBe("Salesforce · 2024");
      const other = await renderWith({
        ...TIMELINE,
        certifications: [
          { ...SEVEN[0], issuer: "Example Institute", name: "Data Analyst" }
        ]
      });
      expect(text(one(other, "cert-caption"))).toBe("Example Institute · 2025");
    });

    it("breaks a date tie by name, whatever order the read sends", async () => {
      const element = await renderWith({
        ...TIMELINE,
        certifications: [SEVEN[3], SEVEN[2]]
      });
      expect(many(element, "cert-text").map(text)).toEqual([
        "Agentforce Specialist",
        "Marketing Cloud Engagement Foundations"
      ]);
    });

    it("sets the badge source, size, alt and loading", async () => {
      const element = await renderWith();
      const first = many(element, "badge")[0];
      expect(many(element, "badge")).toHaveLength(7);
      expect(first.getAttribute("src")).toBe(
        "/resource/Certification_Badges/c1.webp"
      );
      expect(first.getAttribute("alt")).toBe(
        "Salesforce Certified Data 360 Consultant"
      );
      expect(first.getAttribute("width")).toBe("86");
      expect(first.getAttribute("height")).toBe("84");
      expect(first.getAttribute("loading")).toBe("lazy");
      expect(first.getAttribute("decoding")).toBe("async");
    });

    it("shows the plain tile with initials on a null badge file", async () => {
      const element = await renderWith({
        ...TIMELINE,
        certifications: [{ ...SEVEN[6], badgeFile: null }, SEVEN[0]]
      });
      expect(many(element, "badge")).toHaveLength(1);
      expect(many(element, "fallback")).toHaveLength(1);
      expect(text(one(element, "fallback"))).toBe("PA");
    });

    it("swaps to the plain tile when an image fails to load", async () => {
      const element = await renderWith();
      many(element, "badge")[2].dispatchEvent(new CustomEvent("error"));
      await Promise.resolve();
      expect(many(element, "badge")).toHaveLength(6);
      expect(many(element, "fallback")).toHaveLength(1);
      expect(many(element, "cert-tile")).toHaveLength(7);
    });
  });

  describe("verify button", () => {
    it("opens the link in a new tab, safely", async () => {
      const element = await renderWith();
      const link = one(element, "verify");
      expect(text(link)).toContain("Verify on Trailhead");
      expect(link.getAttribute("href")).toBe(VERIFY);
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    });

    it("is hidden on a null link and on one that is not http or https", async () => {
      expect(
        one(await renderWith({ ...TIMELINE, verificationUrl: null }), "verify")
      ).toBeNull();
      expect(
        one(
          await renderWith({
            ...TIMELINE,
            verificationUrl: "ftp://files.example.com/badge"
          }),
          "verify"
        )
      ).toBeNull();
    });
  });

  describe("rendering", () => {
    it("keeps both headings in the band", async () => {
      const element = await renderWith();
      expect(text(one(element, "education-heading"))).toBe("Education");
      expect(text(one(element, "certification-heading"))).toBe(
        "Certifications"
      );
    });

    it("renders nothing on an error", async () => {
      const element = createElement("c-credentials-band", {
        is: CredentialsBand
      });
      document.body.appendChild(element);
      getTimeline.error();
      await Promise.resolve();
      expect(element.shadowRoot.querySelector(".band")).toBeNull();
    });

    it("renders nothing with neither certifications nor education", async () => {
      const element = await renderWith({
        work: [],
        education: [],
        certifications: [],
        verificationUrl: VERIFY
      });
      expect(element.shadowRoot.querySelector(".band")).toBeNull();
    });

    it("still renders one side when the other is empty", async () => {
      const element = await renderWith({ ...TIMELINE, certifications: [] });
      expect(many(element, "cert-tile")).toHaveLength(0);
      expect(many(element, "degree-tile")).toHaveLength(1);
    });
  });
});
