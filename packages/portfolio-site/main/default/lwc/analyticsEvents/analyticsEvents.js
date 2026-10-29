/**
 * @description       : The "Analytics events" control in the footer. A button with this visit's
 *                      event count opens a native modal dialog that lists the events the page has
 *                      sent since it loaded, newest first: the name, the params as key and value,
 *                      the local time and how it went. The list comes from c/analyticsService
 *                      (recentEvents and onAnalyticsEvent) and updates live while the dialog is
 *                      open. One line at the top says what the list is: the site's head script
 *                      passes the events to Google Analytics 4, and they hold no personal data,
 *                      because every param is a fixed word, a number or the name of a thing the
 *                      page itself offers, never text a visitor typed. An empty list says so.
 *                      Focus moves into the dialog, Tab stays inside it, and Escape, Close or a
 *                      click on the backdrop closes it and returns focus to the button, as
 *                      c/viewSource does. Opening sends analytics_events_opened with the count.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 10/29/2026
 * @Test Class        : analyticsEvents.test.js
 **/
import { LightningElement } from "lwc";
import {
  EVENTS,
  OUTCOMES,
  onAnalyticsEvent,
  recentEvents,
  trackEvent
} from "c/analyticsService";

/** Every visible string of the component. */
export const WORDING = Object.freeze({
  BUTTON: "Analytics events",
  HEADING: "Analytics events",
  CLOSE: "Close",
  EXPLANATION:
    "These are the events this page has sent since you arrived. The site's head script passes them to Google Analytics 4. They hold no personal data, only which part of the page you used.",
  EMPTY: "No events yet in this visit. Use the page and they will appear here.",
  LIST_LABEL: "Events, newest first",
  NO_PARAMS: "no params",
  SENT_HEAD_SCRIPT: "sent by the head script",
  SENT_GTAG: "sent to gtag",
  NOT_SENT: "not sent, no analytics tag on this page"
});

const OUTCOME_WORDS = Object.freeze({
  [OUTCOMES.HEAD_SCRIPT]: WORDING.SENT_HEAD_SCRIPT,
  [OUTCOMES.GTAG]: WORDING.SENT_GTAG,
  [OUTCOMES.NOT_SENT]: WORDING.NOT_SENT
});

function formatTime(time) {
  try {
    return time.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  } catch {
    return "";
  }
}

export default class AnalyticsEvents extends LightningElement {
  words = WORDING;
  isOpen = false;
  events = [];
  focusOnRender;
  stopListening;

  connectedCallback() {
    this.events = recentEvents();
    this.stopListening = onAnalyticsEvent(() => {
      this.events = recentEvents();
    });
  }

  disconnectedCallback() {
    if (this.stopListening) {
      this.stopListening();
      this.stopListening = undefined;
    }
  }

  get buttonLabel() {
    return `${WORDING.BUTTON} (${this.events.length})`;
  }

  get isEmpty() {
    return this.events.length === 0;
  }

  get rows() {
    return this.events
      .slice()
      .reverse()
      .map((entry) => {
        const keys = Object.keys(entry.params);
        return {
          key: String(entry.id),
          name: entry.name,
          time: formatTime(entry.time),
          outcome: OUTCOME_WORDS[entry.outcome] || entry.outcome,
          hasParams: keys.length > 0,
          noParams: WORDING.NO_PARAMS,
          params: keys.map((param) => ({
            key: param,
            value: String(entry.params[param])
          }))
        };
      });
  }

  handleOpen() {
    const count = this.events.length;
    this.isOpen = true;
    this.focusOnRender = ".dialog-heading";
    trackEvent(EVENTS.ANALYTICS_EVENTS_OPENED, { count });
  }

  handleClose() {
    // isOpen goes false first, so the focusout that close() fires is not pulled back.
    this.isOpen = false;
    this.focusOnRender = ".open-button";
    const dialog = this.template.querySelector("dialog");
    if (dialog && dialog.open && typeof dialog.close === "function") {
      dialog.close();
    }
  }

  /** The browser's own Escape on a modal dialog: close it our way so focus returns. */
  handleCancel(event) {
    event.preventDefault();
    this.handleClose();
  }

  /** A click on the dialog element itself, outside its body, is a click on the backdrop. */
  handleDialogClick(event) {
    if (event.target === event.currentTarget) {
      this.handleClose();
    }
  }

  showDialog() {
    const dialog = this.template.querySelector("dialog");
    if (!dialog || dialog.open) {
      return;
    }
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
  }

  renderedCallback() {
    if (this.isOpen) {
      this.showDialog();
    }
    if (!this.focusOnRender) {
      return;
    }
    const target = this.template.querySelector(this.focusOnRender);
    this.focusOnRender = undefined;
    if (target) {
      target.focus();
    }
  }

  /** Brings focus back to the first stop when it leaves the open dialog by any route. */
  handleDialogFocusOut(event) {
    const dialog = this.template.querySelector("dialog");
    const next = event.relatedTarget;
    if (!this.isOpen || !dialog || (next && dialog.contains(next))) {
      return;
    }
    const first = this.template.querySelector(".close-button");
    if (first) {
      first.focus();
    }
  }

  /** Escape closes. Tab and Shift+Tab wrap between Close and the scrolling list. */
  handleDialogKeydown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.handleClose();
      return;
    }
    if (event.key !== "Tab") {
      return;
    }
    const first = this.template.querySelector(".close-button");
    const last = this.template.querySelector(".event-list") || first;
    const active = this.template.activeElement;
    const heading = this.template.querySelector(".dialog-heading");
    if (event.shiftKey && (active === first || active === heading)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
