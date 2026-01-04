/**
 * @description       : LWC to display live commit history from GitHub.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/26/2025
 **/
import { LightningElement } from "lwc";
// Future: Import Apex
// import getRecentCommits from '@salesforce/apex/GitHubService.getRecentCommits';

export default class Changelog extends LightningElement {
  commits = [];
  isLoading = true;
  error = null;

  connectedCallback() {
    this.fetchCommits();
  }

  fetchCommits() {
    // Mock Data (replace with actual Apex call)
    this.isLoading = true;

    // Simulate async fetch
    setTimeout(() => {
      this.commits = [
        {
          sha: "12345",
          message: "feat: Added Changelog component",
          author: "Ryan Bumstead",
          date: "2026-01-03",
          url: "#"
        },
        {
          sha: "67890",
          message: "docs: Update SAS.md",
          author: "Ryan Bumstead",
          date: "2026-01-02",
          url: "#"
        },
        {
          sha: "abcde",
          message: "fix: Resolved SAPI error handling",
          author: "Ryan Bumstead",
          date: "2026-01-01",
          url: "#"
        }
      ];
      this.isLoading = false;
    }, 500);

    // Future: Imperative Call
    /*
        getRecentCommits()
            .then(result => {
                this.commits = result;
                this.error = null;
            })
            .catch(error => {
                this.error = error.body?.message || 'Failed to fetch commits';
            })
            .finally(() => {
                this.isLoading = false;
            });
        */
  }

  get hasCommits() {
    return this.commits && this.commits.length > 0;
  }
}
