// src/lib/ebayToken.ts
let tokenCache: { accessToken: string; expiresAt: number } | null = null;

export async function getEbayAppToken(): Promise<string> {
    const now = Date.now();

    if (tokenCache && now < tokenCache.expiresAt - 60_000) {
        return tokenCache.accessToken; // use cached (with 60s buffer)
    }

    const clientId = process.env.EBAY_CLIENT_ID || "";
    const clientSecret = process.env.EBAY_CLIENT_SECRET || "";
    const scope = process.env.EBAY_SCOPE || "https://api.ebay.com/oauth/api_scope";

    if (!clientId || !clientSecret) {
        throw new Error("Missing EBAY_CLIENT_ID / EBAY_CLIENT_SECRET");
    }

    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const res = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Authorization: `Basic ${basic}`,
        },
        body: new URLSearchParams({
            grant_type: "client_credentials",
            scope,
        }),
    });

    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`eBay token fetch failed: ${res.status} ${txt}`);
    }

    const data = (await res.json()) as {
        access_token: string;
        expires_in: number; // seconds
        token_type: string;
    };

    tokenCache = {
        accessToken: data.access_token,
        expiresAt: now + data.expires_in * 1000,
    };

    return data.access_token;
}
