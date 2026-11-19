// Creates the one Portfolio_Config record a fixture export needs, in a scratch org only.
// Custom metadata cannot be loaded by a tree import, so this is a separate step.
// Run it once after the seed import:
//   sf apex run --file data/site/Portfolio_Config.apex --target-org <scratch-alias>
// It sets the credential verification link the resume page shows beside the certifications.
// The link is a plain example address, not a real credential page.
Metadata.CustomMetadata config = new Metadata.CustomMetadata();
config.fullName = 'Portfolio_Config.Seed_Config';
config.label = 'Seed Config';
Metadata.CustomMetadataValue link = new Metadata.CustomMetadataValue();
link.field = 'Credential_Verification_URL__c';
link.value = 'https://example.com/credentials/verification/';
config.values.add(link);
Metadata.DeployContainer container = new Metadata.DeployContainer();
container.addMetadata(config);
Id jobId = Metadata.Operations.enqueueDeployment(container, null);
System.debug('Portfolio_Config deploy queued ' + jobId);
