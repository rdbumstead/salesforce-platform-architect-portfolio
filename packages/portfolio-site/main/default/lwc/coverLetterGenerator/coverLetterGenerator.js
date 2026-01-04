/**
 * @description       : LWC for generating AI-powered cover letters.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/26/2025
 **/
import { LightningElement } from "lwc";
// Future: Import Apex
// import generateCoverLetter from '@salesforce/apex/ContentGenerationController.generateCoverLetter';

export default class CoverLetterGenerator extends LightningElement {
  companyName = "";
  jobTitle = "";
  jobDescription = "";
  generatedContent = "";
  generationSource = "";
  isLoading = false;
  progress = 0;
  error = null;

  handleInputChange(event) {
    const field = event.target.dataset.field;
    this[field] = event.target.value;
  }

  get isGenerateDisabled() {
    return !this.companyName || !this.jobTitle || this.isLoading;
  }

  handleGenerate() {
    this.isLoading = true;
    this.progress = 0;
    this.generatedContent = "";
    this.error = null;

    // Simulate Progress Bar
    const interval = setInterval(() => {
      if (this.progress >= 90) {
        clearInterval(interval);
      } else {
        this.progress += 10;
      }
    }, 200);

    // Future: Replace with actual Apex call
    /*
        generateCoverLetter({
            companyName: this.companyName,
            jobTitle: this.jobTitle,
            jobDescription: this.jobDescription
        })
            .then(result => {
                this.generatedContent = result;
                this.generationSource = 'AI Generated';
            })
            .catch(error => {
                this.error = error.body?.message || 'An error occurred';
            })
            .finally(() => {
                clearInterval(interval);
                this.progress = 100;
                this.isLoading = false;
            });
        */

    // Simulate API response (for local testing)
    setTimeout(() => {
      clearInterval(interval);
      this.progress = 100;
      this.isLoading = false;
      this.generationSource = "Agentforce (Gold Path)";
      this.generatedContent = `Dear Hiring Manager at ${this.companyName},\n\nI am writing to express my strong interest in the ${this.jobTitle} position. With my background as a Salesforce Technical Architect, I believe I can bring immediate value to your team.\n\nMy experience designing multi-cloud solutions directly aligns with your needs...`;
    }, 2500);
  }
}
