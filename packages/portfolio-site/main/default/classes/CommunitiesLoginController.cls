/**
 * @description       : Forwards a visitor to the site's authentication page with
 *                      Network.forwardToAuthPage(), passing the start URL and display type from
 *                      the page. Part of the Experience Cloud site template.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @trailhead         : https://www.salesforce.com/trailblazer/rbumstead
 * @Created           : 01/02/2026
 **/
global with sharing class CommunitiesLoginController {
  global CommunitiesLoginController() {
  }

  // Code we will invoke on page load.
  global PageReference forwardToAuthPage() {
    String startUrl = System.currentPageReference()
      .getParameters()
      .get('startURL');
    String displayType = System.currentPageReference()
      .getParameters()
      .get('display');
    return Network.forwardToAuthPage(startUrl, displayType);
  }
}
