/**
 * @description       : LWC for testing SAPI/PAPI endpoints in real-time.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 **/
import { LightningElement } from "lwc";

export default class ApiTester extends LightningElement {
  selectedEndpoint = "";
  responseBody = "// Select an endpoint to see the response...";
  responseStatus = "READY";
  latency = 0;
  isLoading = false;

  get endpointOptions() {
    return [
      { label: "/sapi/v1/projects", value: "/projects" },
      { label: "/sapi/v1/experience", value: "/experience" },
      { label: "/sapi/v1/skills", value: "/skills" },
      { label: "/sapi/v1/testimonials", value: "/testimonials" },
      { label: "/sapi/v1/resume", value: "/resume" }
    ];
  }

  get isExecuteDisabled() {
    return !this.selectedEndpoint || this.isLoading;
  }

  handleEndpointChange(event) {
    this.selectedEndpoint = event.detail.value;
  }

  handleExecute() {
    if (!this.selectedEndpoint) return;

    this.isLoading = true;
    this.responseStatus = "PENDING...";
    const start = Date.now();

    // Simulate API Call
    setTimeout(() => {
      this.latency = Date.now() - start;
      this.responseStatus = "200 OK";
      this.responseBody = this.getMockResponse(this.selectedEndpoint);
      this.isLoading = false;
    }, 600);
  }

  getMockResponse(endpoint) {
    const responses = {
      "/projects": [
        {
          id: "a015e00000B2O3DAAV",
          name: "Salesforce Architect Portfolio",
          pillar: "Integration",
          status: "Live – In Production",
          isFeatured: true
        },
        {
          id: "a015e00000B2O4DAAV",
          name: "Employer Hub",
          pillar: "Business",
          status: "Live – Demo / Reference",
          isFeatured: false
        }
      ],
      "/experience": [
        {
          id: "a025e00000B2O3DAAV",
          name: "Technical Architect",
          employerName: "Salesforce",
          isCurrentRole: true
        },
        {
          id: "a025e00000B2O4DAAV",
          name: "Senior Developer",
          employerName: "Accenture",
          isCurrentRole: false
        }
      ],
      "/skills": [
        {
          id: "a075e00000B2O3DAAV",
          name: "Apex",
          category: "Backend Development",
          proficiencyScore: 5
        },
        {
          id: "a075e00000B2O4DAAV",
          name: "LWC",
          category: "Frontend Development",
          proficiencyScore: 5
        }
      ],
      "/testimonials": [
        {
          id: "a055e00000B2O3DAAV",
          authorName: "Jane Doe",
          relationshipType: "Manager",
          vibeMode: "Professional"
        }
      ],
      "/resume": {
        persona: "Architect",
        totalHighlights: 5,
        highlights: [
          {
            id: "a035e00000B2O3DAAV",
            description: "Led 5 successful deployments"
          }
        ]
      }
    };

    return JSON.stringify(
      responses[endpoint] || { message: "Unknown endpoint" },
      null,
      2
    );
  }
}
