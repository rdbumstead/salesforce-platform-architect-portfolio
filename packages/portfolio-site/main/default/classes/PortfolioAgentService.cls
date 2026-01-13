/**
 * @description       : Implementation of the Portfolio Agent Service.
 * @author            : Ryan Bumstead
 * @githubRepo        : https://github.com/rdbumstead
 * @portfolio         : https://ryanbumstead.com
 * @Created           : 01/13/2025
 * @Test Class        : [PortfolioAgentServiceTest]
 **/
public with sharing class PortfolioAgentService {
  public class PortfolioContextRequest {
    @InvocableVariable(label='Contact ID' required=true)
    public Id contactId;
  }

  public class PortfolioContextResult {
    @InvocableVariable(label='Full Portfolio Context (JSON)')
    public String jsonContext;
  }

  @InvocableMethod(
    label='Get Portfolio Context'
    description='Retrieves deep hierarchy of Experience, Highlights, Projects, Skills, and Metadata for the Agent.'
  )
  public static List<PortfolioContextResult> getPortfolioContext(
    List<PortfolioContextRequest> requests
  ) {
    Id contactId = requests[0].contactId;
    PortfolioContextResult result = new PortfolioContextResult();

    // =========================================================
    // 1. Fetch Global Configuration
    // =========================================================
    // Schema Validation: Uses Career_Objective__c instead of Bio__c
    List<Portfolio_Config__mdt> configList = [
      SELECT
        MasterLabel,
        Owner_Email__c,
        Owner_Phone__c,
        GitHub_Profile_URL__c,
        LinkedIn_URL__c,
        Trailblazer_Profile_URL__c,
        Career_Objective__c
      FROM Portfolio_Config__mdt
      LIMIT 1
    ];

    // Fallback if no metadata record exists
    Portfolio_Config__mdt config = configList.isEmpty()
      ? new Portfolio_Config__mdt()
      : configList[0];

    // =========================================================
    // 2. Fetch Core Contact & Resume
    // =========================================================
    List<Contact> profileList = [
      SELECT
        Id,
        Name,
        Title,
        Email,
        Phone,
        (
          SELECT
            Name,
            Employer__r.Name,
            Start_Date__c,
            End_Date__c,
            Is_Current_Role__c,
            (
              SELECT Description__c, Persona_Tag__c
              FROM Experience_Highlights__r
              ORDER BY Sort_Order__c ASC
            )
          FROM Work_Experiences__r
          ORDER BY Start_Date__c DESC
        ),
        (
          SELECT Name, Field_of_Study__c, Issuer__r.Name, Graduation_Date__c
          FROM Education__r
          ORDER BY Graduation_Date__c DESC
        ),
        (
          SELECT Name, Issuer__r.Name, Earned_Date__c
          FROM Certifications__r
          ORDER BY Earned_Date__c DESC
        )
      FROM Contact
      WHERE Id = :contactId
      LIMIT 1
    ];

    if (profileList.isEmpty()) {
      result.jsonContext = JSON.serialize(
        new Map<String, String>{
          'ERROR' => 'No Contact found with ID: ' + contactId
        }
      );
      return new List<PortfolioContextResult>{ result };
    }

    Contact profile = profileList[0];

    // =========================================================
    // 3. Fetch Projects & Skills
    // =========================================================
    List<Project__c> projectList = [
      SELECT
        Id,
        Name,
        Challenge__c,
        Solution__c,
        Business_Value__c,
        (
          SELECT Skill__r.Name, Skill__r.Proficiency__c
          FROM Project_Skills__r
          ORDER BY Skill__r.Proficiency__c DESC
        )
      FROM Project__c
      WHERE Contact__c = :contactId
      ORDER BY Sort_Order__c ASC
    ];

    // =========================================================
    // 4. Fetch Social Proof
    // =========================================================
    List<Testimonial__c> endorsements = [
      SELECT Author_Name__c, Author_Title__c, Context__c, Relationship_Type__c
      FROM Testimonial__c
      WHERE Contact__c = :contactId AND Approved__c = TRUE
      ORDER BY Sort_Order__c ASC
    ];

    // =========================================================
    // 5. Construct Payload
    // =========================================================
    Map<String, Object> payload = new Map<String, Object>{
      'Profile' => new Map<String, Object>{
        'Name' => profile.Name,
        'Title' => profile.Title,
        'Bio' => config.Career_Objective__c,
        'Contact_Info' => new Map<String, String>{
          'Email' => config.Owner_Email__c,
          'LinkedIn' => config.LinkedIn_URL__c,
          'GitHub' => config.GitHub_Profile_URL__c
        }
      },
      'Experience' => profile.Work_Experiences__r != null
        ? profile.Work_Experiences__r
        : new List<Experience__c>(),
      'Education' => profile.Education__r != null
        ? profile.Education__r
        : new List<Education__c>(),
      'Certifications' => profile.Certifications__r != null
        ? profile.Certifications__r
        : new List<Certification__c>(),
      'Projects' => projectList,
      'Testimonials' => endorsements
    };

    result.jsonContext = JSON.serializePretty(payload);
    return new List<PortfolioContextResult>{ result };
  }
}
