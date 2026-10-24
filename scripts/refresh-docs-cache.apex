// Refreshes every document the docs page lists, whatever its age, so the page matches the
// repository's main branch. It queues one SourceCacheRefreshJob and prints the job Id on a
// line that starts with REFRESH_JOB_ID= for the caller to wait on. Run it as the admin who
// owns the cache refresh schedule, because that user holds the GitHub credential access.
// Nothing is queued when no docs record is configured, and the run then fails on purpose.
Id jobId = SourceCacheRefreshJob.forceRefresh(SourceController.DOCS_KEY);
if (jobId == null) {
  throw new IllegalArgumentException(
    'No docs path is configured, nothing was queued.'
  );
}
System.debug(LoggingLevel.ERROR, 'REFRESH_JOB_ID=' + jobId);
