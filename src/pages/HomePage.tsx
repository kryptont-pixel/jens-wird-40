import { useEffect } from "react";
import { Camera, LockKeyhole, Sparkles } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { Countdown } from "../components/Countdown";
import { Gallery } from "../components/Gallery";
import { Guestbook } from "../components/Guestbook";
import { Header } from "../components/Header";
import { UploadPanel } from "../components/UploadPanel";
import { EVENT } from "../config/event";

export function HomePage() {
  const location = useLocation();
  useEffect(() => {
    const section = new URLSearchParams(location.search).get("section");
    if (section) window.setTimeout(() => document.getElementById(section)?.scrollIntoView(), 50);
  }, [location.search]);
  return (
    <div className="site-shell">
      <Header overlay />
      <main id="main-content">
        <section className="hero" aria-labelledby="hero-title">
          <img className="hero-art" src="/assets/party-lights.png" alt="Abstrakte warme Partylichter" />
          <div className="hero-shade" />
          <div className="hero-copy">
            <p className="eyebrow">{EVENT.dateLabel} · Gemeinsam festhalten</p>
            <h1 id="hero-title"><span>{EVENT.name}</span> wird <strong>40.</strong></h1>
            <p className="hero-message">Die besten Momente entstehen nebenbei. Deine gehören hierher.</p>
            <Link className="button button-primary button-large" to="/upload"><Camera aria-hidden="true" /> Foto hochladen</Link>
            <Countdown />
          </div>
          <div className="hero-stamp" aria-label="40. Geburtstag"><span>vierzig</span><strong>40</strong><small>Jahre jung</small></div>
        </section>
        <section className="home-upload content-band"><UploadPanel compact /></section>
        <div className="content-band gallery-band"><Gallery preview /></div>
        <Guestbook />
        <section className="privacy-strip" aria-label="Datenschutzhinweis"><LockKeyhole aria-hidden="true" /><div><strong>Eure Momente, vernünftig behandelt.</strong><p>Andere Gäste sehen weder deine Aufnahmen noch deine Gästebucheinträge. Nur du in diesem Browser und der Admin können sie aufrufen. Lade bitte nur Inhalte hoch, die du weitergeben darfst.</p></div><Sparkles aria-hidden="true" /></section>
      </main>
    </div>
  );
}
