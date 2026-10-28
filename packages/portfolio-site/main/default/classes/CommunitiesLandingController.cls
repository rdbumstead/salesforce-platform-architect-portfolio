/**
 * @description       : Forwards a visitor on the site's landing page to the start page with
 *                      Network.communitiesLanding(). Part of the Experience Cloud site template
 *                      and kept as Salesforce supplied it.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 01/02/2026
 **/
public with sharing class CommunitiesLandingController {
  // Code we will invoke on page load.
  public PageReference forwardToStartPage() {
    return Network.communitiesLanding();
  }

  public CommunitiesLandingController() {
  }
}
