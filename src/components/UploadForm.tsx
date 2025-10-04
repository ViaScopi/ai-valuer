"use client";

import { useState, useRef } from "react";

export default function UploadForm() {
    const [file, setFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [description, setDescription] = useState("");
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState<number>(0); // 0-100 for progress bar
    const [stage, setStage] = useState<string | null>(null); // "upload" | "gemini" | "ebay" | "done"
    const [result, setResult] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            setFile(selectedFile);
            setPreviewUrl(URL.createObjectURL(selectedFile));
            setError(null);
            setResult(null);
        }
    };

    const handleRemoveImage = () => {
        setFile(null);
        setPreviewUrl(null);
        setResult(null);
        setError(null);
        setDescription("");
        setProgress(0);
        setStage(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setResult(null);

        if (!file) {
            setError("Please upload an image first.");
            return;
        }

        setLoading(true);
        setProgress(10);
        setStage("upload");

        try {
            // 1️⃣ Send image + description to Gemini
            setStage("gemini");
            setProgress(35);

            const formData = new FormData();
            formData.append("file", file);
            formData.append("description", description);

            const geminiResponse = await fetch("/api/gemini", {
                method: "POST",
                body: formData,
            });

            if (!geminiResponse.ok) throw new Error(`Gemini API error: ${geminiResponse.status}`);

            const geminiData = await geminiResponse.json();

            // 2️⃣ Send Gemini search queries to eBay route
            setStage("ebay");
            setProgress(65);

            const ebayResponse = await fetch("/api/ebay", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    search_queries: geminiData.search_queries || [geminiData.item],
                    country: "GB",
                    maxAgeDays: 60,
                }),
            });

            if (!ebayResponse.ok) throw new Error(`eBay API error: ${ebayResponse.status}`);

            const ebayData = await ebayResponse.json();

            setProgress(100);
            setStage("done");

            setResult({ gemini: geminiData, ebay: ebayData });
        } catch (err: any) {
            console.error(err);
            setError(err.message || "An unexpected error occurred.");
        } finally {
            setLoading(false);
        }
    };

    // Helper function for stage label
    const stageLabel = () => {
        switch (stage) {
            case "upload":
                return "📤 Uploading image...";
            case "gemini":
                return "🧠 Analyzing image with Gemini...";
            case "ebay":
                return "💰 Fetching prices from eBay...";
            case "done":
                return "✅ Complete!";
            default:
                return "";
        }
    };

    return (
        <div className="max-w-xl mx-auto p-6 bg-white rounded-2xl shadow-lg mt-10">
            <h1 className="text-2xl font-bold mb-4 text-gray-800">
                🧠 AI Valuer – Identify & Estimate Item Value
            </h1>

            <form onSubmit={handleSubmit} className="space-y-4">
                {/* IMAGE UPLOAD SECTION */}
                {!previewUrl ? (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Upload an item photo
                        </label>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleFileChange}
                            className="block w-full border border-gray-300 rounded-md p-2"
                        />
                    </div>
                ) : (
                    <div className="relative">
                        <img
                            src={previewUrl}
                            alt="Preview"
                            className="rounded-md border border-gray-300 max-h-80 object-contain mx-auto"
                        />
                        <button
                            type="button"
                            onClick={handleRemoveImage}
                            className="absolute top-2 right-2 bg-white/80 text-red-600 border border-red-400 rounded-md px-2 py-1 text-xs hover:bg-red-50"
                        >
                            ✕ Remove
                        </button>
                    </div>
                )}

                {/* DESCRIPTION FIELD */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                        Optional description (brand, model, etc.)
                    </label>
                    <textarea
                        placeholder="e.g. Old Nintendo handheld console"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="w-full border border-gray-300 rounded-md p-2"
                        rows={2}
                        disabled={loading}
                    />
                </div>

                {/* SUBMIT BUTTON */}
                <button
                    type="submit"
                    disabled={loading || !file}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium disabled:opacity-50"
                >
                    {loading ? "Analyzing..." : "Identify & Value"}
                </button>
            </form>

            {/* PROGRESS BAR */}
            {loading && (
                <div className="mt-4">
                    <p className="text-sm text-gray-600 mb-1">{stageLabel()}</p>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                        <div
                            className={`h-3 rounded-full transition-all duration-700 ${stage === "done" ? "bg-green-500" : "bg-blue-500"
                                }`}
                            style={{ width: `${progress}%` }}
                        ></div>
                    </div>
                </div>
            )}

            {/* ERROR DISPLAY */}
            {error && (
                <div className="mt-4 bg-red-50 border border-red-200 text-red-700 p-3 rounded-md">
                    ⚠️ {error}
                </div>
            )}

            {/* RESULTS */}
            {result && (
                <div className="mt-8 space-y-6">
                    {/* GEMINI SECTION */}
                    <div className="p-4 border rounded-md bg-gray-50">
                        <h2 className="text-lg font-semibold mb-2">🧩 AI Identification</h2>
                        <p className="text-gray-700">
                            <strong>Item:</strong> {result.gemini.item || "Unknown"}
                        </p>
                        {result.gemini.attributes && (
                            <ul className="text-gray-700 mt-2">
                                {Object.entries(result.gemini.attributes).map(([key, value]) => (
                                    <li key={key}>
                                        <strong>{key}:</strong> {value as string}
                                    </li>
                                ))}
                            </ul>
                        )}
                        {result.gemini.search_queries && (
                            <p className="text-xs text-gray-500 mt-2">
                                🔍 Queries: {result.gemini.search_queries.join(", ")}
                            </p>
                        )}
                    </div>

                    {/* EBAY SECTION */}
                    {result.ebay && (
                        <div className="p-4 border rounded-md bg-green-50">
                            <h2 className="text-lg font-semibold mb-2">💰 eBay Market Data</h2>
                            {result.ebay.stats?.count ? (
                                <>
                                    <p className="text-gray-800">
                                        Found {result.ebay.stats.count} sold listings
                                    </p>
                                    <p className="text-gray-700 mt-1">
                                        Avg: £{result.ebay.stats.avg} {result.ebay.stats.currency === "GBP" ? "" : `(${result.ebay.stats.currency})`} <br />
                                        Range: £{result.ebay.stats.min} – £{result.ebay.stats.max} <br />
                                        Median: £{result.ebay.stats.median}
                                    </p>

                                    <div className="mt-3">
                                        <h3 className="font-medium text-gray-800 mb-1">Sample Listings:</h3>
                                        <ul className="list-disc pl-5 space-y-1">
                                            {result.ebay.samples?.map((s: any, i: number) => (
                                                <li key={i}>
                                                    <a
                                                        href={s.url}
                                                        target="_blank"
                                                        className="text-blue-600 hover:underline"
                                                    >
                                                        {s.title}
                                                    </a>{" "}
                                                    — £{s.price}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </>
                            ) : (
                                <p className="text-gray-600">No recent sold listings found.</p>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
