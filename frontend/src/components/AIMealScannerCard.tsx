import { useState, useRef, type ChangeEvent } from "react";
import {
    Sparkles,
    Camera,
    UploadCloud,
    Utensils,
    Flame,
    CheckCircle2,
    X,
    Loader2,
    Info,
    ArrowRight,
} from "lucide-react";
import api from "../services/api";

type DetectedItem = {
    name: string;
    portion: string;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
};

type ScanResult = {
    name: string;
    meal_type: "breakfast" | "lunch" | "dinner" | "snack";
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    fiber_g: number;
    health_score: number;
    analysis: string;
    items_detected: DetectedItem[];
    confidence: string;
    model_used: string;
};

type AIMealScannerCardProps = {
    onFillForm: (data: {
        name: string;
        meal_type: string;
        calories: number;
        protein_g: number;
        carbs_g: number;
        fat_g: number;
    }) => void;
    onMealLogged: () => Promise<void> | void;
};

export default function AIMealScannerCard({
    onFillForm,
    onMealLogged,
}: AIMealScannerCardProps) {
    const [mode, setMode] = useState<"text" | "photo">("photo");
    const [textInput, setTextInput] = useState("");
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [imageBase64, setImageBase64] = useState<string | null>(null);
    const [mimeType, setMimeType] = useState<string>("image/jpeg");

    const [scanning, setScanning] = useState(false);
    const [savingMeal, setSavingMeal] = useState(false);
    const [scanError, setScanError] = useState("");
    const [result, setResult] = useState<ScanResult | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const QUICK_PROMPTS = [
        "2 eggs scrambled, avocado on sourdough toast",
        "1 bowl of oatmeal with blueberries & whey protein",
        "Grilled chicken breast (150g) with brown rice & broccoli",
        "Salmon fillet with quinoa and steamed asparagus",
    ];

    function handleImageSelect(e: ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;

        setScanError("");
        setMimeType(file.type || "image/jpeg");

        const reader = new FileReader();
        reader.onload = (event) => {
            const dataUrl = event.target?.result as string;
            setImagePreview(dataUrl);
            const base64Data = dataUrl.split("base64,")[1] || dataUrl;
            setImageBase64(base64Data);
        };
        reader.readAsDataURL(file);
    }

    function clearImage() {
        setImagePreview(null);
        setImageBase64(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    }

    async function handleAnalyze() {
        setScanError("");

        if (mode === "photo" && !imageBase64) {
            setScanError("Please select or capture a photo of your meal first.");
            return;
        }

        if (mode === "text" && !textInput.trim()) {
            setScanError("Please describe what you ate or choose an example meal.");
            return;
        }

        setScanning(true);
        try {
            const payload: {
                text_description?: string;
                image_base64?: string;
                mime_type?: string;
            } = {};

            if (mode === "photo" && imageBase64) {
                payload.image_base64 = imageBase64;
                payload.mime_type = mimeType;
                if (textInput.trim()) {
                    payload.text_description = textInput.trim();
                }
            } else {
                payload.text_description = textInput.trim();
            }

            const response = await api.post<ScanResult>("/api/ai/nutrition/scan", payload);
            setResult(response.data);
        } catch (err: unknown) {
            const errorObj = err as {
                response?: { data?: { detail?: string } };
                message?: string;
            };
            setScanError(
                errorObj.response?.data?.detail ||
                errorObj.message ||
                "Failed to analyze meal. Please check network connection."
            );
        } finally {
            setScanning(false);
        }
    }

    async function handleDirectSave() {
        if (!result) return;
        setSavingMeal(true);
        setScanError("");
        try {
            await api.post("/api/nutrition/meals", {
                name: result.name,
                meal_type: result.meal_type,
                calories: result.calories,
                protein_g: result.protein_g,
                carbs_g: result.carbs_g,
                fat_g: result.fat_g,
            });
            await onMealLogged();
            setResult(null);
            clearImage();
            setTextInput("");
        } catch (err: unknown) {
            const errorObj = err as {
                response?: { data?: { detail?: string } };
            };
            setScanError(errorObj.response?.data?.detail || "Could not save scanned meal.");
        } finally {
            setSavingMeal(false);
        }
    }

    function handleApplyToForm() {
        if (!result) return;
        onFillForm({
            name: result.name,
            meal_type: result.meal_type,
            calories: result.calories,
            protein_g: result.protein_g,
            carbs_g: result.carbs_g,
            fat_g: result.fat_g,
        });
    }

    return (
        <section className="nutrition-card ai-scanner-card" style={{ marginBottom: 24 }}>
            <div className="ai-scanner-header">
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div className="ai-scanner-icon-badge">
                        <Sparkles size={20} />
                    </div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 750 }}>
                            AI Smart Meal &amp; Macro Scanner
                        </h2>
                        {/* <p className="nutrition-muted" style={{ margin: "2px 0 0", fontSize: 13 }}>

                        </p> */}
                    </div>
                </div>

                <div className="ai-mode-toggle">
                    <button
                        type="button"
                        className={mode === "photo" ? "ai-mode-btn active" : "ai-mode-btn"}
                        onClick={() => {
                            setMode("photo");
                            setScanError("");
                        }}
                    >
                        <Camera size={14} />
                        <span>Plate Photo</span>
                    </button>
                    <button
                        type="button"
                        className={mode === "text" ? "ai-mode-btn active" : "ai-mode-btn"}
                        onClick={() => {
                            setMode("text");
                            setScanError("");
                        }}
                    >
                        <Utensils size={14} />
                        <span>Describe Meal</span>
                    </button>
                </div>
            </div>

            {scanError && (
                <div className="nutrition-error" style={{ margin: "14px 0" }}>
                    {scanError}
                </div>
            )}

            {!result ? (
                <div className="ai-scanner-body" style={{ marginTop: 16 }}>
                    {mode === "photo" ? (
                        <div className="ai-upload-zone">
                            {imagePreview ? (
                                <div className="ai-preview-container">
                                    <img
                                        src={imagePreview}
                                        alt="Meal preview"
                                        className="ai-meal-preview-img"
                                    />
                                    <button
                                        type="button"
                                        className="ai-remove-img-btn"
                                        onClick={clearImage}
                                        aria-label="Remove image"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            ) : (
                                <div
                                    className="ai-dropzone"
                                    onClick={() => fileInputRef.current?.click()}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                            fileInputRef.current?.click();
                                        }
                                    }}
                                    tabIndex={0}
                                    role="button"
                                >
                                    <UploadCloud size={38} className="ai-dropzone-icon" />
                                    <strong style={{ fontSize: 15 }}>Click or Drag a meal photo here</strong>
                                    <p className="nutrition-muted" style={{ fontSize: 12, margin: "4px 0 0" }}>
                                        Supports JPG, PNG, WEBP (food plate, breakfast bowl, dinner plate)
                                    </p>
                                </div>
                            )}

                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                style={{ display: "none" }}
                                onChange={handleImageSelect}
                            />

                            <div style={{ marginTop: 12 }}>
                                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>
                                    Optional meal note / context:
                                </label>
                                <input
                                    type="text"
                                    value={textInput}
                                    onChange={(e) => setTextInput(e.target.value)}
                                    placeholder="e.g. 2 fried eggs with sourdough toast and 1 glass of orange juice"
                                    style={{
                                        width: "100%",
                                        marginTop: 4,
                                        padding: "8px 12px",
                                        borderRadius: 8,
                                        border: "1px solid var(--border)",
                                        fontSize: 13,
                                    }}
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="ai-text-zone">
                            <label style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                                What did you eat? Describe ingredients and portions:
                            </label>
                            <textarea
                                value={textInput}
                                onChange={(e) => setTextInput(e.target.value)}
                                rows={3}
                                placeholder="e.g. 1 bowl of oatmeal with blueberries, 1 tbsp chia seeds, and 1 scoop vanilla whey protein"
                                style={{
                                    width: "100%",
                                    marginTop: 6,
                                    padding: "10px 14px",
                                    borderRadius: 10,
                                    border: "1px solid var(--border)",
                                    fontSize: 14,
                                    fontFamily: "inherit",
                                }}
                            />

                            <div style={{ marginTop: 10 }}>
                                <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase" }}>
                                    Or try an example meal:
                                </span>
                                <div className="ai-quick-pills">
                                    {QUICK_PROMPTS.map((prompt, idx) => (
                                        <button
                                            key={idx}
                                            type="button"
                                            className="ai-quick-pill"
                                            onClick={() => setTextInput(prompt)}
                                        >
                                            {prompt}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
                        <button
                            type="button"
                            className="ai-analyze-submit-btn"
                            onClick={handleAnalyze}
                            disabled={scanning}
                        >
                            {scanning ? (
                                <>
                                    <Loader2 size={16} className="ai-spinner" />
                                    <span>Scanning with Gemini 2.5 Flash...</span>
                                </>
                            ) : (
                                <>
                                    <Sparkles size={16} />
                                    <span>Analyze Meal &amp; Estimate Macros</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            ) : (
                /* Results View */
                <div className="ai-scan-results" style={{ marginTop: 16 }}>
                    <div className="ai-result-top-bar">
                        <div>
                            <span className="ai-mealtype-tag">
                                {result.meal_type.toUpperCase()}
                            </span>
                            <h3 style={{ margin: "4px 0 2px", fontSize: 17, fontWeight: 750 }}>
                                {result.name}
                            </h3>
                            <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
                                Confidence: <strong>{result.confidence}</strong> • Model: {result.model_used}
                            </span>
                        </div>

                        <div className="ai-health-score-pill">
                            <span style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" }}>
                                Health Rating
                            </span>
                            <strong>{result.health_score} / 10</strong>
                        </div>
                    </div>

                    {/* Macro Grid */}
                    <div className="ai-macro-grid">
                        <div className="ai-macro-box cal">
                            <span className="macro-lbl">
                                <Flame size={14} style={{ color: "#ea580c" }} />
                                Calories
                            </span>
                            <strong className="macro-val">{result.calories}</strong>
                            <span className="macro-sub">kcal</span>
                        </div>

                        <div className="ai-macro-box protein">
                            <span className="macro-lbl">Protein</span>
                            <strong className="macro-val">{result.protein_g}</strong>
                            <span className="macro-sub">grams</span>
                        </div>

                        <div className="ai-macro-box carbs">
                            <span className="macro-lbl">Carbs</span>
                            <strong className="macro-val">{result.carbs_g}</strong>
                            <span className="macro-sub">grams</span>
                        </div>

                        <div className="ai-macro-box fat">
                            <span className="macro-lbl">Fat</span>
                            <strong className="macro-val">{result.fat_g}</strong>
                            <span className="macro-sub">grams</span>
                        </div>

                        {result.fiber_g > 0 && (
                            <div className="ai-macro-box fiber">
                                <span className="macro-lbl">Fiber</span>
                                <strong className="macro-val">{result.fiber_g}</strong>
                                <span className="macro-sub">grams</span>
                            </div>
                        )}
                    </div>

                    {/* Detected Items Breakdown */}
                    {result.items_detected && result.items_detected.length > 0 && (
                        <div className="ai-items-section">
                            <h4 style={{ margin: "14px 0 8px", fontSize: 13, fontWeight: 700, color: "var(--text)" }}>
                                Detected Ingredients &amp; Portions:
                            </h4>
                            <div className="ai-items-list">
                                {result.items_detected.map((item, i) => (
                                    <div key={i} className="ai-detected-item">
                                        <div>
                                            <strong>{item.name}</strong>
                                            <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: 8 }}>
                                                ({item.portion})
                                            </span>
                                        </div>
                                        <div style={{ fontSize: 12, fontWeight: 600 }}>
                                            {item.calories} kcal • P: {item.protein_g}g • C: {item.carbs_g}g • F: {item.fat_g}g
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Analysis Narrative */}
                    <div className="ai-dietitian-box">
                        <Info size={16} style={{ color: "var(--primary)", flexShrink: 0, marginTop: 2 }} />
                        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: "var(--text)" }}>
                            <strong>Dietitian Insight:</strong> {result.analysis}
                        </p>
                    </div>

                    {/* Action Buttons */}
                    <div className="ai-result-actions">
                        <button
                            type="button"
                            className="nutrition-secondary"
                            onClick={() => setResult(null)}
                            disabled={savingMeal}
                        >
                            Scan Another
                        </button>

                        <button
                            type="button"
                            className="nutrition-secondary"
                            onClick={handleApplyToForm}
                            disabled={savingMeal}
                            title="Copy values to the manual form below"
                        >
                            <ArrowRight size={14} />
                            <span>Edit in Form</span>
                        </button>

                        <button
                            type="button"
                            className="ai-save-meal-btn"
                            onClick={handleDirectSave}
                            disabled={savingMeal}
                        >
                            {savingMeal ? (
                                <>
                                    <Loader2 size={15} className="ai-spinner" />
                                    <span>Saving to Meals...</span>
                                </>
                            ) : (
                                <>
                                    <CheckCircle2 size={15} />
                                    <span>Save Scanned Meal</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
            )}
        </section>
    );
}
