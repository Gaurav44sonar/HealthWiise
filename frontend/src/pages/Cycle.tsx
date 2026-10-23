import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
    Flower2,
    ArrowLeft,
    RotateCw,
    Calendar as CalendarIcon,
    ChevronLeft,
    ChevronRight,
    Plus,
    Edit2,
    Trash2,
    AlertCircle,
    Info,
    Smile,
    Battery,
    HeartHandshake,
    Sparkles,
} from "lucide-react";

import api from "../services/api";
import { useAuth } from "../context/AuthContext";

type FlowLevel = "spotting" | "light" | "moderate" | "heavy";
type SymptomSeverity = "mild" | "moderate" | "severe";
type MoodType = "happy" | "calm" | "sensitive" | "anxious" | "irritable" | "sad" | "energetic" | "exhausted" | "other";
type EnergyLevel = "low" | "medium" | "high";

interface PeriodRecord {
    id: string;
    start_date: string;
    end_date: string | null;
    is_ongoing: boolean;
    duration_days: number | null;
    flow_level: FlowLevel | null;
    notes: string | null;
    cycle_length_to_next?: number | null;
}

interface SymptomItem {
    name: string;
    severity: SymptomSeverity;
}

interface SymptomRecord {
    id: string;
    log_date: string;
    symptoms: SymptomItem[];
    mood: MoodType | null;
    energy_level: EnergyLevel | null;
    notes: string | null;
}

interface CycleSummary {
    has_data: boolean;
    total_periods: number;
    active_period: PeriodRecord | null;
    latest_period: PeriodRecord | null;
    average_cycle_length: number | null;
    average_period_duration: number | null;
    current_cycle_day: number | null;
    is_currently_bleeding: boolean;
    estimated_phase: {
        phase_name: string;
        description: string;
        cycle_day: number;
        phases_overview: {
            menstrual: string;
            follicular: string;
            ovulation_window: string;
            luteal: string;
        };
    } | null;
    predictions: {
        predicted_next_start: string;
        confidence_note: string;
        calculated_at: string;
    } | null;
    historical_cycle_lengths: Array<{
        from_date: string;
        to_date: string;
        length_days: number;
    }>;
    frequent_symptoms: Array<{
        name: string;
        count: number;
    }>;
    disclaimer: string;
}

const COMMON_SYMPTOMS = [
    "Cramps",
    "Bloating",
    "Headache",
    "Fatigue",
    "Breast Tenderness",
    "Acne / Skin changes",
    "Mood Swings",
    "Lower Back Pain",
    "Nausea",
    "Food Cravings",
];

const MOOD_OPTIONS: { value: MoodType; label: string; emoji: string }[] = [
    { value: "calm", label: "Calm", emoji: "😌" },
    { value: "happy", label: "Happy", emoji: "😊" },
    { value: "sensitive", label: "Sensitive", emoji: "🥺" },
    { value: "energetic", label: "Energetic", emoji: "⚡" },
    { value: "irritable", label: "Irritable", emoji: "😤" },
    { value: "anxious", label: "Anxious", emoji: "😰" },
    { value: "sad", label: "Down", emoji: "😔" },
    { value: "exhausted", label: "Exhausted", emoji: "😴" },
];

function formatDateForDisplay(dateStr: string): string {
    if (!dateStr) return "";
    const [year, month, day] = dateStr.split("-").map(Number);
    const d = new Date(year, month - 1, day);
    return d.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

function getTodayStr(): string {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

export default function Cycle() {
    const { user } = useAuth();
    const todayStr = getTodayStr();

    // Data States
    const [summary, setSummary] = useState<CycleSummary | null>(null);
    const [periods, setPeriods] = useState<PeriodRecord[]>([]);
    const [symptoms, setSymptoms] = useState<SymptomRecord[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    // Calendar state
    const [viewDate, setViewDate] = useState<Date>(() => new Date());
    const [selectedDate, setSelectedDate] = useState<string>(todayStr);

    // Period Modal State
    const [periodModalOpen, setPeriodModalOpen] = useState<boolean>(false);
    const [editingPeriodId, setEditingPeriodId] = useState<string | null>(null);
    const [periodStartDate, setPeriodStartDate] = useState<string>(todayStr);
    const [periodEndDate, setPeriodEndDate] = useState<string>("");
    const [periodIsOngoing, setPeriodIsOngoing] = useState<boolean>(false);
    const [periodFlow, setPeriodFlow] = useState<FlowLevel>("moderate");
    const [periodNotes, setPeriodNotes] = useState<string>("");
    const [periodFormError, setPeriodFormError] = useState<string | null>(null);
    const [periodSaving, setPeriodSaving] = useState<boolean>(false);

    // Symptom Modal State
    const [symptomModalOpen, setSymptomModalOpen] = useState<boolean>(false);
    const [symptomLogDate, setSymptomLogDate] = useState<string>(todayStr);
    const [selectedSymptoms, setSelectedSymptoms] = useState<Map<string, SymptomSeverity>>(new Map());
    const [symptomMood, setSymptomMood] = useState<MoodType | null>(null);
    const [symptomEnergy, setSymptomEnergy] = useState<EnergyLevel | null>(null);
    const [symptomNotes, setSymptomNotes] = useState<string>("");
    const [symptomSaving, setSymptomSaving] = useState<boolean>(false);
    const [symptomFormError, setSymptomFormError] = useState<string | null>(null);

    // Confirmation delete state
    const [deleteTarget, setDeleteTarget] = useState<{ type: "period" | "symptom"; id: string } | null>(null);

    const backDashboardPath = user?.dashboard_type === "mens" ? "/mens/dashboard" : "/womens/dashboard";

    const fetchAllData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [summaryRes, periodsRes, symptomsRes] = await Promise.all([
                api.get<CycleSummary>("/api/cycle/summary"),
                api.get<PeriodRecord[]>("/api/cycle/periods"),
                api.get<SymptomRecord[]>("/api/cycle/symptoms"),
            ]);
            setSummary(summaryRes.data);
            setPeriods(periodsRes.data);
            setSymptoms(symptomsRes.data);
        } catch {
            setError("Unable to load cycle tracking records. Please verify your connection and try again.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        let active = true;
        async function fetchInitial() {
            try {
                const [summaryRes, periodsRes, symptomsRes] = await Promise.all([
                    api.get<CycleSummary>("/api/cycle/summary"),
                    api.get<PeriodRecord[]>("/api/cycle/periods"),
                    api.get<SymptomRecord[]>("/api/cycle/symptoms"),
                ]);
                if (active) {
                    setSummary(summaryRes.data);
                    setPeriods(periodsRes.data);
                    setSymptoms(symptomsRes.data);
                    setLoading(false);
                }
            } catch {
                if (active) {
                    setError("Unable to load cycle tracking records. Please verify your connection and try again.");
                    setLoading(false);
                }
            }
        }
        fetchInitial();
        return () => {
            active = false;
        };
    }, []);

    // Calendar Calculations
    const viewYear = viewDate.getFullYear();
    const viewMonth = viewDate.getMonth(); // 0-indexed

    const prevMonth = () => {
        setViewDate(new Date(viewYear, viewMonth - 1, 1));
    };

    const nextMonth = () => {
        setViewDate(new Date(viewYear, viewMonth + 1, 1));
    };

    const jumpToToday = () => {
        const now = new Date();
        setViewDate(now);
        setSelectedDate(todayStr);
    };

    // Build day grid
    const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay(); // 0 for Sunday
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

    const calendarDays: Array<{
        dateStr: string;
        dayNum: number;
        isCurrentMonth: boolean;
    }> = [];

    // Preceding empty/overflow days
    for (let i = 0; i < firstDayOfWeek; i++) {
        calendarDays.push({
            dateStr: "",
            dayNum: 0,
            isCurrentMonth: false,
        });
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const mStr = String(viewMonth + 1).padStart(2, "0");
        const dStr = String(day).padStart(2, "0");
        calendarDays.push({
            dateStr: `${viewYear}-${mStr}-${dStr}`,
            dayNum: day,
            isCurrentMonth: true,
        });
    }

    // Helper functions for date checks
    const isDateInPeriod = (dateStr: string): { isPeriod: boolean; flow: FlowLevel | null; isOngoing: boolean } => {
        for (const p of periods) {
            const start = p.start_date;
            const end = p.end_date || (p.is_ongoing ? todayStr : p.start_date);
            if (dateStr >= start && dateStr <= end) {
                return { isPeriod: true, flow: p.flow_level, isOngoing: p.is_ongoing };
            }
        }
        return { isPeriod: false, flow: null, isOngoing: false };
    };

    const isDatePredictedPeriod = (dateStr: string): boolean => {
        if (!summary?.predictions?.predicted_next_start) return false;
        const predStart = summary.predictions.predicted_next_start;
        const avgDuration = Math.round(summary.average_period_duration || 5);
        // Predict a window from predStart for avgDuration days
        const [y, m, d] = predStart.split("-").map(Number);
        const startD = new Date(y, m - 1, d);
        const endD = new Date(y, m - 1, d + avgDuration - 1);

        const [qy, qm, qd] = dateStr.split("-").map(Number);
        const queryD = new Date(qy, qm - 1, qd);

        return queryD >= startD && queryD <= endD;
    };

    const hasSymptomsOnDate = (dateStr: string): boolean => {
        return symptoms.some((s) => s.log_date === dateStr);
    };

    // Period Modal Actions
    const openAddPeriodModal = (defaultDate?: string) => {
        setEditingPeriodId(null);
        setPeriodStartDate(defaultDate || selectedDate || todayStr);
        setPeriodEndDate("");
        setPeriodIsOngoing(false);
        setPeriodFlow("moderate");
        setPeriodNotes("");
        setPeriodFormError(null);
        setPeriodModalOpen(true);
    };

    const openEditPeriodModal = (p: PeriodRecord) => {
        setEditingPeriodId(p.id);
        setPeriodStartDate(p.start_date);
        setPeriodEndDate(p.end_date || "");
        setPeriodIsOngoing(p.is_ongoing);
        setPeriodFlow(p.flow_level || "moderate");
        setPeriodNotes(p.notes || "");
        setPeriodFormError(null);
        setPeriodModalOpen(true);
    };

    const handleSavePeriod = async (e: React.FormEvent) => {
        e.preventDefault();
        setPeriodFormError(null);

        if (!periodStartDate) {
            setPeriodFormError("Please enter a period start date.");
            return;
        }

        if (!periodIsOngoing && periodEndDate && periodEndDate < periodStartDate) {
            setPeriodFormError("End date cannot precede the start date.");
            return;
        }

        setPeriodSaving(true);
        try {
            const payload = {
                start_date: periodStartDate,
                end_date: periodIsOngoing ? null : periodEndDate || null,
                flow_level: periodFlow,
                notes: periodNotes.trim() || null,
            };

            if (editingPeriodId) {
                await api.put(`/api/cycle/periods/${editingPeriodId}`, payload);
            } else {
                await api.post("/api/cycle/periods", payload);
            }

            setPeriodModalOpen(false);
            await fetchAllData();
        } catch (err: unknown) {
            const apiError = err as { response?: { data?: { detail?: string } } };
            setPeriodFormError(apiError.response?.data?.detail || "Failed to save period record. Please check your dates.");
        } finally {
            setPeriodSaving(false);
        }
    };

    // Symptom Modal Actions
    const openSymptomModal = (targetDate: string) => {
        setSymptomLogDate(targetDate);
        setSymptomFormError(null);

        const existing = symptoms.find((s) => s.log_date === targetDate);
        if (existing) {
            const map = new Map<string, SymptomSeverity>();
            for (const item of existing.symptoms) {
                map.set(item.name, item.severity);
            }
            setSelectedSymptoms(map);
            setSymptomMood(existing.mood);
            setSymptomEnergy(existing.energy_level);
            setSymptomNotes(existing.notes || "");
        } else {
            setSelectedSymptoms(new Map());
            setSymptomMood(null);
            setSymptomEnergy(null);
            setSymptomNotes("");
        }
        setSymptomModalOpen(true);
    };

    const toggleSymptom = (name: string) => {
        setSelectedSymptoms((prev) => {
            const updated = new Map(prev);
            if (updated.has(name)) {
                updated.delete(name);
            } else {
                updated.set(name, "mild");
            }
            return updated;
        });
    };

    const setSymptomSeverity = (name: string, severity: SymptomSeverity) => {
        setSelectedSymptoms((prev) => {
            const updated = new Map(prev);
            updated.set(name, severity);
            return updated;
        });
    };

    const handleSaveSymptoms = async (e: React.FormEvent) => {
        e.preventDefault();
        setSymptomFormError(null);
        setSymptomSaving(true);

        const symptomsList: SymptomItem[] = Array.from(selectedSymptoms.entries()).map(([name, severity]) => ({
            name,
            severity,
        }));

        try {
            await api.post("/api/cycle/symptoms", {
                log_date: symptomLogDate,
                symptoms: symptomsList,
                mood: symptomMood,
                energy_level: symptomEnergy,
                notes: symptomNotes.trim() || null,
            });

            setSymptomModalOpen(false);
            await fetchAllData();
        } catch (err: unknown) {
            const apiError = err as { response?: { data?: { detail?: string } } };
            setSymptomFormError(apiError.response?.data?.detail || "Failed to save symptoms. Please try again.");
        } finally {
            setSymptomSaving(false);
        }
    };

    // Delete confirmation
    const confirmDelete = async () => {
        if (!deleteTarget) return;
        try {
            if (deleteTarget.type === "period") {
                await api.delete(`/api/cycle/periods/${deleteTarget.id}`);
            } else {
                await api.delete(`/api/cycle/symptoms/${deleteTarget.id}`);
            }
            setDeleteTarget(null);
            await fetchAllData();
        } catch {
            setError("Failed to delete record. Please try again.");
            setDeleteTarget(null);
        }
    };

    // Details for selected date
    const selectedDatePeriodStatus = isDateInPeriod(selectedDate);
    const selectedDateSymptoms = symptoms.find((s) => s.log_date === selectedDate);
    const selectedPeriodRecord = periods.find(
        (p) => selectedDate >= p.start_date && selectedDate <= (p.end_date || (p.is_ongoing ? todayStr : p.start_date))
    );

    return (
        <main className="dashboard-page womens-theme cycle-page">
            {/* Top Navigation */}
            <header className="dashboard-header">
                <div className="header-left">
                    <Link to={backDashboardPath} className="back-link">
                        <ArrowLeft className="icon-small" />
                        <span>Back to Dashboard</span>
                    </Link>
                </div>
                <Link className="dashboard-brand" to={backDashboardPath}>
                    HealthWiise
                </Link>
                <div className="header-actions">
                    <button
                        className="secondary-button refresh-btn"
                        onClick={fetchAllData}
                        disabled={loading}
                        aria-label="Refresh cycle records"
                    >
                        <RotateCw className={loading ? "spin-icon" : ""} />
                        <span>Refresh</span>
                    </button>
                </div>
            </header>

            <div className="cycle-container">
                {/* Hero Header */}
                <section className="cycle-hero">
                    <div className="cycle-hero-text">
                        <div className="cycle-badge">
                            <Flower2 className="icon-small" />
                            <span>WOMEN'S WELLNESS</span>
                        </div>
                        <h1>Cycle Tracking</h1>
                        <p className="muted">
                            Private menstrual logs, symptom tracking, and cautious cycle phase estimates.
                            Tracking is completely optional and personal to you.
                        </p>
                    </div>

                    <div className="cycle-hero-actions">
                        <button className="primary-button add-period-hero-btn" onClick={() => openAddPeriodModal()}>
                            <Plus className="icon-small" />
                            <span>Log Period</span>
                        </button>
                        <button className="secondary-button" onClick={() => openSymptomModal(selectedDate)}>
                            <Smile className="icon-small" />
                            <span>Log Symptoms</span>
                        </button>
                    </div>
                </section>

                {/* Error Banner */}
                {error && (
                    <div className="cycle-error-alert" role="alert">
                        <AlertCircle className="icon-small" />
                        <span>{error}</span>
                        <button className="text-button" onClick={fetchAllData}>
                            Retry
                        </button>
                    </div>
                )}

                {/* Metric Summary Strip */}
                <section className="cycle-summary-strip">
                    <div className="cycle-stat-tile">
                        <span className="stat-label">Current Cycle Day</span>
                        <div className="stat-value-group">
                            <span className="stat-value">
                                {summary?.current_cycle_day ? `Day ${summary.current_cycle_day}` : "—"}
                            </span>
                            {summary?.is_currently_bleeding && (
                                <span className="stat-tag flow-tag">Period Active</span>
                            )}
                        </div>
                        <span className="stat-subtext">
                            {summary?.latest_period
                                ? `Last started ${formatDateForDisplay(summary.latest_period.start_date)}`
                                : "No periods recorded yet"}
                        </span>
                    </div>

                    <div className="cycle-stat-tile">
                        <span className="stat-label">Average Cycle Length</span>
                        <div className="stat-value-group">
                            <span className="stat-value">
                                {summary?.average_cycle_length ? `${summary.average_cycle_length} days` : "—"}
                            </span>
                        </div>
                        <span className="stat-subtext">
                            {summary?.historical_cycle_lengths?.length
                                ? `Based on ${summary.historical_cycle_lengths.length + 1} recorded cycles`
                                : "Requires at least 2 recorded periods"}
                        </span>
                    </div>

                    <div className="cycle-stat-tile">
                        <span className="stat-label">Average Period Length</span>
                        <div className="stat-value-group">
                            <span className="stat-value">
                                {summary?.average_period_duration ? `${summary.average_period_duration} days` : "—"}
                            </span>
                        </div>
                        <span className="stat-subtext">
                            {summary?.average_period_duration
                                ? "Recorded duration of flow"
                                : "Add end dates to calculate average"}
                        </span>
                    </div>

                    <div className="cycle-stat-tile">
                        <span className="stat-label">Next Estimated Period</span>
                        <div className="stat-value-group">
                            <span className="stat-value">
                                {summary?.predictions?.predicted_next_start
                                    ? formatDateForDisplay(summary.predictions.predicted_next_start)
                                    : "—"}
                            </span>
                            {summary?.predictions && (
                                <span className="stat-tag estimate-tag">Estimate</span>
                            )}
                        </div>
                        <span className="stat-subtext">
                            {summary?.predictions
                                ? "Approximate projection (±2-4 days natural variation)"
                                : "Requires consistent period history"}
                        </span>
                    </div>
                </section>

                {/* Cycle Phase & Educational Section */}
                {summary?.estimated_phase && (
                    <section className="cycle-phase-card">
                        <div className="phase-card-header">
                            <div className="phase-badge">
                                <Sparkles className="icon-small" />
                                <span>CURRENT ESTIMATED PHASE</span>
                            </div>
                            <h3>{summary.estimated_phase.phase_name}</h3>
                            <p className="phase-description">{summary.estimated_phase.description}</p>
                        </div>

                        <div className="phase-timeline-bar">
                            <div
                                className={`phase-segment ${
                                    summary.estimated_phase.phase_name === "Menstrual Phase" ? "active" : ""
                                }`}
                            >
                                <span className="phase-title">Menstrual</span>
                                <span className="phase-sub">
                                    {summary.estimated_phase.phases_overview.menstrual}
                                </span>
                            </div>
                            <div
                                className={`phase-segment ${
                                    summary.estimated_phase.phase_name === "Follicular Phase" ? "active" : ""
                                }`}
                            >
                                <span className="phase-title">Follicular</span>
                                <span className="phase-sub">
                                    {summary.estimated_phase.phases_overview.follicular}
                                </span>
                            </div>
                            <div
                                className={`phase-segment ${
                                    summary.estimated_phase.phase_name === "Ovulation Window" ? "active" : ""
                                }`}
                            >
                                <span className="phase-title">Ovulation Window</span>
                                <span className="phase-sub">
                                    {summary.estimated_phase.phases_overview.ovulation_window}
                                </span>
                            </div>
                            <div
                                className={`phase-segment ${
                                    summary.estimated_phase.phase_name === "Luteal Phase" ? "active" : ""
                                }`}
                            >
                                <span className="phase-title">Luteal</span>
                                <span className="phase-sub">
                                    {summary.estimated_phase.phases_overview.luteal}
                                </span>
                            </div>
                        </div>

                        <div className="phase-disclaimer">
                            <Info className="icon-small" />
                            <span>
                                Cycle phases and fertile windows are statistical estimates based on your average cycle
                                intervals. They do not confirm clinical ovulation and must never be used as contraception.
                            </span>
                        </div>
                    </section>
                )}

                {/* Interactive Menstrual Calendar + Selected Day Panel */}
                <div className="cycle-main-grid">
                    {/* Calendar Column */}
                    <section className="cycle-calendar-card">
                        <div className="calendar-card-header">
                            <div className="calendar-title-group">
                                <CalendarIcon className="icon-small" />
                                <h2>
                                    {viewDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                                </h2>
                            </div>
                            <div className="calendar-nav-buttons">
                                <button className="icon-button" onClick={prevMonth} aria-label="Previous month">
                                    <ChevronLeft />
                                </button>
                                <button className="secondary-button today-btn" onClick={jumpToToday}>
                                    Today
                                </button>
                                <button className="icon-button" onClick={nextMonth} aria-label="Next month">
                                    <ChevronRight />
                                </button>
                            </div>
                        </div>

                        {/* Calendar Grid */}
                        <div className="calendar-weekdays">
                            <span>Sun</span>
                            <span>Mon</span>
                            <span>Tue</span>
                            <span>Wed</span>
                            <span>Thu</span>
                            <span>Fri</span>
                            <span>Sat</span>
                        </div>

                        <div className="calendar-day-matrix">
                            {calendarDays.map((cell, idx) => {
                                if (!cell.isCurrentMonth) {
                                    return <div key={`empty-${idx}`} className="calendar-day-cell empty" />;
                                }

                                const dateStr = cell.dateStr;
                                const isSelected = dateStr === selectedDate;
                                const isToday = dateStr === todayStr;
                                const periodStatus = isDateInPeriod(dateStr);
                                const isPredicted = isDatePredictedPeriod(dateStr);
                                const hasSymptoms = hasSymptomsOnDate(dateStr);

                                let cellClasses = "calendar-day-cell";
                                if (isSelected) cellClasses += " selected";
                                if (isToday) cellClasses += " is-today";
                                if (periodStatus.isPeriod) cellClasses += " in-period";
                                if (periodStatus.isOngoing) cellClasses += " is-ongoing";
                                if (isPredicted && !periodStatus.isPeriod) cellClasses += " is-predicted";

                                return (
                                    <button
                                        key={dateStr}
                                        className={cellClasses}
                                        onClick={() => setSelectedDate(dateStr)}
                                        aria-label={`Select ${dateStr}`}
                                    >
                                        <span className="day-number">{cell.dayNum}</span>
                                        <div className="cell-indicators">
                                            {periodStatus.isPeriod && (
                                                <span
                                                    className="period-indicator-dot"
                                                    title={`Flow: ${periodStatus.flow || "recorded"}`}
                                                />
                                            )}
                                            {hasSymptoms && (
                                                <span className="symptom-indicator-dot" title="Symptoms logged" />
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Calendar Legend */}
                        <div className="calendar-legend">
                            <div className="legend-item">
                                <span className="legend-swatch period-swatch" />
                                <span>Recorded Period</span>
                            </div>
                            <div className="legend-item">
                                <span className="legend-swatch predicted-swatch" />
                                <span>Predicted Period (Estimate)</span>
                            </div>
                            <div className="legend-item">
                                <span className="legend-swatch symptom-dot-swatch" />
                                <span>Symptoms Logged</span>
                            </div>
                            <div className="legend-item">
                                <span className="legend-swatch today-swatch" />
                                <span>Today</span>
                            </div>
                        </div>
                    </section>

                    {/* Selected Date Details Panel */}
                    <section className="cycle-day-details-card">
                        <div className="day-details-header">
                            <span className="eyebrow">DAY DETAILS</span>
                            <h3>{formatDateForDisplay(selectedDate)}</h3>
                            {selectedDate === todayStr && <span className="today-badge">Today</span>}
                        </div>

                        {/* Period Status for this Date */}
                        <div className="day-detail-block">
                            <h4 className="detail-heading">
                                <Flower2 className="icon-small" />
                                <span>Menstrual Period</span>
                            </h4>
                            {selectedDatePeriodStatus.isPeriod ? (
                                <div className="period-detail-box">
                                    <div className="period-status-row">
                                        <span className="flow-badge">
                                            Flow: {selectedDatePeriodStatus.flow || "Moderate"}
                                        </span>
                                        {selectedDatePeriodStatus.isOngoing && (
                                            <span className="ongoing-badge">Ongoing</span>
                                        )}
                                    </div>
                                    {selectedPeriodRecord?.notes && (
                                        <p className="period-notes-text">
                                            "{selectedPeriodRecord.notes}"
                                        </p>
                                    )}
                                    {selectedPeriodRecord && (
                                        <div className="period-detail-actions">
                                            <button
                                                className="secondary-button small-btn"
                                                onClick={() => openEditPeriodModal(selectedPeriodRecord)}
                                            >
                                                <Edit2 className="icon-small" />
                                                <span>Edit Period</span>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="no-period-box">
                                    <p className="muted small-text">No period recorded for this date.</p>
                                    <button
                                        className="secondary-button small-btn"
                                        onClick={() => openAddPeriodModal(selectedDate)}
                                    >
                                        <Plus className="icon-small" />
                                        <span>Log Period Starting {selectedDate}</span>
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Symptoms for this Date */}
                        <div className="day-detail-block">
                            <h4 className="detail-heading">
                                <Smile className="icon-small" />
                                <span>Symptoms & Mood</span>
                            </h4>
                            {selectedDateSymptoms ? (
                                <div className="symptoms-detail-box">
                                    {selectedDateSymptoms.mood && (
                                        <div className="detail-tag-row">
                                            <span className="mood-tag">
                                                Mood: {selectedDateSymptoms.mood}
                                            </span>
                                            {selectedDateSymptoms.energy_level && (
                                                <span className="energy-tag">
                                                    Energy: {selectedDateSymptoms.energy_level}
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    {selectedDateSymptoms.symptoms.length > 0 && (
                                        <div className="symptom-chips-list">
                                            {selectedDateSymptoms.symptoms.map((s, idx) => (
                                                <span key={idx} className={`symptom-chip severity-${s.severity}`}>
                                                    {s.name} ({s.severity})
                                                </span>
                                            ))}
                                        </div>
                                    )}

                                    {selectedDateSymptoms.notes && (
                                        <p className="symptom-notes-text">"{selectedDateSymptoms.notes}"</p>
                                    )}

                                    <div className="symptom-detail-actions">
                                        <button
                                            className="secondary-button small-btn"
                                            onClick={() => openSymptomModal(selectedDate)}
                                        >
                                            <Edit2 className="icon-small" />
                                            <span>Edit Symptoms</span>
                                        </button>
                                        <button
                                            className="icon-button danger-icon-btn"
                                            onClick={() =>
                                                setDeleteTarget({ type: "symptom", id: selectedDateSymptoms.id })
                                            }
                                            title="Delete symptom log"
                                            aria-label="Delete symptoms"
                                        >
                                            <Trash2 />
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="no-symptoms-box">
                                    <p className="muted small-text">No symptoms or mood logged for this date.</p>
                                    <button
                                        className="secondary-button small-btn"
                                        onClick={() => openSymptomModal(selectedDate)}
                                    >
                                        <Plus className="icon-small" />
                                        <span>Log Daily Symptoms</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    </section>
                </div>

                {/* Historical Periods Table */}
                <section className="cycle-history-card">
                    <div className="history-header">
                        <div>
                            <h2>Period History</h2>
                            <p className="muted">
                                Historical periods and recorded cycle intervals between consecutive start dates.
                            </p>
                        </div>
                        <button className="primary-button small-btn" onClick={() => openAddPeriodModal()}>
                            <Plus className="icon-small" />
                            <span>Add Period</span>
                        </button>
                    </div>

                    {periods.length === 0 ? (
                        <div className="cycle-empty-state">
                            <HeartHandshake className="empty-icon" />
                            <h3>No Periods Recorded Yet</h3>
                            <p className="muted">
                                When you record a period, your duration and cycle intervals will be tracked here.
                            </p>
                            <button className="primary-button" onClick={() => openAddPeriodModal()}>
                                Record First Period
                            </button>
                        </div>
                    ) : (
                        <div className="cycle-table-container">
                            <table className="cycle-table">
                                <thead>
                                    <tr>
                                        <th>Start Date</th>
                                        <th>End Date</th>
                                        <th>Duration</th>
                                        <th>Cycle Interval</th>
                                        <th>Flow</th>
                                        <th>Notes</th>
                                        <th style={{ textAlign: "right" }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {periods.map((p) => (
                                        <tr key={p.id}>
                                            <td className="bold-cell">{formatDateForDisplay(p.start_date)}</td>
                                            <td>
                                                {p.end_date ? (
                                                    formatDateForDisplay(p.end_date)
                                                ) : p.is_ongoing ? (
                                                    <span className="stat-tag flow-tag">Ongoing</span>
                                                ) : (
                                                    "—"
                                                )}
                                            </td>
                                            <td>
                                                {p.duration_days ? (
                                                    `${p.duration_days} days`
                                                ) : p.is_ongoing ? (
                                                    <span className="muted">In progress</span>
                                                ) : (
                                                    "—"
                                                )}
                                            </td>
                                            <td>
                                                {p.cycle_length_to_next ? (
                                                    <span className="cycle-interval-pill">
                                                        {p.cycle_length_to_next} days
                                                    </span>
                                                ) : (
                                                    <span className="muted">—</span>
                                                )}
                                            </td>
                                            <td>
                                                <span className={`flow-indicator flow-${p.flow_level || "moderate"}`}>
                                                    {p.flow_level || "Moderate"}
                                                </span>
                                            </td>
                                            <td className="notes-cell">{p.notes || <span className="muted">—</span>}</td>
                                            <td style={{ textAlign: "right" }}>
                                                <div className="table-actions">
                                                    <button
                                                        className="icon-button"
                                                        onClick={() => openEditPeriodModal(p)}
                                                        title="Edit period"
                                                        aria-label="Edit period"
                                                    >
                                                        <Edit2 />
                                                    </button>
                                                    <button
                                                        className="icon-button danger-icon-btn"
                                                        onClick={() => setDeleteTarget({ type: "period", id: p.id })}
                                                        title="Delete period"
                                                        aria-label="Delete period"
                                                    >
                                                        <Trash2 />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>

                {/* Symptom Frequency & Observations Section */}
                {summary?.frequent_symptoms && summary.frequent_symptoms.length > 0 && (
                    <section className="cycle-observations-card">
                        <h3>Frequently Logged Symptoms</h3>
                        <p className="muted">Observations from your personal logged notes over time.</p>
                        <div className="frequent-symptoms-list">
                            {summary.frequent_symptoms.map((item, idx) => (
                                <div key={idx} className="observation-pill">
                                    <span className="observation-name">{item.name}</span>
                                    <span className="observation-count">
                                        Logged {item.count} {item.count === 1 ? "time" : "times"}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* Transparent Medical Disclaimer Footer */}
                <footer className="cycle-footer-disclaimer">
                    <div className="disclaimer-content">
                        <AlertCircle className="disclaimer-icon" />
                        <div>
                            <h4>Health & Privacy Notice</h4>
                            <p>
                                HealthWiise cycle tracking calculations, estimated phases, and predicted dates are purely
                                informational mathematical estimates based on your recorded dates. They do not constitute
                                medical advice, clinical diagnoses, or confirmed ovulation, and should <strong>NEVER</strong>{" "}
                                be relied upon for contraception or medical decision-making. Your cycle data is encrypted,
                                private, and isolated to your personal account.
                            </p>
                        </div>
                    </div>
                </footer>
            </div>

            {/* =====================================================================
                PERIOD MODAL
               ===================================================================== */}
            {periodModalOpen && (
                <div className="cycle-modal-overlay" role="dialog" aria-modal="true">
                    <div className="cycle-modal-card">
                        <div className="modal-header">
                            <h3>{editingPeriodId ? "Edit Period Record" : "Log Menstrual Period"}</h3>
                            <button
                                className="icon-button close-btn"
                                onClick={() => setPeriodModalOpen(false)}
                                aria-label="Close"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleSavePeriod} className="cycle-form">
                            {periodFormError && (
                                <div className="form-error-alert" role="alert">
                                    <AlertCircle className="icon-small" />
                                    <span>{periodFormError}</span>
                                </div>
                            )}

                            <div className="form-group">
                                <label htmlFor="period-start-date">Start Date *</label>
                                <input
                                    id="period-start-date"
                                    type="date"
                                    value={periodStartDate}
                                    onChange={(e) => setPeriodStartDate(e.target.value)}
                                    required
                                    className="cycle-input"
                                />
                            </div>

                            <div className="form-group checkbox-group">
                                <label className="checkbox-label">
                                    <input
                                        type="checkbox"
                                        checked={periodIsOngoing}
                                        onChange={(e) => {
                                            setPeriodIsOngoing(e.target.checked);
                                            if (e.target.checked) setPeriodEndDate("");
                                        }}
                                    />
                                    <span>Period is currently ongoing (no end date yet)</span>
                                </label>
                            </div>

                            {!periodIsOngoing && (
                                <div className="form-group">
                                    <label htmlFor="period-end-date">End Date (optional)</label>
                                    <input
                                        id="period-end-date"
                                        type="date"
                                        value={periodEndDate}
                                        onChange={(e) => setPeriodEndDate(e.target.value)}
                                        min={periodStartDate}
                                        className="cycle-input"
                                    />
                                </div>
                            )}

                            <div className="form-group">
                                <label>Flow Level</label>
                                <div className="flow-options-grid">
                                    {(["spotting", "light", "moderate", "heavy"] as FlowLevel[]).map((f) => (
                                        <button
                                            key={f}
                                            type="button"
                                            className={`flow-choice-btn ${periodFlow === f ? "active" : ""}`}
                                            onClick={() => setPeriodFlow(f)}
                                        >
                                            {f.charAt(0).toUpperCase() + f.slice(1)}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="form-group">
                                <label htmlFor="period-notes">Notes (optional)</label>
                                <textarea
                                    id="period-notes"
                                    value={periodNotes}
                                    onChange={(e) => setPeriodNotes(e.target.value)}
                                    maxLength={500}
                                    placeholder="Add any personal notes about your cycle, symptoms, or remedies..."
                                    rows={3}
                                    className="cycle-textarea"
                                />
                            </div>

                            <div className="modal-actions">
                                {editingPeriodId && (
                                    <button
                                        type="button"
                                        className="danger-button modal-delete-btn"
                                        onClick={() => {
                                            setPeriodModalOpen(false);
                                            setDeleteTarget({ type: "period", id: editingPeriodId });
                                        }}
                                    >
                                        Delete
                                    </button>
                                )}
                                <div className="modal-right-buttons">
                                    <button
                                        type="button"
                                        className="secondary-button"
                                        onClick={() => setPeriodModalOpen(false)}
                                    >
                                        Cancel
                                    </button>
                                    <button type="submit" className="primary-button" disabled={periodSaving}>
                                        {periodSaving ? "Saving..." : editingPeriodId ? "Save Changes" : "Save Record"}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* =====================================================================
                SYMPTOM MODAL
               ===================================================================== */}
            {symptomModalOpen && (
                <div className="cycle-modal-overlay" role="dialog" aria-modal="true">
                    <div className="cycle-modal-card symptom-modal">
                        <div className="modal-header">
                            <div>
                                <h3>Log Daily Symptoms & Mood</h3>
                                <p className="muted small-text">Date: {formatDateForDisplay(symptomLogDate)}</p>
                            </div>
                            <button
                                className="icon-button close-btn"
                                onClick={() => setSymptomModalOpen(false)}
                                aria-label="Close"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleSaveSymptoms} className="cycle-form">
                            {symptomFormError && (
                                <div className="form-error-alert" role="alert">
                                    <AlertCircle className="icon-small" />
                                    <span>{symptomFormError}</span>
                                </div>
                            )}

                            {/* Symptoms picker */}
                            <div className="form-group">
                                <label>Symptoms (select all that apply)</label>
                                <div className="symptom-picker-grid">
                                    {COMMON_SYMPTOMS.map((name) => {
                                        const isSelected = selectedSymptoms.has(name);
                                        const severity = selectedSymptoms.get(name) || "mild";
                                        return (
                                            <div
                                                key={name}
                                                className={`symptom-select-card ${isSelected ? "selected" : ""}`}
                                            >
                                                <button
                                                    type="button"
                                                    className="symptom-toggle-btn"
                                                    onClick={() => toggleSymptom(name)}
                                                >
                                                    <span>{name}</span>
                                                </button>
                                                {isSelected && (
                                                    <div className="severity-controls">
                                                        {(["mild", "moderate", "severe"] as SymptomSeverity[]).map(
                                                            (sev) => (
                                                                <button
                                                                    key={sev}
                                                                    type="button"
                                                                    className={`sev-btn ${
                                                                        severity === sev ? "active" : ""
                                                                    }`}
                                                                    onClick={() => setSymptomSeverity(name, sev)}
                                                                >
                                                                    {sev.charAt(0).toUpperCase()}
                                                                </button>
                                                            )
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Mood Picker */}
                            <div className="form-group">
                                <label>Mood</label>
                                <div className="mood-picker-grid">
                                    {MOOD_OPTIONS.map((m) => (
                                        <button
                                            key={m.value}
                                            type="button"
                                            className={`mood-choice-btn ${symptomMood === m.value ? "active" : ""}`}
                                            onClick={() =>
                                                setSymptomMood(symptomMood === m.value ? null : m.value)
                                            }
                                        >
                                            <span className="mood-emoji">{m.emoji}</span>
                                            <span>{m.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Energy Level */}
                            <div className="form-group">
                                <label>
                                    <Battery className="icon-small inline-icon" />
                                    <span>Energy Level</span>
                                </label>
                                <div className="energy-options-grid">
                                    {(["low", "medium", "high"] as EnergyLevel[]).map((e) => (
                                        <button
                                            key={e}
                                            type="button"
                                            className={`energy-choice-btn ${symptomEnergy === e ? "active" : ""}`}
                                            onClick={() =>
                                                setSymptomEnergy(symptomEnergy === e ? null : e)
                                            }
                                        >
                                            {e.charAt(0).toUpperCase() + e.slice(1)}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Notes */}
                            <div className="form-group">
                                <label htmlFor="symptom-notes">Notes</label>
                                <textarea
                                    id="symptom-notes"
                                    value={symptomNotes}
                                    onChange={(e) => setSymptomNotes(e.target.value)}
                                    maxLength={500}
                                    placeholder="How are you feeling today?"
                                    rows={2}
                                    className="cycle-textarea"
                                />
                            </div>

                            <div className="modal-actions">
                                <div className="modal-right-buttons">
                                    <button
                                        type="button"
                                        className="secondary-button"
                                        onClick={() => setSymptomModalOpen(false)}
                                    >
                                        Cancel
                                    </button>
                                    <button type="submit" className="primary-button" disabled={symptomSaving}>
                                        {symptomSaving ? "Saving..." : "Save Daily Log"}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* =====================================================================
                CONFIRMATION DELETE DIALOG
               ===================================================================== */}
            {deleteTarget && (
                <div className="cycle-modal-overlay" role="dialog" aria-modal="true">
                    <div className="cycle-modal-card confirm-delete-modal">
                        <h3>Confirm Deletion</h3>
                        <p className="muted">
                            Are you sure you want to permanently delete this {deleteTarget.type} record? This action cannot
                            be undone.
                        </p>
                        <div className="modal-actions">
                            <button className="secondary-button" onClick={() => setDeleteTarget(null)}>
                                Cancel
                            </button>
                            <button className="danger-button" onClick={confirmDelete}>
                                Delete Permanently
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </main>
    );
}
