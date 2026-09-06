import { Camera, Images, MessageCircle } from "lucide-react";
import { Link } from "react-router-dom";

export function Header({ overlay = false }: { overlay?: boolean }) {
  return (
    <header className={`site-header${overlay ? " overlay" : ""}`}>
      <Link className="wordmark" to="/" aria-label="Jens wird 40 – Startseite">J<span>40</span></Link>
      <nav aria-label="Hauptnavigation">
        <Link to="/galerie"><Images aria-hidden="true" /> Galerie</Link>
        <Link to="/?section=gaestebuch"><MessageCircle aria-hidden="true" /> Gästebuch</Link>
        <Link className="nav-upload" to="/upload"><Camera aria-hidden="true" /> Hochladen</Link>
      </nav>
    </header>
  );
}
