import { useEffect } from "react";
import type { NavigateFunction } from "react-router-dom";

declare global {
  interface Document {
    readonly modelContext?: {
      registerTool: (tool: Record<string, unknown>, options?: { signal?: AbortSignal }) => void | Promise<void>;
    };
  }
}

export function useWebMcp(navigate: NavigateFunction) {
  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (name: string, title: string, description: string, path: string) => {
      void Promise.resolve(context.registerTool({
        name,
        title,
        description,
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute: (input: unknown) => {
          if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).length > 0) {
            throw new Error("Dieser Aufruf akzeptiert keine Eingabefelder.");
          }
          navigate(path);
          return { opened: path };
        },
      }, { signal: lifecycle.signal })).catch(() => undefined);
    };
    register("open_party_upload", "Upload öffnen", "Öffnet den echten Foto- und Video-Upload für Jens' 40. Geburtstag.", "/upload");
    register("open_party_gallery", "Galerie öffnen", "Öffnet die persönliche Galerie mit den in diesem Browser hochgeladenen Partyaufnahmen.", "/galerie");
    return () => lifecycle.abort();
  }, [navigate]);
}
