import { useEffect, useRef, useState, type FormEvent } from "react";
import { Bot, MessageCircle, Send, X } from "lucide-react";
import api from "../services/api";

interface ChatMessage {
    role: "user" | "assistant";
    content: string;
}

const SUGGESTIONS = [
    "How was my sleep this month?",
    "Am I drinking enough water?",
    "What should I improve this week?",
];

const GREETING: ChatMessage = {
    role: "assistant",
    content:
        "Hi! I'm your HealthWiise Coach. Ask me about your sleep, water, workouts or meals and I'll use your own data to answer.",
};

export default function AICoachChat() {
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
    const [input, setInput] = useState("");
    const [sending, setSending] = useState(false);
    const endRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, sending, open]);

    async function send(text: string) {
        const message = text.trim();
        if (!message || sending) return;

        const history = messages.filter((m) => m !== GREETING);
        setMessages((prev) => [...prev, { role: "user", content: message }]);
        setInput("");
        setSending(true);

        try {
            const res = await api.post<{ reply: string }>(
                "/api/ai/coach/chat",
                { message, history },
                { timeout: 30000 }
            );
            setMessages((prev) => [...prev, { role: "assistant", content: res.data.reply }]);
        } catch {
            setMessages((prev) => [
                ...prev,
                { role: "assistant", content: "Sorry, I couldn't reach the coach right now. Please try again." },
            ]);
        } finally {
            setSending(false);
        }
    }

    function handleSubmit(e: FormEvent) {
        e.preventDefault();
        void send(input);
    }

    return (
        <>
            {open && (
                <section className="coach-panel" aria-label="AI wellness coach">
                    <header className="coach-header">
                        <span>
                            <Bot size={18} /> AI Wellness Coach
                        </span>
                        <button type="button" onClick={() => setOpen(false)} aria-label="Close chat">
                            <X size={18} />
                        </button>
                    </header>

                    <div className="coach-messages">
                        {messages.map((m, i) => (
                            <div key={i} className={`coach-msg ${m.role}`}>
                                {m.content}
                            </div>
                        ))}
                        {sending && <div className="coach-msg assistant coach-typing">Thinking…</div>}
                        {messages.length === 1 && (
                            <div className="coach-suggestions">
                                {SUGGESTIONS.map((s) => (
                                    <button key={s} type="button" onClick={() => void send(s)}>
                                        {s}
                                    </button>
                                ))}
                            </div>
                        )}
                        <div ref={endRef} />
                    </div>

                    <form className="coach-input" onSubmit={handleSubmit}>
                        <input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Ask your coach…"
                            maxLength={1000}
                        />
                        <button type="submit" disabled={sending || !input.trim()} aria-label="Send">
                            <Send size={18} />
                        </button>
                    </form>
                    <p className="coach-disclaimer">General wellness guidance, not medical advice.</p>
                </section>
            )}

            <button
                type="button"
                className="coach-fab"
                onClick={() => setOpen((o) => !o)}
                aria-label="Open AI wellness coach"
            >
                {open ? <X size={26} /> : <MessageCircle size={26} />}
            </button>
        </>
    );
}
