import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Images, LoaderCircle, Play, RefreshCw, X } from "lucide-react";
import { Link } from "react-router-dom";
import { api, formatDate } from "../lib/api";
import type { GalleryItem } from "../types";

interface GalleryResponse { items: GalleryItem[]; nextCursor: string | null }

function mergeItems(current: GalleryItem[], incoming: GalleryItem[]): GalleryItem[] {
  const map = new Map(current.map((item) => [item.id, item]));
  incoming.forEach((item) => map.set(item.id, item));
  return [...map.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function Gallery({ preview = false }: { preview?: boolean }) {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  const loadFirst = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await api<GalleryResponse>("gallery");
      setItems((current) => silent ? mergeItems(current, data.items) : data.items);
      setCursor(data.nextCursor);
      setError(null);
    } catch {
      if (!silent) setError("Die Galerie ist gerade nicht erreichbar. Bitte versuche es gleich noch einmal.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void loadFirst(), 0);
    const interval = window.setInterval(() => void loadFirst(true), 30_000);
    return () => { window.clearTimeout(initial); window.clearInterval(interval); };
  }, [loadFirst]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await api<GalleryResponse>(`gallery?cursor=${encodeURIComponent(cursor)}`);
      setItems((current) => mergeItems(current, data.items));
      setCursor(data.nextCursor);
    } catch {
      setError("Weitere Bilder konnten gerade nicht geladen werden.");
    } finally { setLoadingMore(false); }
  };

  const visible = preview ? items.slice(0, 8) : items;
  return (
    <section className={`gallery-section${preview ? " preview" : ""}`} id="galerie" aria-labelledby="gallery-title">
      <div className="section-heading">
        <div><p className="section-kicker">Von uns allen</p><h2 id="gallery-title">Unsere Party – eure Bilder</h2><p>Frisch hochgeladen, neueste Momente zuerst.</p></div>
        {!preview && <button className="icon-text-button" type="button" onClick={() => loadFirst()}><RefreshCw aria-hidden="true" /> Aktualisieren</button>}
      </div>
      {loading && <div className="state-card"><LoaderCircle className="spin" aria-hidden="true" /><p>Die ersten Bilder werden geladen …</p></div>}
      {!loading && error && !items.length && <div className="state-card error"><Images aria-hidden="true" /><p>{error}</p><button className="button button-secondary" type="button" onClick={() => loadFirst()}>Noch einmal versuchen</button></div>}
      {!loading && !error && !items.length && <div className="state-card"><Images aria-hidden="true" /><h3>Hier wartet Platz auf den ersten Moment.</h3><p>Die Galerie füllt sich, sobald das erste Bild hochgeladen wurde.</p><Link className="button button-primary" to="/upload">Erstes Foto hochladen</Link></div>}
      {visible.length > 0 && <div className="masonry">
        {visible.map((item, index) => <button className="gallery-card" key={item.id} type="button" onClick={() => setSelected(index)} aria-label={`${item.kind === "video" ? "Video" : "Foto"} vom ${formatDate(item.createdAt)} öffnen`}>
          {item.previewUrl ? <img src={item.previewUrl} alt="Partymoment" loading="lazy" decoding="async" width={item.width} height={item.height} /> : <div className="video-placeholder"><Play aria-hidden="true" /><span>Video ansehen</span></div>}
          {item.kind === "video" && <span className="play-badge"><Play aria-hidden="true" /> Video</span>}
          <span className="card-date">{formatDate(item.createdAt)}</span>
        </button>)}
      </div>}
      {error && items.length > 0 && <p className="inline-error" role="status">{error}</p>}
      {!preview && cursor && <button className="button button-secondary load-more" type="button" onClick={loadMore} disabled={loadingMore}>{loadingMore ? <><LoaderCircle className="spin" /> Mehr wird geladen …</> : "Mehr Momente laden"}</button>}
      {preview && items.length > 0 && <Link className="button button-secondary load-more" to="/galerie">Alle Bilder ansehen</Link>}
      {selected !== null && <Lightbox items={visible} index={selected} setIndex={setSelected} />}
    </section>
  );
}

function Lightbox({ items, index, setIndex }: { items: GalleryItem[]; index: number; setIndex: (index: number | null) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const startX = useRef<number | null>(null);
  const item = items[index];
  const previous = useCallback(() => setIndex((index - 1 + items.length) % items.length), [index, items.length, setIndex]);
  const next = useCallback(() => setIndex((index + 1) % items.length), [index, items.length, setIndex]);
  useEffect(() => {
    const node = dialog.current;
    node?.showModal();
    document.body.classList.add("dialog-open");
    return () => document.body.classList.remove("dialog-open");
  }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft") previous();
      if (event.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [next, previous]);
  return (
    <dialog className="lightbox" ref={dialog} onClose={() => setIndex(null)} onClick={(event) => { if (event.target === event.currentTarget) event.currentTarget.close(); }}>
      <button className="lightbox-close" type="button" aria-label="Lightbox schließen" onClick={() => dialog.current?.close()}><X /></button>
      {items.length > 1 && <><button className="lightbox-nav previous" type="button" onClick={previous} aria-label="Vorheriges Bild"><ChevronLeft /></button><button className="lightbox-nav next" type="button" onClick={next} aria-label="Nächstes Bild"><ChevronRight /></button></>}
      <figure onPointerDown={(event) => { startX.current = event.clientX; }} onPointerUp={(event) => { if (startX.current === null) return; const delta = event.clientX - startX.current; if (delta > 60) previous(); if (delta < -60) next(); startX.current = null; }}>
        {item.kind === "video" && item.viewUrl ? <video key={item.id} controls playsInline preload="none" poster={item.previewUrl ?? undefined}><source src={item.viewUrl} type={item.mimeType} />Dein Browser kann dieses Video nicht abspielen.</video> : item.previewUrl ? <img src={item.previewUrl} alt="Große Ansicht eines Partymoments" /> : null}
        <figcaption>{index + 1} / {items.length} · {formatDate(item.createdAt)}</figcaption>
      </figure>
    </dialog>
  );
}
