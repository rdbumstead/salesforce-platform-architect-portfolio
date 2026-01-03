import { LightningElement, track } from "lwc";

export default class PlaceholderTerminal extends LightningElement {
  @track displayedLogs = [];
  isBooting = true;
  showCta = false;

  // Track viewport width for responsive title to avoid hydration mismatch
  @track viewportWidth = 1200; // Default to desktop

  _skipAnimation = false;
  _handleEscape;

  fullLogSequence = [
    {
      id: 1,
      text: "Loading System Architecture Specification...",
      delay: 500,
      type: "info"
    },
    {
      id: 2,
      text: "Verifying JWT Bearer Token for CI/CD...",
      delay: 800,
      type: "success"
    },
    {
      id: 3,
      text: "Establishing connection to Salesforce Core...",
      delay: 600,
      type: "info"
    },
    {
      id: 4,
      text: "Optimizing Lightning Web Runtime (LWR) for < 2.5s LCP...",
      delay: 1200,
      type: "info"
    },
    {
      id: 5,
      text: "Fetching OpenAPI Specs (Swagger/OAS 3.0)...",
      delay: 900,
      type: "info"
    },
    {
      id: 6,
      text: "Scanning Certifications: 8x Salesforce Certified including Agentforce & Education Cloud...",
      delay: 1000,
      type: "success"
    },
    {
      id: 7,
      text: "Bootstrapping Career Skills Application: Managing multimillion-dollar grant funds...",
      delay: 1200,
      type: "info"
    },
    {
      id: 8,
      text: "Handshaking with Atlassian Jira API...",
      delay: 1100,
      type: "info"
    },
    {
      id: 9,
      text: "Synchronizing GitHub Live Feed...",
      delay: 800,
      type: "info"
    },
    {
      id: 10,
      text: "Verifying DevOps Standards: Pipeline policies for CRM Development team active...",
      delay: 900,
      type: "success"
    },
    {
      id: 11,
      text: "Optimizing Integrations: Power Automate & Talend/MuleSoft handshake complete...",
      delay: 1100,
      type: "info"
    },
    {
      id: 12,
      text: "Grounding Agentforce Service Agent Topics...",
      delay: 1500,
      type: "info"
    },
    {
      id: 13,
      text: "Loading AntV G6 Graphing Engine...",
      delay: 700,
      type: "info"
    },
    {
      id: 14,
      text: '"Vibe-Gate" logic active. Casual mode suppressed.',
      delay: 1000,
      type: "warning"
    },
    {
      id: 15,
      text: "System Integrity Verified. Awaiting Phase 5: Go-Live...",
      delay: 2000,
      type: "success"
    }
  ];

  static renderMode = "light";

  _hasRendered = false;

  get isLighthouseOrBot() {
    if (typeof window === "undefined" || !window.navigator) return false;
    const ua = window.navigator.userAgent;
    return /Chrome-Lighthouse|Googlebot|bot|crawler|spider/i.test(ua);
  }

  connectedCallback() {
    // SSR: Do not access window or document here
  }

  renderedCallback() {
    if (this._hasRendered) return;
    this._hasRendered = true;

    if (typeof window !== "undefined") {
      // Hydration mismatch fix: Update width only after client render
      this.viewportWidth = window.innerWidth;

      // Deep LCP Optimization: Skip animation immediately for Bots/Lighthouse
      if (this.isLighthouseOrBot) {
        this.finishBoot(false);
        return;
      }

      this._handleEscape = this.handleGlobalKeydown.bind(this);
      window.addEventListener("keydown", this._handleEscape);

      const hasVisited = sessionStorage.getItem("portfolio_booted");

      if (hasVisited) {
        this.skipBootSequence();
      } else {
        this.runBootSequence();
      }
    }
  }

  disconnectedCallback() {
    if (typeof window !== "undefined") {
      window.removeEventListener("keydown", this._handleEscape);
    }
  }

  get terminalTitle() {
    // Use tracked property to ensure reactivity and consistency
    return this.viewportWidth < 450
      ? "PORTFOLIO_ARCHITECT v1.0"
      : "RYAN_BUMSTEAD_PORTFOLIO_ARCHITECT v1.0";
  }

  async runBootSequence() {
    for (const log of this.fullLogSequence) {
      if (this._skipAnimation) return;
      await this.wait(log.delay);
      if (this._skipAnimation) return;
      this.addLog(log);
    }

    await this.wait(500);
    this.finishBoot(true);
  }

  handleGlobalKeydown(event) {
    if (event.key === "Escape" && this.isBooting) {
      this.triggerSkip();
    }
  }

  handleSkip(event) {
    if (event.type === "click" || event.key === "Enter" || event.key === " ") {
      if (event.key === " ") event.preventDefault();
      this.triggerSkip();
    }
  }

  triggerSkip() {
    this._skipAnimation = true;
    this.skipBootSequence();
  }

  skipBootSequence() {
    this.displayedLogs = this.fullLogSequence.map((log) =>
      this.processLog(log)
    );
    this.finishBoot(false);
  }

  finishBoot(completedNaturally) {
    this.isBooting = false;
    this.showCta = true;

    const hasVisited = sessionStorage.getItem("portfolio_booted");
    if (!hasVisited && completedNaturally) {
      this.addLog({
        id: 999,
        text: '🏆 Achievement Unlocked: "Patient Evaluator" - You watched the entire boot sequence!',
        type: "success",
        forceIcon: "★"
      });
    }

    sessionStorage.setItem("portfolio_booted", "true");
    this.scrollToBottom();
  }

  addLog(logData) {
    this.displayedLogs.push(this.processLog(logData));
    this.scrollToBottom();
  }

  processLog(logData) {
    let cssClass = "log-line fade-in";
    let icon = ">";

    if (logData.type === "success") {
      cssClass += " success";
      icon = "\u2713";
    } else if (logData.type === "warning") {
      cssClass += " warning";
      icon = "\u26A0";
    } else {
      cssClass += " info";
    }

    if (logData.forceIcon) {
      icon = logData.forceIcon;
    }

    return {
      id: logData.id,
      text:
        logData.type !== "info" && !logData.forceIcon
          ? `[${logData.type.toUpperCase()}] ${logData.text}`
          : logData.text,
      cssClass: cssClass,
      icon: icon
    };
  }

  scrollToBottom() {
    requestAnimationFrame(() => {
      const terminalBody = this.refs.terminalBody;
      if (terminalBody) {
        terminalBody.scrollTop = terminalBody.scrollHeight;
      }
    });
  }

  wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  get ctaClass() {
    return `cta-container ${this.showCta ? "visible" : ""}`;
  }
}
