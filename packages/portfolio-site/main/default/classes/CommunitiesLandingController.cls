public with sharing class CommunitiesLandingController {
  // Code we will invoke on page load.
  public PageReference forwardToStartPage() {
    return Network.communitiesLanding();
  }

  public CommunitiesLandingController() {
  }
}
