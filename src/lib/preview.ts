export interface GeneratedPreview {
  blob: Blob;
  width: number;
  height: number;
}

function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Vorschau konnte nicht erzeugt werden.")), "image/webp", 0.84);
  });
}

function fit(width: number, height: number, max = 1600) {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function withTimeout<T>(promise: Promise<T>, message: string, milliseconds = 12_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(message)), milliseconds);
    promise.then(
      (value) => { window.clearTimeout(timeout); resolve(value); },
      (error) => { window.clearTimeout(timeout); reject(error); },
    );
  });
}

async function imagePreview(file: File): Promise<GeneratedPreview> {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";
  try {
    await withTimeout(new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Bildvorschau nicht möglich."));
      image.src = url;
    }), "Bildvorschau hat zu lange gebraucht.");
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("Das Bild hat keine gültige Größe.");
    const size = fit(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Bildvorschau nicht möglich.");
    context.drawImage(image, 0, 0, size.width, size.height);
    return { blob: await canvasBlob(canvas), width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    image.removeAttribute("src");
    URL.revokeObjectURL(url);
  }
}

async function videoPreview(file: File): Promise<GeneratedPreview> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  try {
    await withTimeout(new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("Videovorschau nicht möglich."));
      video.src = url;
    }), "Videovorschau hat zu lange gebraucht.");
    const seekTime = Number.isFinite(video.duration) ? Math.min(1, Math.max(0, video.duration / 3)) : 0;
    if (seekTime > 0.05) {
      await withTimeout(new Promise<void>((resolve, reject) => {
        video.onseeked = () => resolve();
        video.onerror = () => reject(new Error("Videovorschau nicht möglich."));
        video.currentTime = seekTime;
      }), "Videovorschau hat zu lange gebraucht.");
    }
    if (!video.videoWidth || !video.videoHeight) throw new Error("Das Video hat keine gültige Größe.");
    const size = fit(video.videoWidth, video.videoHeight);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Videovorschau nicht möglich.");
    context.drawImage(video, 0, 0, size.width, size.height);
    return { blob: await canvasBlob(canvas), width: video.videoWidth, height: video.videoHeight };
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute("src");
    video.load();
  }
}

export async function generatePreview(file: File): Promise<GeneratedPreview | null> {
  try {
    if (file.type.startsWith("image/")) return await imagePreview(file);
    if (file.type.startsWith("video/")) return await videoPreview(file);
    return null;
  } catch {
    return null;
  }
}
