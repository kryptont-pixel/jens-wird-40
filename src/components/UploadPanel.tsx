import { useCallback, useRef, useState } from "react";
import { Camera, Check, CircleAlert, FileImage, ImagePlus, LoaderCircle, RefreshCw, Trash2, UploadCloud, X } from "lucide-react";
import { Link } from "react-router-dom";
import { EVENT, IMAGE_MIME_TYPES, VIDEO_MIME_TYPES } from "../config/event";
import { api, ApiError, formatBytes } from "../lib/api";
import { generatePreview, type GeneratedPreview } from "../lib/preview";
import { putBlob } from "../lib/xhr";

type Status = "queued" | "preparing" | "uploading" | "finalizing" | "success" | "error" | "canceled";

interface UploadItem {
  id: string;
  file: File;
  status: Status;
  progress: number;
  error?: string;
}

interface SignedPut { url: string; headers: Record<string, string>; expiresIn: number }
interface UploadSessionResponse {
  id: string;
  uploadToken: string;
  mode: "single" | "multipart" | "netlify";
  original: SignedPut | { partSize: number; parts: Array<{ partNumber: number; url: string }>; expiresIn: number };
  preview: SignedPut | null;
}

const accepted = new Set<string>([...IMAGE_MIME_TYPES, ...VIDEO_MIME_TYPES]);

function normalizedFile(file: File): File {
  if (file.type) return file;
  const extension = file.name.split(".").pop()?.toLowerCase();
  const inferred: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", heic: "image/heic", heif: "image/heif", mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm" };
  return extension && inferred[extension] ? new File([file], file.name, { type: inferred[extension], lastModified: file.lastModified }) : file;
}

const netlifyStorage = import.meta.env.VITE_MEDIA_STORAGE === "netlify";
const netlifyMaxBytes = 20 * 1024 * 1024;

function clientError(file: File): string | null {
  if (!accepted.has(file.type)) return "Dieser Dateityp wird nicht unterstützt.";
  const max = netlifyStorage ? netlifyMaxBytes : file.type.startsWith("image/") ? EVENT.maxImageBytes : EVENT.maxVideoBytes;
  if (file.size > max) return `Zu groß – maximal ${netlifyStorage ? "20 MB im Netlify-Testbetrieb" : file.type.startsWith("image/") ? "50 MB" : "2 GB"}.`;
  if (file.size <= 0) return "Die Datei ist leer.";
  return null;
}

async function retry<T>(action: (attempt: number) => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try { return await action(attempt); } catch (error) {
      lastError = error;
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      if (attempt < attempts - 1) await new Promise((resolve) => window.setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
  throw lastError;
}

export function UploadPanel({ compact = false }: { compact?: boolean }) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const sessions = useRef(new Map<string, UploadSessionResponse>());
  const controllers = useRef(new Map<string, AbortController>());
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const update = useCallback((id: string, patch: Partial<UploadItem>) => {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }, []);

  const addFiles = useCallback((selected: FileList | File[]) => {
    const next = Array.from(selected).slice(0, Math.max(0, 20 - items.length)).map(normalizedFile).map((file) => {
      const error = clientError(file);
      return { id: crypto.randomUUID(), file, status: error ? "error" : "queued", progress: 0, error: error ?? undefined } as UploadItem;
    });
    setItems((current) => [...current, ...next]);
  }, [items.length]);

  const uploadFile = useCallback(async (item: UploadItem, preview: GeneratedPreview | null, session: UploadSessionResponse) => {
    const controller = new AbortController();
    controllers.current.set(item.id, controller);
    const authHeaders = { authorization: `Bearer ${session.uploadToken}` };
    try {
      update(item.id, { status: "uploading", progress: 2, error: undefined });
      if (preview && session.preview) {
        await retry(() => putBlob(session.preview!.url, preview.blob, session.mode === "netlify" ? authHeaders : session.preview!.headers, controller.signal, (loaded, total) => update(item.id, { progress: 2 + Math.round((loaded / total) * 5) })));
      }

      let parts: Array<{ partNumber: number; etag: string }> | undefined;
      if (session.mode === "single") {
        const signed = session.original as SignedPut;
        await retry(() => putBlob(signed.url, item.file, signed.headers, controller.signal, (loaded, total) => update(item.id, { progress: 7 + Math.round((loaded / total) * 88) })));
      } else {
        const signed = session.original as { partSize: number; parts: Array<{ partNumber: number; url: string }> };
        const completed = new Map<number, string>();
        const loaded = new Map<number, number>();
        let cursor = 0;
        const worker = async () => {
          while (cursor < signed.parts.length) {
            const index = cursor++;
            const part = signed.parts[index];
            const start = (part.partNumber - 1) * signed.partSize;
            const blob = item.file.slice(start, Math.min(item.file.size, start + signed.partSize));
            let currentUrl = part.url;
            const result = await retry(async (attempt) => {
              if (attempt > 0 && session.mode !== "netlify") {
                const fresh = await api<{ url: string }>("upload-part", {
                  method: "POST",
                  headers: authHeaders,
                  body: JSON.stringify({ sessionId: session.id, partNumber: part.partNumber }),
                });
                currentUrl = fresh.url;
              }
              return putBlob(currentUrl, blob, session.mode === "netlify" ? authHeaders : {}, controller.signal, (value) => {
                loaded.set(part.partNumber, value);
                const totalLoaded = [...loaded.values()].reduce((sum, amount) => sum + amount, 0);
                update(item.id, { progress: 7 + Math.round((totalLoaded / item.file.size) * 88) });
              });
            });
            if (session.mode !== "netlify") {
              if (!result.etag) throw new Error("Der Server hat den Upload-Teil nicht bestätigt.");
              completed.set(part.partNumber, result.etag);
            }
          }
        };
        await Promise.all(Array.from({ length: Math.min(3, signed.parts.length) }, worker));
        parts = [...completed.entries()].sort(([a], [b]) => a - b).map(([partNumber, etag]) => ({ partNumber, etag }));
      }

      update(item.id, { status: "finalizing", progress: 97 });
      await api("upload-finalize", {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ sessionId: session.id, parts, width: preview?.width, height: preview?.height }),
      });
      update(item.id, { status: "success", progress: 100 });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") update(item.id, { status: "canceled", error: "Upload abgebrochen." });
      else update(item.id, { status: "error", error: error instanceof Error ? error.message : "Upload fehlgeschlagen." });
    } finally {
      controllers.current.delete(item.id);
    }
  }, [update]);

  const startUploads = useCallback(async (onlyIds?: string[]) => {
    const candidates = items.filter((item) => (!onlyIds || onlyIds.includes(item.id)) && ["queued", "error", "canceled"].includes(item.status) && !clientError(item.file));
    if (!candidates.length) return;
    const prepared: Array<{ item: UploadItem; preview: GeneratedPreview | null }> = [];
    for (const item of candidates) {
      update(item.id, { status: "preparing", progress: 1, error: undefined });
      const preview = await generatePreview(item.file);
      const previewRequired = item.file.type.startsWith("image/") && !["image/heic", "image/heif"].includes(item.file.type);
      if (previewRequired && !preview) {
        update(item.id, { status: "error", error: "Dieses Bild konnte auf diesem Gerät nicht sicher vorbereitet werden." });
      } else prepared.push({ item, preview });
    }
    if (!prepared.length) return;
    try {
      const response = await api<{ uploads: UploadSessionResponse[] }>("upload-init", {
        method: "POST",
        body: JSON.stringify({
          files: prepared.map(({ item, preview }) => ({ name: item.file.name, size: item.file.size, type: item.file.type, wantsPreview: Boolean(preview) })),
        }),
      });
      response.uploads.forEach((session, index) => sessions.current.set(prepared[index].item.id, session));
      let cursor = 0;
      const worker = async () => {
        while (cursor < prepared.length) {
          const index = cursor++;
          await uploadFile(prepared[index].item, prepared[index].preview, response.uploads[index]);
        }
      };
      await Promise.all(Array.from({ length: Math.min(3, prepared.length) }, worker));
    } catch (error) {
      const message = error instanceof ApiError ? error.message : "Der Upload konnte nicht gestartet werden.";
      prepared.forEach(({ item }) => update(item.id, { status: "error", error: message }));
    }
  }, [items, update, uploadFile]);

  const cancel = useCallback(async (item: UploadItem) => {
    controllers.current.get(item.id)?.abort();
    const session = sessions.current.get(item.id);
    if (session) await api("upload-abort", { method: "POST", headers: { authorization: `Bearer ${session.uploadToken}` }, body: JSON.stringify({ sessionId: session.id }) }).catch(() => undefined);
    update(item.id, { status: "canceled", error: "Upload abgebrochen." });
  }, [update]);

  const successes = items.filter((item) => item.status === "success").length;
  const active = items.some((item) => ["preparing", "uploading", "finalizing"].includes(item.status));
  const overall = items.length ? Math.round(items.reduce((sum, item) => sum + item.progress, 0) / items.length) : 0;
  const ready = items.some((item) => ["queued", "error", "canceled"].includes(item.status) && !clientError(item.file));
  const completionMessage = successes === 1 && items.length === 1 ? "Danke! Dein Bild ist jetzt dabei! 🎉" : successes > 0 && successes === items.length ? "Danke! Deine Bilder sind jetzt dabei! 🎉" : null;
  const acceptMime = [...IMAGE_MIME_TYPES, ...VIDEO_MIME_TYPES].join(",");

  if (compact && !items.length) {
    return (
      <div className="upload-compact">
        <div><p className="section-kicker">Dein Blick auf den Abend</p><h2>Ein Foto. Zwei Klicks. Fertig.</h2><p>Ohne Anmeldung, ohne Namensfeld – direkt vom Handy in deine persönliche Galerie.</p></div>
        <Link className="button button-primary button-large" to="/upload"><Camera aria-hidden="true" /> Jetzt hochladen</Link>
      </div>
    );
  }

  return (
    <section className="upload-panel" aria-labelledby="upload-heading">
      <div className="upload-heading-row">
        <div><p className="section-kicker">Direkt vom Handy</p><h1 id="upload-heading">Deine Bilder. Unser Abend.</h1><p>Aufnehmen oder auswählen, hochladen, fertig. Kein Konto nötig.</p></div>
        <span className="privacy-chip">Privater Speicher</span>
      </div>

      <div
        className={`dropzone${dragging ? " is-dragging" : ""}`}
        onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => { if (event.currentTarget === event.target) setDragging(false); }}
        onDrop={(event) => { event.preventDefault(); setDragging(false); addFiles(event.dataTransfer.files); }}
      >
        <UploadCloud aria-hidden="true" />
        <strong>Fotos oder Videos hier ablegen</strong>
        <span>oder direkt auswählen</span>
        <div className="picker-actions">
          <button className="button button-primary" type="button" onClick={() => cameraRef.current?.click()}><Camera aria-hidden="true" /> Kamera öffnen</button>
          <button className="button button-secondary" type="button" onClick={() => inputRef.current?.click()}><ImagePlus aria-hidden="true" /> Dateien wählen</button>
        </div>
        <small>{netlifyStorage ? "Bilder und Videos bis 20 MB im Netlify-Testbetrieb" : "Bilder bis 50 MB · Videos bis 2 GB"}</small>
        <input ref={cameraRef} hidden type="file" accept="image/*" capture="environment" onChange={(event) => { if (event.target.files) addFiles(event.target.files); event.currentTarget.value = ""; }} />
        <input ref={inputRef} hidden type="file" accept={acceptMime} multiple onChange={(event) => { if (event.target.files) addFiles(event.target.files); event.currentTarget.value = ""; }} />
      </div>

      {items.length > 0 && <div className="upload-list" aria-live="polite">
        <div className="overall-progress"><span><strong>Gesamtfortschritt</strong><small>{successes} von {items.length} fertig</small></span><span>{overall}%</span><progress max="100" value={overall}>{overall}%</progress></div>
        {items.map((item) => <article className={`upload-file status-${item.status}`} key={item.id}>
          <div className="file-icon">{item.status === "success" ? <Check aria-hidden="true" /> : item.status === "error" ? <CircleAlert aria-hidden="true" /> : <FileImage aria-hidden="true" />}</div>
          <div className="file-info"><strong title={item.file.name}>{item.file.name}</strong><span>{formatBytes(item.file.size)} · {item.status === "preparing" ? "Vorschau wird erstellt" : item.status === "uploading" ? "Wird hochgeladen" : item.status === "finalizing" ? "Wird sicher gespeichert" : item.status === "success" ? "Fertig" : item.status === "canceled" ? "Abgebrochen" : item.status === "error" ? item.error : "Bereit"}</span><progress max="100" value={item.progress}>{item.progress}%</progress></div>
          <div className="file-actions">
            {["preparing", "uploading", "finalizing"].includes(item.status) && <button className="icon-button" type="button" onClick={() => cancel(item)} aria-label={`${item.file.name} abbrechen`}><X /></button>}
            {["error", "canceled"].includes(item.status) && !clientError(item.file) && <button className="icon-button" type="button" onClick={() => startUploads([item.id])} aria-label={`${item.file.name} erneut versuchen`}><RefreshCw /></button>}
            {["queued", "error", "canceled"].includes(item.status) && <button className="icon-button" type="button" onClick={() => setItems((current) => current.filter((candidate) => candidate.id !== item.id))} aria-label={`${item.file.name} entfernen`}><Trash2 /></button>}
          </div>
        </article>)}
      </div>}

      {completionMessage && <div className="success-card" role="status"><Check aria-hidden="true" /><div><strong>{completionMessage}</strong><span>Deine Galerie aktualisiert sich automatisch.</span></div><div><button className="button button-secondary" type="button" onClick={() => { setItems([]); sessions.current.clear(); }}>Weitere Bilder hochladen</button><Link className="button button-ghost" to="/galerie">Zu meinen Bildern</Link></div></div>}

      {items.length > 0 && successes !== items.length && <div className="upload-submit">
        <button className="button button-primary button-large" type="button" onClick={() => startUploads()} disabled={!ready || active}>
          {active ? <><LoaderCircle className="spin" aria-hidden="true" /> Upload läuft …</> : <>Jetzt hochladen</>}
        </button>
      </div>}
      <p className="upload-legal">Mit dem Upload bestätigst du, dass du die Inhalte teilen darfst. Deine Aufnahmen sind nur in diesem Browser und für den Admin sichtbar.</p>
    </section>
  );
}
