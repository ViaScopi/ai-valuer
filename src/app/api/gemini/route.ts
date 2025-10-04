import { NextResponse } from "next/server";

export const runtime = "nodejs";

function arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    return Buffer.from(binary, "binary").toString("base64");
}

export async function POST(req: Request) {
    try {
        const formData = await req.formData();
        const description = (formData.get("description") as string) || "";
        const file = formData.get("file") as File | null;

        if (!file) {
            return NextResponse.json({ error: "No image uploaded" }, { status: 400 });
        }

        const arrayBuffer = await file.arrayBuffer();
        const base64Image = arrayBufferToBase64(arrayBuffer);

        // 👇 Direct REST call to v1 endpoint (bypasses SDK)
        const prompt = `
You are an expert valuer. Identify the item in this photo and describe its type, brand, category, and condition.
If a description is provided, use it to refine accuracy.
Return a JSON object ONLY in this format:
{
  "item": "Item name",
  "attributes": {
    "brand": "string",
    "category": "string",
    "condition": "string"
  },
  "search_queries": ["query1", "query2"]
}`;

        const body = {
            contents: [
                {
                    parts: [
                        { inlineData: { mimeType: file.type, data: base64Image } },
                        { text: `${prompt}\nUser description: ${description}` },
                    ],
                },
            ],
        };

        const res = await fetch(
            "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-pro:generateContent",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-goog-api-key": process.env.GEMINI_API_KEY || "",
                },
                body: JSON.stringify(body),
            }
        );


        if (!res.ok) {
            const errText = await res.text();
            console.error("Gemini REST error:", errText);
            return NextResponse.json({ error: "Gemini API call failed" }, { status: 500 });
        }

        const data = await res.json();
        const text =
            data?.candidates?.[0]?.content?.parts?.[0]?.text || JSON.stringify(data);

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: text };

        return NextResponse.json(parsed);
    } catch (error: any) {
        console.error("Gemini Vision error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to process image" },
            { status: 500 }
        );
    }
}
