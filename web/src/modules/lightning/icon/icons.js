/**
 * The icons the site uses, copied from what the live Salesforce site serves.
 * Utility paths come from its utility sprite (/portfolio/assets/icons/utility-sprite/svg/symbols.svg).
 * The standard, custom and doctype paths come from the SVG that lightning-icon renders on
 * /skills, /ai-lab and /resume. Colours are the branded values the live site shows.
 * utility:code is not in the platform sprite, so the platform draws nothing for it and so do we.
 */
const UTILITY_FILL = "#667085";

export const ICONS = {
  "utility:apex": {
    viewBox: "0 0 520 520",
    fill: UTILITY_FILL,
    paths: [
      {
        d: "M485 400H215c-8 0-15 7-15 15v30c0 8 7 15 15 15h270c8 0 15-7 15-15v-30c0-8-7-15-15-15M254 218L60 63c-6-5-15-4-20 3L23 90c-5 7-3 16 3 21l138 110a10 10 0 010 16L26 347c-6 5-8 15-3 21l17 26c5 7 14 8 20 3l194-155c8-6 8-18 0-24"
      }
    ]
  },
  "utility:knowledge_base": {
    viewBox: "0 0 520 520",
    fill: UTILITY_FILL,
    paths: [
      {
        d: "M95 350h130c8 0 15-7 15-15V100c0-17-18-30-32-30H95c-8 0-15 7-15 15v250c0 8 7 15 15 15m397-234c-6-2-12 3-12 10v249c0 8-7 15-15 15H55c-8 0-15-7-15-15V127c0-7-8-12-14-9a46 46 0 00-26 42v230a40 40 0 0040 40h165c8 0 15 7 15 15s7 15 15 15h50c8 0 15-7 15-15s7-15 15-15h165a40 40 0 0040-40V160c0-21-7-39-28-44M295 350h130c8 0 15-7 15-15V85c0-8-7-15-15-15H312c-15 0-32 13-32 30v235c0 8 7 15 15 15"
      }
    ]
  },
  "standard:invocable_action": {
    viewBox: "0 0 1000 1000",
    fill: "#ffffff",
    background: "#107cad",
    paths: [
      {
        d: "M628 712v78c0 6 5 11 11 11l6-2 151-123c2-2 3-5 3-8s-2-6-4-8L644 531l-5-1c-6 0-11 5-11 11v83c-93 25-169-57-169-57-2-2-5-3-8-3-6 0-11 5-11 11v2c38 157 188 135 188 135M382 589l-2-7v-9c0-39 32-71 71-71 19 0 36 7 50 21l1 1 1 1c9 10 35 31 66 40v-25c0-39 32-71 71-71 15 0 25 4 32 8l7 3 6 5 85 72a112 112 0 00-80-190h-6v-10c0-62-51-113-113-113-30 0-56 11-76 30-16-42-57-74-106-74a114 114 0 00-98 170c-50 12-86 56-86 110 0 61 47 110 108 112h74c-4-1-4-2-5-3"
      }
    ]
  },
  "custom:custom15": {
    viewBox: "0 0 1000 1000",
    fill: "#ffffff",
    background: "#f77e75",
    paths: [
      {
        d: "M700 461c-35-15-40-28-40-42 0-15 10-28 22-39 21-19 32-45 32-75 0-56-35-105-98-105-54 0-87 36-96 82-1 4 1 8 4 10 45 32 73 86 73 151 0 45-15 86-43 117-4 5-3 13 4 16 17 7 37 17 57 28 6 4 13 6 20 6h115c28 0 50-22 50-49v-8c0-45-49-70-100-92M521 626c-42-17-48-33-48-50s12-33 26-46c24-22 38-52 38-88 0-66-42-123-116-123s-116 57-116 123c0 36 13 66 38 88 14 12 26 29 26 46s-6 32-48 50c-61 25-119 54-120 107v9c0 32 27 58 60 58h319c33 0 60-26 60-58v-9c0-53-58-82-119-107"
      }
    ]
  },
  "doctype:pdf": {
    viewBox: "0 0 56 64",
    paths: [
      {
        d: "M37 0l19 20v38c0 3.31-2.69 6-6 6H6c-3.31 0-6-2.69-6-6V6c0-3.31 2.69-6 6-6h31z",
        fill: "#8e030f"
      },
      { d: "M37 0l19 20v1H44c-3.87 0-7-3.13-7-7V0z", fill: "#640103" },
      { d: "M43 20h13L37 0v14c0 3.31 2.69 6 6 6z", fill: "#feb8ab" },
      {
        d: "M14.8 49.2h-3.3v4.1c0 .4-.3.7-.8.7-.4 0-.7-.3-.7-.7V43.1c0-.6.5-1.1 1.1-1.1h3.7c2.4 0 3.8 1.7 3.8 3.6 0 2-1.4 3.6-3.8 3.6zm-.1-5.9h-3.2v4.6h3.2c1.4 0 2.4-.9 2.4-2.3s-1-2.3-2.4-2.3zM25.1 54h-3c-.6 0-1.1-.5-1.1-1.1v-9.8c0-.6.5-1.1 1.1-1.1h3c3.7 0 6.2 2.6 6.2 6s-2.4 6-6.2 6zm0-10.7h-2.6v9.3h2.6c2.9 0 4.6-2.1 4.6-4.7.1-2.5-1.6-4.6-4.6-4.6zm16.3 0h-5.8v3.9h5.7c.4 0 .6.3.6.7s-.3.6-.6.6h-5.7v4.8c0 .4-.3.7-.8.7-.4 0-.7-.3-.7-.7V43.1c0-.6.5-1.1 1.1-1.1h6.2c.4 0 .6.3.6.7.1.3-.2.6-.6.6z",
        fill: "#ffffff"
      }
    ]
  }
};

/** Edge length in rem for each lightning-icon size. */
export const SIZES = {
  "xx-small": 0.875,
  "x-small": 1,
  small: 1.5,
  medium: 2,
  large: 3
};

export function iconFor(name) {
  return (name && ICONS[name]) || null;
}

export function sizeFor(size) {
  return SIZES[size] ? size : "medium";
}
