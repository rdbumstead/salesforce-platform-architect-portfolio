/**
 * @description       : LWC to visualize skill relationships using AntV G6.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 12/26/2025
 **/
import { LightningElement } from "lwc";
// import { loadScript } from 'lightning/platformResourceLoader';
// import G6 from '@salesforce/resourceUrl/antv_g6'; // Future

export default class SkillNetwork extends LightningElement {
  isLoading = true;
  skills = [];
  g6Initialized = false;
  graph;

  renderedCallback() {
    if (this.g6Initialized) return;
    this.g6Initialized = true;

    // Simulate Library Load
    setTimeout(() => {
      this.initializeGraph();
    }, 1500);

    /*
        loadScript(this, G6 + '/g6.min.js')
            .then(() => { this.initializeGraph(); })
            .catch(error => { console.error(error); });
        */
  }

  initializeGraph() {
    const container = this.template.querySelector(".graph-container");
    this.isLoading = false;

    // Mock Graph Logic (Since G6 is not actually loaded)
    // container.innerHTML = ... (Violates LWC security)

    const mockText = document.createElement("div");
    mockText.innerText =
      "[ G6 Canvas Rendered Locally ] - Drag nodes to explore.";
    mockText.style.textAlign = "center";
    mockText.style.paddingTop = "100px";
    mockText.style.color = "#ccc";

    container.appendChild(mockText);

    // Mock Data Push
    this.skills = [
      { id: "1", name: "Apex", relatedProjectCount: 5 },
      { id: "2", name: "LWC", relatedProjectCount: 3 }
    ];
  }

  handlePause() {
    // console.log('Animation paused');
  }

  handleReset() {
    // console.log('Graph reset');
    // if (this.graph) this.graph.layout();
  }
}
