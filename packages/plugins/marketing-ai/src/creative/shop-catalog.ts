export interface CatalogProduct {
  id: string;
  title: string;
  price: string;
  imageUrls: string[];
  stock: number;
}

export interface ShopCatalogOptions {
  category?: string;
  limit?: number;
}

export interface ShopCatalog {
  listProducts(opts: ShopCatalogOptions): Promise<CatalogProduct[]>;
}

interface ShopifyCatalogConfig {
  shopDomain: string;
  accessToken: string;
  fetchFn?: typeof fetch;
  maxRetries?: number;
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  fetchFn: typeof fetch,
  retries: number,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetchFn(url, init);
      return res;
    } catch (err) {
      lastError = err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw lastError;
}

export function createShopifyCatalog(config: ShopifyCatalogConfig): ShopCatalog {
  const fetchFn = config.fetchFn ?? fetch;
  const maxRetries = config.maxRetries ?? 2;

  return {
    async listProducts(opts): Promise<CatalogProduct[]> {
      const params = new URLSearchParams({ status: "active", limit: String(opts.limit ?? 50) });
      if (opts.category) params.set("product_type", opts.category);
      const url = `https://${config.shopDomain}/admin/api/2024-01/products.json?${params}`;
      const res = await fetchWithRetry(
        url,
        {
          headers: {
            "X-Shopify-Access-Token": config.accessToken,
            "Content-Type": "application/json",
          },
        },
        fetchFn,
        maxRetries,
      );

      if (!res.ok) throw new Error(`Shopify API error: ${res.status}`);
      const data = await res.json() as { products: unknown[] };

      return (data.products as Array<{
        id: number;
        title: string;
        variants: Array<{ price: string }>;
        images: Array<{ src: string }>;
        inventory_quantity?: number;
      }>).map((p) => ({
        id: String(p.id),
        title: p.title,
        price: p.variants[0]?.price ?? "0",
        imageUrls: p.images.map((img) => img.src),
        stock: p.inventory_quantity ?? 0,
      }));
    },
  };
}
