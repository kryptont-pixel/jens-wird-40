import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { CheckSquare, Download, ExternalLink, FileImage, LoaderCircle, LogOut, MessageCircle, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { Header } from "../components/Header";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { api, ApiError, formatBytes, formatDate } from "../lib/api";
import type { AdminMedia, GuestbookEntry } from "../types";

type Tab = "media" | "guestbook";

export function AdminPage() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [pin, setPin] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("media");
  const [media, setMedia] = useState<AdminMedia[]>([]);
  const [entries, setEntries] = useState<GuestbookEntry[]>([]);
  const [selectedMedia, setSelectedMedia] = useState<Set<string>>(new Set());
  const [selectedEntries, setSelectedEntries] = useState<Set<string>>(new Set());
  const [confirm, setConfirm] = useState<Tab | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true); setNotice(null);
    try {
      const [mediaData, guestbookData] = await Promise.all([
        api<{ items: AdminMedia[] }>("admin-media"),
        api<{ entries: GuestbookEntry[] }>("admin-guestbook"),
      ]);
      setMedia(mediaData.items); setEntries(guestbookData.entries); setAuthenticated(true);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) setAuthenticated(false);
      else setNotice(error instanceof Error ? error.message : "Die Verwaltungsdaten konnten nicht geladen werden.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    api<{ authenticated: boolean }>("admin-auth")
      .then((data) => { setAuthenticated(data.authenticated); if (data.authenticated) void loadData(); })
      .catch(() => setAuthenticated(false));
  }, [loadData]);

  const login = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true); setLoginError(null);
    try {
      await api<{ authenticated: boolean }>("admin-auth", { method: "POST", body: JSON.stringify({ pin }) });
      setPin(""); setAuthenticated(true); await loadData();
    } catch (error) { setLoginError(error instanceof Error ? error.message : "Anmeldung fehlgeschlagen."); }
    finally { setLoading(false); }
  };

  const logout = async () => {
    await api("admin-auth", { method: "DELETE" }).catch(() => undefined);
    setAuthenticated(false); setMedia([]); setEntries([]); setSelectedMedia(new Set()); setSelectedEntries(new Set());
  };

  const toggle = (kind: Tab, id: string) => {
    const setter = kind === "media" ? setSelectedMedia : setSelectedEntries;
    setter((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  const selectAll = () => {
    if (tab === "media") setSelectedMedia((current) => current.size === media.length ? new Set() : new Set(media.map((item) => item.id)));
    else setSelectedEntries((current) => current.size === entries.length ? new Set() : new Set(entries.map((item) => item.id)));
  };

  const selectedCount = tab === "media" ? selectedMedia.size : selectedEntries.size;
  const deleteSelected = async () => {
    const kind = confirm;
    setConfirm(null);
    if (!kind) return;
    setLoading(true); setNotice(null);
    try {
      if (kind === "media") {
        const result = await api<{ deleted: string[]; failed: string[] }>("admin-media", { method: "DELETE", body: JSON.stringify({ ids: [...selectedMedia] }) });
        setMedia((current) => current.filter((item) => !result.deleted.includes(item.id)));
        setSelectedMedia(new Set());
        setNotice(result.failed.length ? `${result.deleted.length} gelöscht, ${result.failed.length} nicht gelöscht.` : `${result.deleted.length} Datei(en) gelöscht.`);
      } else {
        const result = await api<{ deleted: string[] }>("admin-guestbook", { method: "DELETE", body: JSON.stringify({ ids: [...selectedEntries] }) });
        setEntries((current) => current.filter((entry) => !result.deleted.includes(entry.id)));
        setSelectedEntries(new Set()); setNotice(`${result.deleted.length} Eintrag/Einträge gelöscht.`);
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) setAuthenticated(false);
      setNotice(error instanceof Error ? error.message : "Löschen fehlgeschlagen.");
    } finally { setLoading(false); }
  };

  const downloadSelected = async () => {
    const selected = media.filter((item) => selectedMedia.has(item.id));
    for (let i = 0; i < selected.length; i += 3) {
      selected.slice(i, i + 3).forEach((item) => {
        const link = document.createElement("a");
        link.href = item.originalUrl; link.download = item.originalName; link.rel = "noopener"; document.body.appendChild(link); link.click(); link.remove();
      });
      if (i + 3 < selected.length) await new Promise((resolve) => window.setTimeout(resolve, 700));
    }
  };

  const totalSize = useMemo(() => media.reduce((sum, item) => sum + item.size, 0), [media]);

  if (authenticated === null) return <div className="admin-page"><Header /><main className="admin-loading"><LoaderCircle className="spin" /><p>Geschützter Bereich wird geprüft …</p></main></div>;
  if (!authenticated) return (
    <div className="admin-page"><Header /><main className="login-wrap"><form className="login-card" onSubmit={login}><div className="admin-mark"><ShieldCheck /></div><p className="section-kicker">Nur für Admins</p><h1>Verwaltung</h1><p>Gib die sechsstellige Admin-PIN ein, um Originale, Downloads und Gästebucheinträge zu verwalten.</p><label>Admin-PIN<input type="password" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="current-password" aria-describedby="admin-pin-hint" required /></label><span id="admin-pin-hint" className="sr-only">Die PIN besteht aus genau sechs Ziffern.</span>{loginError && <p className="form-message error" role="alert">{loginError}</p>}<button className="button button-primary button-large" type="submit" disabled={loading || pin.length !== 6}>{loading ? <><LoaderCircle className="spin" /> Wird geprüft …</> : "Sicher anmelden"}</button></form></main></div>
  );

  return (
    <div className="admin-page"><Header /><main className="admin-main">
      <div className="admin-top"><div><p className="section-kicker">Admin-Bereich</p><h1>Party-Archiv</h1><p>{media.length} Medien · {formatBytes(totalSize)} · {entries.length} Grüße</p></div><div><button className="icon-text-button" type="button" onClick={loadData}><RefreshCw /> Aktualisieren</button><button className="icon-text-button" type="button" onClick={logout}><LogOut /> Abmelden</button></div></div>
      <div className="admin-tabs" role="tablist" aria-label="Verwaltungsbereiche"><button type="button" role="tab" aria-selected={tab === "media"} onClick={() => setTab("media")}><FileImage /> Medien <span>{media.length}</span></button><button type="button" role="tab" aria-selected={tab === "guestbook"} onClick={() => setTab("guestbook")}><MessageCircle /> Gästebuch <span>{entries.length}</span></button></div>
      <div className="admin-toolbar"><button className="button button-secondary" type="button" onClick={selectAll}><CheckSquare /> {selectedCount && selectedCount === (tab === "media" ? media.length : entries.length) ? "Auswahl aufheben" : "Alle auswählen"}</button><span>{selectedCount ? `${selectedCount} ausgewählt` : "Nichts ausgewählt"}</span><div>{tab === "media" && <button className="button button-secondary" type="button" disabled={!selectedMedia.size} onClick={downloadSelected}><Download /> Auswahl herunterladen</button>}<button className="button button-danger" type="button" disabled={!selectedCount} onClick={() => setConfirm(tab)}><Trash2 /> Löschen</button></div></div>
      {notice && <p className="admin-notice" role="status">{notice}</p>}
      {loading && <div className="admin-loading-inline"><LoaderCircle className="spin" /> Daten werden aktualisiert …</div>}
      {tab === "media" ? <div className="admin-media-grid">{media.map((item) => <article className={`admin-media-card${selectedMedia.has(item.id) ? " selected" : ""}`} key={item.id}><label className="select-check"><input type="checkbox" checked={selectedMedia.has(item.id)} onChange={() => toggle("media", item.id)} /><span>Auswählen</span></label><div className="admin-thumb">{item.previewUrl ? <img src={item.previewUrl} alt="Vorschau" loading="lazy" /> : <FileImage />}</div><div className="admin-card-copy"><strong title={item.originalName}>{item.originalName}</strong><span>{formatDate(item.createdAt)}</span><span>{item.mimeType} · {formatBytes(item.size)}</span><div><a className="mini-action" href={item.originalViewUrl} target="_blank" rel="noopener noreferrer"><ExternalLink /> Original öffnen</a><a className="mini-action" href={item.originalUrl} download><Download /> Download</a></div></div></article>)}{!media.length && <div className="state-card"><FileImage /><p>Noch keine Medien vorhanden.</p></div>}</div> : <div className="admin-entry-list">{entries.map((entry) => <article className={`admin-entry${selectedEntries.has(entry.id) ? " selected" : ""}`} key={entry.id}><label className="select-check"><input type="checkbox" checked={selectedEntries.has(entry.id)} onChange={() => toggle("guestbook", entry.id)} /><span>Auswählen</span></label><div><p>{entry.message}</p><span>{entry.name || "Anonym"} · {formatDate(entry.createdAt)}</span></div></article>)}{!entries.length && <div className="state-card"><MessageCircle /><p>Noch keine Gästebucheinträge vorhanden.</p></div>}</div>}
    </main><ConfirmDialog open={Boolean(confirm)} count={confirm === "media" ? selectedMedia.size : selectedEntries.size} label={confirm === "media" ? "Datei" : "Eintrag"} onCancel={() => setConfirm(null)} onConfirm={deleteSelected} /></div>
  );
}
