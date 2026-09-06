import { useEffect, useState } from "react";
import { EVENT } from "../config/event";

function remaining() {
  const distance = new Date(EVENT.date).getTime() - Date.now();
  if (distance <= 0) return null;
  return {
    tage: Math.floor(distance / 86400_000),
    stunden: Math.floor((distance / 3600_000) % 24),
    minuten: Math.floor((distance / 60_000) % 60),
  };
}

export function Countdown() {
  const [time, setTime] = useState(remaining);
  useEffect(() => {
    const id = window.setInterval(() => setTime(remaining()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  if (!time) return <p className="after-party">Was für eine Party! 🎉</p>;
  return (
    <dl className="countdown" aria-label="Countdown bis zur Feier">
      {Object.entries(time).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
  );
}
