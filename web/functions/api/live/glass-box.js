import { handleCachedGet } from "../../_lib/actions.js";

export const SECONDS = 60;

export const onRequest = (context) =>
  handleCachedGet(context, {
    feature: "liveReads",
    action: "glass-box",
    seconds: SECONDS
  });
