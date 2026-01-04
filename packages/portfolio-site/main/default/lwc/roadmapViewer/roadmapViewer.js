/**
 * @description       : LWC to visualize project roadmap from Jira.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/03/2026
 **/
import { LightningElement } from "lwc";

export default class RoadmapViewer extends LightningElement {
  items = [
    {
      id: "PORT-101",
      title: "Implement Skill Graph",
      status: "In Progress",
      type: "Story"
    },
    {
      id: "PORT-102",
      title: "Setup Agentforce",
      status: "To Do",
      type: "Epic"
    },
    {
      id: "PORT-100",
      title: "Initial Project Setup",
      status: "Done",
      type: "Task"
    }
  ];

  get todoItems() {
    return this.filterItems("To Do");
  }

  get inProgressItems() {
    return this.filterItems("In Progress");
  }

  get doneItems() {
    return this.filterItems("Done");
  }

  filterItems(status) {
    return this.items
      .filter((item) => item.status === status)
      .map((item) => ({
        ...item,
        badgeClass:
          item.type === "Epic" ? "slds-theme_warning" : "slds-theme_info" // Color code by type
      }));
  }
}
