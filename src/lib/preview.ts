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

async function imagePreview(file: File): Promise<GeneratedPreview> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const size = fit(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    canvas.getContext("2d", { alpha: false })!.drawImage(bitmap, 0, 0, size.width, size.height);
    return { blob: await canvasBlob(canvas), width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

async function videoPreview(file: File): Promise<GeneratedPreview> {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;
  video.src = url;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("Videovorschau nicht möglich."));
    });
    video.currentTime = Math.min(1, Math.max(0, video.duration / 3));
    await new Promise<void>((resolve, reject) => {
      video.onseeked = () => resolve();
      video.onerror = () => reject(new Error("Videovorschau nicht möglich."));
    });
    const size = fit(video.videoWidth, video.videoHeight);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    canvas.getContext("2d", { alpha: false })!.drawImage(video, 0, 0, size.width, size.height);
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
