/**
 * marketing.list_products — wraps ShopifyCatalog to fetch active products.
 * Secrets resolved at call time; never cached.
 */
import type { PluginContext, ToolResult, ToolRunContext } from "@paperclipai/plugin-sdk";
import { createShopifyCatalog } from "../creative/shop-catalog.js";

export function registerListProductsTool(ctx: PluginContext): void {
  ctx.tools.register(
    "marketing.list_products",
    {
      displayName: "List Shop Products",
      description:
        "Fetches product catalog from the connected shop (Shopify). Returns id, title, price, image_urls, stock.",
      parametersSchema: {
        type: "object",
        properties: {
          category: {
            type: "string",
            description: "Filter by product_type (optional)",
          },
          limit: {
            type: "number",
            description: "Max products to return (default 50, max 200)",
          },
        },
      },
    },
    async (params, _runCtx: ToolRunContext): Promise<ToolResult> => {
      const p = params as { category?: string; limit?: number };
      try {
        const shopDomain = await ctx.secrets.resolve(
          "marketing-ai/shopify/shop_domain",
        );
        const accessToken = await ctx.secrets.resolve(
          "marketing-ai/shopify/access_token",
        );
        const catalog = createShopifyCatalog({ shopDomain, accessToken });
        const products = await catalog.listProducts({
          category: p.category,
          limit: Math.min(p.limit ?? 50, 200),
        });
        return {
          ok: true,
          content: `Found ${products.length} products.`,
          data: { products },
        } as ToolResult;
      } catch (err) {
        return {
          ok: false,
          error: `Failed to list products: ${err instanceof Error ? err.message : String(err)}`,
        } as ToolResult;
      }
    },
  );
}
