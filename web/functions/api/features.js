import { json, methodNotAllowed } from "../_lib/http.js";
import { featureStates, isProduction } from "../_lib/features.js";

/** The five switches, as `live` or `recorded`. Never cached, so a flipped switch shows at once. */
export const onRequest = ({ request, env }) => {
  if (request.method !== "GET") return methodNotAllowed("GET");
  return json({
    ...featureStates(request, env),
    production: isProduction(request, env)
  });
};
