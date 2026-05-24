// Type declaration for facebook-nodejs-business-sdk (no official @types package available).
// Minimal types sufficient for marketing-ai adapter usage.

declare module "facebook-nodejs-business-sdk" {
  export class FacebookAdsApi {
    static init(accessToken: string): FacebookAdsApi;
  }

  export class AbstractCrudObject {
    constructor(id?: string, data?: Record<string, unknown>);
    id: string;
    get(fields: string[], params?: Record<string, unknown>): Promise<unknown>;
    update(fields: string[], params?: Record<string, unknown>): Promise<unknown>;
  }

  export class AdAccount extends AbstractCrudObject {
    constructor(id: string);
    createCampaign(fields: string[], params: Record<string, unknown>): Promise<{ id: string }>;
    getInsights(
      fields: string[],
      params: Record<string, unknown>,
    ): Promise<{ next(): Promise<Array<Record<string, unknown>>> }>;
  }

  export class Campaign extends AbstractCrudObject {
    static Fields: Record<string, string> & {
      id: string;
      name: string;
      objective: string;
      status: string;
      daily_budget: string;
      start_time: string;
      stop_time: string;
    };
    static Status: {
      active: string;
      paused: string;
      deleted: string;
      archived: string;
    };
  }

  export class AdsInsights extends AbstractCrudObject {
    static Fields: Record<string, string> & {
      spend: string;
      impressions: string;
      clicks: string;
      ctr: string;
      actions: string;
      action_values: string;
    };
  }
}
