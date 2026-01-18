import { LightningElement, api } from "lwc";

export default class UniversalMock extends LightningElement {
  // Basic Identifiers
  @api name;
  @api label;
  @api title;
  @api value;
  @api variant;
  @api iconName;
  @api placeholder;

  // Inputs & Toggles
  @api type;
  @api checked;
  @api disabled;
  @api required;
  @api readonly;
  @api messageToggleActive;
  @api messageToggleInactive;

  // Styling & Layout
  @api size;
  @api alternativeText;

  // Datatable/Lists
  @api columns;
  @api data;
  @api keyField;
  @api options;
}
