import { FormEvent, useCallback, useEffect, useState } from "react";
import { LoaderCircle, MessageCircle, Send } from "lucide-react";
import { EVENT } from "../config/event";
import { api, ApiError, formatDate } from "../lib/api";
import type { GuestbookEntry } from "../types";
import { Turnstile } from "./Turnstile";

export function Guestbook() {
  const [entries, setEntries] = useState<GuestbookEntry[]>([]);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [resetSignal, setResetSignal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<{ entries: GuestbookEntry[] }>("guestbook");
      setEntries(data.entries);
      setError(null);
    } catch { setError("Das Gästebuch ist gerade nicht erreichbar."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(initial);
  }, [load]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const turnstileToken = token || (import.meta.env.DEV ? "test-bypass" : null);
    if (!message.trim() || !turnstileToken) return;
    setSubmitting(true); setError(null); setSuccess(null);
    try {
      const data = await api<{ entry: GuestbookEntry; message: string }>("guestbook", {
        method: "POST",
        body: JSON.stringify({ name, message, turnstileToken }),
      });
      setEntries((current) => [data.entry, ...current]);
      setName(""); setMessage(""); setSuccess(data.message);
      setResetSignal((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Dein Gruß konnte nicht gespeichert werden.");
    } finally { setSubmitting(false); }
  };

  return (
    <section className="guestbook-section" id="gaestebuch" aria-labelledby="guestbook-title">
      <div className="section-heading light">
        <div><p className="section-kicker">Ein paar Worte für später</p><h2 id="guestbook-title">Gästebuch</h2><p>Ein Gruß, ein Insider oder einfach ein „Prost, Jens!“</p></div>
      </div>
      <div className="guestbook-grid">
        <form className="guestbook-form" onSubmit={submit}>
          <label>Name <span>optional</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} autoComplete="name" placeholder="Wie dürfen wir dich nennen?" /></label>
          <label>Dein Gruß<textarea value={message} onChange={(event) => setMessage(event.target.value)} minLength={2} maxLength={EVENT.guestbookMaxChars} rows={5} required placeholder="Schreib Jens ein paar Zeilen …" /></label>
          <div className="character-count">{message.length} / {EVENT.guestbookMaxChars}</div>
          <Turnstile onToken={setToken} resetSignal={resetSignal} />
          {error && <p className="form-message error" role="alert">{error}</p>}
          {success && <p className="form-message success" role="status">{success}</p>}
          <button className="button button-primary" type="submit" disabled={submitting || !message.trim() || (!token && !import.meta.env.DEV)}>{submitting ? <><LoaderCircle className="spin" /> Wird gespeichert …</> : <><Send /> Gruß eintragen</>}</button>
        </form>
        <div className="guestbook-entries" aria-live="polite">
          {loading && <div className="entry-card muted"><LoaderCircle className="spin" /> Grüße werden geladen …</div>}
          {!loading && !entries.length && <div className="entry-card empty"><MessageCircle /><strong>Noch ist die erste Seite frei.</strong><span>Dein Gruß kann der Anfang sein.</span></div>}
          {entries.map((entry) => <article className="entry-card" key={entry.id}><p>{entry.message}</p><footer><strong>{entry.name || "Ein lieber Gast"}</strong><time dateTime={entry.createdAt}>{formatDate(entry.createdAt)}</time></footer></article>)}
        </div>
      </div>
    </section>
  );
}
