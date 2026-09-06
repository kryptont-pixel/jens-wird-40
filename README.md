# Jens wird 40 – Foto- und Videowebsite

Produktionsreife, deutschsprachige Website für Jens’ 40. Geburtstag am 10.10.2026. Gäste öffnen `/upload` per QR-Code, wählen Fotos oder Videos und laden ohne Registrierung direkt in einen privaten Hetzner Object Storage. Netlify Functions autorisieren und finalisieren den Upload; große Dateien laufen nie durch Netlify.

## Was enthalten ist

- Mobile-first Startseite, eigener QR-Einstieg `/upload`, öffentliche Galerie und Gästebuch
- Einzel- und Mehrfachupload, Kamera-Eingang, Dateiauswahl, Drag-and-drop, Einzel- und Gesamtfortschritt
- direkte, kurzlebig signierte S3-Uploads; Dateien über 64 MB als Multipart-Upload mit 64-MB-Teilen und Wiederholung einzelner Teile
- lokal im Browser erzeugte WebP-Vorschauen mit berücksichtigter Bildausrichtung; Video-Poster, wenn der Browser das Video dekodieren kann
- private Originale, UUID-Pfade, serverseitige MIME-/Größenprüfung vor der Freigabe und Kontrolle des tatsächlich gespeicherten Objekts
- Netlify Blobs für Medien-Metadaten, Upload-Sitzungen, Rate Limits und Gästebuch
- Turnstile-Prüfung auf dem Server, Rate Limiting, XSS-Bereinigung und verständliche deutsche Fehlertexte
- serverseitig geschützter Adminbereich mit sechsstelliger PIN, signierten HttpOnly-Sitzungen, Auswahl, Löschung, Originalansicht und Downloads
- `noindex`, `nofollow`, `robots.txt`, Sicherheits-Header und kein öffentlicher Schreibzugriff auf den Bucket
- tägliche Bereinigung abgelaufener Upload-Sitzungen; zusätzliche Bucket-Lifecycle-Regel für unvollständige Multipart-Uploads

## 1. Voraussetzungen und Installation

Installiert werden müssen Node.js 20 oder neuer und pnpm. Im Projektordner:

```bash
pnpm install
cp .env.example .env
pnpm dev
```

`pnpm dev` startet nur das Vite-Frontend. Für Frontend und lokale Netlify Functions gemeinsam:

```bash
pnpm dev:netlify
```

Netlify Dev verwendet lokal einen isolierten Blobs-Speicher. Echte Uploads benötigen zusätzlich einen eingerichteten Hetzner-Bucket und die Werte aus `.env`.

### Temporärer Netlify-Uploadbetrieb

Für erste Tests in Netlify unter **Site configuration → Environment variables** setzen:

```text
MEDIA_STORAGE=netlify
VITE_MEDIA_STORAGE=netlify
```

Danach neu deployen. Bilder und Videos werden dann in Netlify Blobs gespeichert und dürfen im Testbetrieb höchstens 20 MB groß sein. Die Function-Anfragen werden intern in 4-MB-Teile aufgeteilt. Für die Feier sollten beide Werte wieder auf `hetzner` gestellt und anschließend erneut deployt werden, weil der Hetzner-Weg die vorgesehenen 50 MB für Bilder und 2 GB für Videos unterstützt.

## 2. Hetzner-Projekt und privaten Bucket erstellen

1. In der Hetzner Console ein Projekt anlegen oder auswählen.
2. Unter **Object Storage** einen Bucket in der gewünschten Region erstellen, zum Beispiel `nbg1`.
3. Der Bucket muss privat bleiben. Keine öffentliche ACL und keine anonymen Schreibrechte aktivieren.
4. Unter **S3 Credentials** einen eigenen Access Key für diese Website erzeugen.
5. Region, Endpoint, Bucketname, Access Key und Secret Key ausschließlich als Netlify-Environment-Variablen speichern.

Der Code legt CORS- und Lifecycle-Regeln absichtlich nicht bei jedem Upload neu an.

### CORS einmalig setzen

In [docs/hetzner-cors.json](docs/hetzner-cors.json) zuerst `https://IHRE-ENDGUELTIGE-DOMAIN.example` durch die endgültige Netlify-Domain ersetzen. Mit einer lokal eingerichteten AWS CLI:

```bash
aws s3api put-bucket-cors --bucket IHR_BUCKET --cors-configuration file://docs/hetzner-cors.json --endpoint-url https://nbg1.your-objectstorage.com --region nbg1
```

`ETag` muss in `ExposeHeaders` stehen, weil der Browser damit Multipart-Teile bestätigt.

### Lifecycle-Regel einmalig setzen

Die Datei [docs/hetzner-lifecycle.json](docs/hetzner-lifecycle.json) bricht unvollständige Multipart-Uploads nach einem Tag ab:

```bash
aws s3api put-bucket-lifecycle-configuration --bucket IHR_BUCKET --lifecycle-configuration file://docs/hetzner-lifecycle.json --endpoint-url https://nbg1.your-objectstorage.com --region nbg1
```

## 3. Cloudflare Turnstile einrichten

1. In Cloudflare ein Turnstile-Widget für die endgültige Website-Domain anlegen.
2. Den öffentlichen Site Key als `VITE_TURNSTILE_SITE_KEY` speichern.
3. Den geheimen Secret Key nur serverseitig als `TURNSTILE_SECRET_KEY` in Netlify speichern.

`ALLOW_TEST_BYPASS=true` ist ausschließlich für lokale automatisierte Tests vorgesehen und darf in Produktion niemals aktiv sein.

## 4. Admin-PIN konfigurieren

Der Adminbereich benötigt nur eine sechsstellige PIN und keinen Benutzernamen. Der Hash wird lokal erzeugt, ohne die PIN ins Repository zu schreiben:

```bash
node scripts/hash-pin.mjs
```

Den ausgegebenen bcrypt-Hash in `ADMIN_PIN_HASH` eintragen. `SESSION_SECRET` muss eine lange, zufällige Zeichenfolge sein, idealerweise mindestens 32 zufällige Bytes. PIN und Secrets niemals in Chat, Screenshots oder Supportnachrichten zeigen.

## 5. Netlify mit GitHub verbinden und deployen

1. Dieses Projekt in ein privates GitHub-Repository übertragen.
2. In Netlify **Add new project → Import an existing project** wählen und GitHub verbinden.
3. Die Einstellungen werden aus `netlify.toml` gelesen:
   - Build command: `pnpm run build`
   - Publish directory: `dist`
   - Functions directory: `netlify/functions`
   - Node bundler: `esbuild`
4. Unter **Project configuration → Environment variables** alle unten aufgeführten Werte eintragen.
5. Einen Deploy Preview erstellen und vollständig testen.
6. Erst die geprüfte Version in Produktion veröffentlichen.

Nicht für jeden kleinen Test einen Produktions-Deploy auslösen. Änderungen zuerst lokal oder in einem Deploy Preview prüfen.

## 6. Environment-Variablen

| Variable | Sichtbarkeit | Bedeutung |
|---|---|---|
| `VITE_PUBLIC_SITE_URL` | öffentlich | endgültige Basis-URL der Website |
| `VITE_TURNSTILE_SITE_KEY` | öffentlich | Turnstile Site Key |
| `PUBLIC_SITE_URL` | serverseitig | dieselbe endgültige Basis-URL; Origin- und Hostprüfung |
| `TURNSTILE_SECRET_KEY` | geheim/serverseitig | Turnstile Secret Key |
| `MEDIA_STORAGE` | serverseitig | `netlify` für den temporären Testbetrieb oder `hetzner` für den produktiven Upload |
| `VITE_MEDIA_STORAGE` | öffentlich | muss zum serverseitigen `MEDIA_STORAGE` passen |
| `HETZNER_S3_REGION` | serverseitig | z. B. `nbg1` |
| `HETZNER_S3_ENDPOINT` | serverseitig | z. B. `https://nbg1.your-objectstorage.com` |
| `HETZNER_S3_BUCKET` | serverseitig | privater Bucketname |
| `HETZNER_S3_ACCESS_KEY` | geheim/serverseitig | S3 Access Key |
| `HETZNER_S3_SECRET_KEY` | geheim/serverseitig | S3 Secret Key |
| `ADMIN_PIN_HASH` | geheim/serverseitig | bcrypt-Hash der sechsstelligen Admin-PIN, niemals die Klartext-PIN |
| `SESSION_SECRET` | geheim/serverseitig | Signatur für Admin- und Upload-Sitzungen |

Vite übernimmt ausschließlich Variablen mit dem Präfix `VITE_` in den Browser. Alle Secrets haben bewusst kein solches Präfix.

## 7. Endgültige URL und QR-Code

Nach dem ersten erfolgreichen Netlify-Deploy dieselbe endgültige URL in `VITE_PUBLIC_SITE_URL` und `PUBLIC_SITE_URL` eintragen. Danach lokal:

```powershell
$env:VITE_PUBLIC_SITE_URL='https://ihre-domain.netlify.app'; pnpm qr
```

Erzeugt werden:

- `public/qr/jens-upload.svg`
- `public/qr/jens-upload.png`
- `public/qr/jens-upload-print.svg`
- `public/qr/jens-upload-print.png`

Alle Codes zeigen direkt auf `/upload`, verwenden hohe Fehlerkorrektur, hohen Kontrast und einen großzügigen weißen Rand. Die im Repository enthaltene erste Version zeigt absichtlich auf `example.invalid`; sie muss nach Eintragung der echten URL neu erzeugt und vor dem Druck mit mindestens zwei Smartphones getestet werden.

## 8. Qualitätsprüfung vor der Veröffentlichung

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm functions:bundle
```

Danach im Deploy Preview prüfen:

1. kleinen JPEG-Upload und Vorschau
2. Mehrfachupload mit mindestens drei Dateien
3. Video über 64 MB als Multipart-Upload, einschließlich Netzunterbrechung/Wiederholung
4. Upload-Abbruch und erneuten Versuch
5. Galerie, Lazy Loading, Lightbox, Wischen und Video mit `preload="none"`
6. Gästebuch, Zeichenlimit und Turnstile
7. Adminanmeldung per PIN, Sitzung nach Ablauf und Abmeldung
8. Einzel- und Mehrfachdownload
9. Einzel- und Mehrfachlöschung; danach prüfen, dass Original, Vorschau und Metadatum entfernt sind
10. manipulierte Löschanfrage ohne Admincookie muss `401` liefern
11. QR-Code aus Bildschirm- und Druckgröße scannen
12. Smartphone- und Desktopdarstellung sowie Tastaturbedienung prüfen

## 9. Wichtige Sicherheitsregeln

- `.env`, `node_modules` und `.netlify` niemals zu GitHub hochladen; `.gitignore` schützt diese Pfade bereits.
- Der Bucket bleibt privat. Nur Netlify Functions kennen die S3-Zugangsdaten.
- Signierte Upload-URLs laufen nach 10 Minuten, Galerie-/Downloadlinks nach 5 Minuten ab.
- Originale laufen nie durch Netlify Functions. Bilder werden in der Galerie nur als WebP-Vorschau geladen; Videos erst nach ausdrücklicher Wiedergabe.
- Adminrechte werden bei jeder Admin-Anfrage serverseitig anhand des signierten HttpOnly-Cookies geprüft.
- Secrets niemals in Screenshots oder Supportnachrichten zeigen.
- GitHub-Repository und Netlify-Teamzugriff auf die wirklich benötigten Personen begrenzen.

## 10. Nach der Feier

1. Im Adminbereich alle Originale in überschaubaren Gruppen herunterladen.
2. Die Downloads auf mindestens einem zweiten Speicher sichern und stichprobenartig öffnen.
3. Die Website in Netlify deaktivieren.
4. Erst nach geprüfter Sicherung den Hetzner-Bucket leeren und löschen.
5. Die verwendeten S3-Schlüssel widerrufen.
6. Secrets und Environment-Variablen in Netlify entfernen.
7. Das Netlify-Projekt bei Bedarf endgültig löschen.

Gelöschte Dateien im Bucket sind ohne eigene Sicherung nicht wiederherstellbar.

## Architektur in einem Satz

Der Browser lädt Originale direkt per zeitlich begrenzter, serverseitig ausgestellter URL zu Hetzner; Netlify Functions prüfen Berechtigung und Ergebnis, während Netlify Blobs ausschließlich kleine Datensätze speichert.
