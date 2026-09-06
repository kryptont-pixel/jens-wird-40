export type MediaKind = "image" | "video";

export interface GalleryItem {
  id: string;
  kind: MediaKind;
  mimeType: string;
  size: number;
  createdAt: string;
  previewUrl: string | null;
  viewUrl: string | null;
  width?: number;
  height?: number;
}

export interface GuestbookEntry {
  id: string;
  name: string | null;
  message: string;
  createdAt: string;
}

export interface AdminMedia extends GalleryItem {
  originalUrl: string;
  originalViewUrl: string;
  originalName: string;
  status: string;
}
