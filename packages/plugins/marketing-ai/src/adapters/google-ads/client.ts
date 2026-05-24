import { GoogleAdsApi, type Customer } from "google-ads-api";

export interface GoogleSecrets {
  developerToken: string;
  clientId: string;         // from env, not secrets store
  clientSecret: string;     // from env
  refreshToken: string;
  customerId: string;       // "123-456-7890" or "1234567890"
}

export function initGoogleClient(secrets: GoogleSecrets): Customer {
  const client = new GoogleAdsApi({
    client_id: secrets.clientId,
    client_secret: secrets.clientSecret,
    developer_token: secrets.developerToken,
  });
  const normalizedId = secrets.customerId.replace(/-/g, "");
  return client.Customer({
    customer_id: normalizedId,
    refresh_token: secrets.refreshToken,
  });
}
