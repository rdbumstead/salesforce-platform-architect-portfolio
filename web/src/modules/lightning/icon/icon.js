import { LightningElement, api } from "lwc";
import { iconFor, sizeFor, SIZES } from "./icons";

/**
 * Native stand in for lightning-icon. It draws the SVG for each icon name the site uses,
 * at the platform sizes, with the platform tile colour for standard and custom icons.
 * With no alternative text the icon is decorative and hidden from assistive technology.
 * With alternative text the SVG stays hidden and the text is read out, as the platform does.
 * A name the site does not use, or one the platform has no symbol for, draws nothing.
 */
export default class Icon extends LightningElement {
  @api iconName;
  @api size;
  @api alternativeText;
  @api variant;

  get icon() {
    return iconFor(this.iconName);
  }

  get hasIcon() {
    return !!this.icon;
  }

  get viewBox() {
    return this.icon.viewBox;
  }

  get paths() {
    return this.icon.paths.map((p, i) => ({
      key: `${this.iconName}:${i}`,
      d: p.d,
      fill: p.fill || null
    }));
  }

  get boundaryStyle() {
    const bg = this.icon.background;
    return bg
      ? `background-color: var(--slds-c-icon-color-background, ${bg})`
      : "";
  }

  get svgStyle() {
    const edge = SIZES[sizeFor(this.size)];
    const fill = this.icon.fill;
    return `width: ${edge}rem; height: ${edge}rem;${fill ? ` fill: ${fill};` : ""}`;
  }
}
