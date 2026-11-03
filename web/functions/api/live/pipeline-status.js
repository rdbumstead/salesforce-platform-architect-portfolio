import { handleCachedGet } from "../../_lib/actions.js";

export const SECONDS = 300;

export const onRequest = (context) =>
  handleCachedGet(context, {
    feature: "liveReads",
    action: "pipeline-status",
    seconds: SECONDS
  });
