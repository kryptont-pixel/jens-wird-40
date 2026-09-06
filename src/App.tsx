import { Camera } from "lucide-react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { AdminPage } from "./pages/AdminPage";
import { GalleryPage } from "./pages/GalleryPage";
import { HomePage } from "./pages/HomePage";
import { UploadPage } from "./pages/UploadPage";
import { useWebMcp } from "./lib/webmcp";

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  useWebMcp(navigate);
  const showFloating = !location.pathname.startsWith("/admin") && location.pathname !== "/upload";
  return (
    <>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/galerie" element={<GalleryPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {showFloating && <Link className="floating-upload" to="/upload"><Camera aria-hidden="true" /><span>Hochladen</span></Link>}
    </>
  );
}
