// Refreshes every source file the View source dialog shows, whatever its age, so the dialog
// matches the repository's main branch. It queues one SourceCacheRefreshJob over every
// configured path whose Source_Key__c is not the docs key and prints the job Id on a line that
// starts with REFRESH_JOB_ID= for the caller to wait on. Run it as the admin who owns the
// cache refresh schedule, because that user holds the GitHub credential access. The docs page
// has its own script, refresh-docs-cache.apex. Nothing is queued when no code path is
// configured, and the run then fails on purpose.
Set<String> paths = new Set<String>();
for (Source_File__mdt file : SourceController.configuredFiles()) {
  if (file.Source_Key__c != SourceController.DOCS_KEY) {
    paths.add(file.Path__c.trim());
  }
}
Id jobId = SourceCacheRefreshJob.forceRefresh(paths);
if (jobId == null) {
  throw new IllegalArgumentException(
    'No code path is configured, nothing was queued.'
  );
}
System.debug(LoggingLevel.ERROR, 'REFRESH_JOB_ID=' + jobId);
