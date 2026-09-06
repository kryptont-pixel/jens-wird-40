export function putBlob(
  url: string,
  blob: Blob,
  headers: Record<string, string>,
  signal: AbortSignal,
  onProgress: (loaded: number, total: number) => void,
): Promise<{ etag: string | null }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    xhr.open("PUT", url);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => onProgress(event.loaded, event.lengthComputable ? event.total : blob.size);
    xhr.onload = () => {
      signal.removeEventListener("abort", abort);
      if (xhr.status >= 200 && xhr.status < 300) resolve({ etag: xhr.getResponseHeader("etag") });
      else reject(Object.assign(new Error(xhr.status === 403 ? "Die Upload-Adresse ist abgelaufen." : `Upload fehlgeschlagen (${xhr.status}).`), { status: xhr.status }));
    };
    xhr.onerror = () => reject(new Error("Die Verbindung wurde beim Upload unterbrochen."));
    xhr.onabort = () => reject(new DOMException("Upload abgebrochen", "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    xhr.send(blob);
  });
}
