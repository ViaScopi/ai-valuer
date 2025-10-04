import { NextResponse } from "next/server";
import { getEbayAppToken } from "@/lib/ebayToken";

export const runtime = "nodejs";

function median(nums: number[]) {
    if (!nums.length) return null;
    const s = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export async function POST(req: Request) {
    try {
        const body = await req.json().catch(() => ({}));
        const search_queries: string[] = body.search_queries || [];
        const country: string = body.country || process.env.EBAY_DEFAULT_COUNTRY || "GB";
        const maxAgeDays: number = Math.min(Math.max(Number(body.maxAgeDays ?? 60), 1), 180);

        if (!search_queries.length) {
            return NextResponse.json({ error: "No search_queries provided" }, { status: 400 });
        }

        const query = search_queries[0]; // start with first; later you can fan out
        const token = await getEbayAppToken();

        // Build query
        const params = new URLSearchParams({
            q: query,
            limit: "50",
        });

        // Filters:
        // - soldItemsOnly:true → completed/sold results
        // - itemEndDate:[NOW-XXd..NOW] → recent window
        // - deliveryCountry:XX → normalize by buyer region
        const filters = [
            `soldItemsOnly:true`,
            `itemEndDate:[NOW-${maxAgeDays}d..NOW]`,
            `deliveryCountry:${country}`,
        ];
        params.set("filter", filters.join(","));

        const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?${params.toString()}`;

        // Fetch comps
        let res = await fetch(url, {
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
        });

        // If token expired mid-flight, retry once with fresh token
        if (res.status === 401) {
            const retryToken = await getEbayAppToken();
            res = await fetch(url, {
                headers: {
                    Authorization: `Bearer ${retryToken}`,
                    "Content-Type": "application/json",
                },
            });
        }

        if (!res.ok) {
            const txt = await res.text();
            console.error("eBay API error:", res.status, txt);
            return NextResponse.json({ error: "Failed to fetch eBay data" }, { status: 500 });
        }

        const data = await res.json();

        const items = (data.itemSummaries || []).map((it: any) => ({
            title: it.title,
            price: it.price?.value ? Number(it.price.value) : null,
            currency: it.price?.currency,
            condition: it.condition,
            url: it.itemWebUrl || it.itemHref,
            image: it.image?.imageUrl,
            endTime: it.itemEndDate,
            buyingOptions: it.buyingOptions,
        }));

        const prices = items.map(i => i.price).filter((n: number | null): n is number => typeof n === "number");

        const stats = {
            count: prices.length,
            min: prices.length ? Math.min(...prices) : null,
            max: prices.length ? Math.max(...prices) : null,
            avg: prices.length
                ? Number((prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2))
                : null,
            median: prices.length ? median(prices) : null,
            // Force to GBP unless user explicitly searches non-UK region
            currency:
                (items[0]?.currency && items[0]?.currency !== "USD"
                    ? items[0]?.currency
                    : "GBP"),
        };

        return NextResponse.json({
            query,
            country,
            maxAgeDays,
            stats,
            samples: items.slice(0, 8), // show first few comps
        });
    } catch (err: any) {
        console.error("eBay route failed:", err);
        return NextResponse.json({ error: err.message || "Unexpected error" }, { status: 500 });
    }
}
