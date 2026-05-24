// Fetches mid-rate for a given currency from NBP open API.
// Used for unified PLN reporting in marketing.fetch_metrics tool.
// Cache: 1h in-process (acceptable for daily reporting).

const cache = new Map<string, { rate: number; expiresAt: number }>();

export async function getPlnRate(currencyCode: string): Promise<number> {
  if (currencyCode.toUpperCase() === "PLN") return 1;

  const key = currencyCode.toUpperCase();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.rate;

  const url = `https://api.nbp.pl/api/exchangerates/rates/a/${key}/?format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NBP rate fetch failed for ${key}: ${res.status}`);

  const json = await res.json() as { rates: Array<{ mid: number }> };
  const rate = json.rates[0]?.mid;
  if (!rate) throw new Error(`No NBP rate for ${key}`);

  cache.set(key, { rate, expiresAt: Date.now() + 60 * 60_000 });
  return rate;
}

export async function convertToPln(amount: number, fromCurrency: string): Promise<number> {
  const rate = await getPlnRate(fromCurrency);
  return amount * rate;
}
