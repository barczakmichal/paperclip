// Thin wrapper around facebook-nodejs-business-sdk.
// Tokens loaded from secrets at call time — never cached in module scope.
import { FacebookAdsApi, AdAccount } from "facebook-nodejs-business-sdk";

export interface MetaSecrets {
  accessToken: string;
  adAccountId: string;
}

export function initMetaClient(secrets: MetaSecrets): AdAccount {
  FacebookAdsApi.init(secrets.accessToken);
  // Normalize: facebook SDK expects "act_<id>" prefix
  const accountId = secrets.adAccountId.startsWith("act_")
    ? secrets.adAccountId
    : `act_${secrets.adAccountId}`;
  return new AdAccount(accountId);
}
