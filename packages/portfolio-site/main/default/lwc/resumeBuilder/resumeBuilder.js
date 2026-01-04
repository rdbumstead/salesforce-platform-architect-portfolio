/**
 * @description       : LWC for building and exporting resumes.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/26/2025
 **/
import { LightningElement, track } from "lwc";
// import { loadScript } from 'lightning/platformResourceLoader';
// import JSPDF from '@salesforce/resourceUrl/jspdf';

export default class ResumeBuilder extends LightningElement {
  @track selectedPersona = "Architect";
  @track includeHeader = true;
  @track includeSkills = true;
  @track previewData = [];

  get personaOptions() {
    return [
      { label: "Technical Architect", value: "Architect" },
      { label: "Salesforce Developer", value: "Developer" },
      { label: "System Admin", value: "Admin" }
    ];
  }

  connectedCallback() {
    this.updatePreview();
  }

  handlePersonaChange(event) {
    this.selectedPersona = event.detail.value;
    this.updatePreview();
  }

  handleConfigChange(event) {
    const field = event.target.dataset.field;
    this[field] = event.target.checked;
  }

  handleDownload() {
    // Logic to generate PDF using jsPDF
    // const doc = new jsPDF();
    // doc.text("Ryan Bumstead", 10, 10);
    // doc.save("Resume.pdf");
    // eslint-disable-next-line no-console
    console.log("Downloading PDF... (Needs jsPDF library)");
  }

  updatePreview() {
    // Mock Data Filtering
    // In reality, this would filter 'Experience_Highlight__c' based on Persona_Tag__c
    const allData = [
      {
        id: 1,
        employer: "Salesforce",
        role: "Technical Architect",
        date: "2023 - Present",
        bullets: [
          "Designed multi-cloud architectures for enterprise clients.",
          "Led DevOps transformation using GitHub Actions and SFDX."
        ],
        tags: ["Architect", "Developer"]
      },
      {
        id: 2,
        employer: "Tech Corp",
        role: "Senior Developer",
        date: "2020 - 2023",
        bullets: [
          "Built complex LWC components for Service Cloud.",
          "Implemented CI/CD pipelines."
        ],
        tags: ["Developer"]
      }
    ];

    // Simple mock filter
    this.previewData = allData;
  }
}
