import { createContext, useContext, type ReactNode } from "react";
import { useGetLibraryManifest } from "@workspace/api-client-react";
import { MANIFEST as STATIC_MANIFEST, type ManifestData } from "@/lib/library";

type ManifestContextValue = {
  manifest: ManifestData;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
};

const ManifestContext = createContext<ManifestContextValue | null>(null);

/**
 * Fetches the live manifest from GET /api/librarian/manifest and makes it
 * available via `useManifest()`.  Falls back to the bundled static copy
 * while loading or when the API is unreachable so child components always
 * receive valid data.
 */
export function ManifestProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, isError, refetch } = useGetLibraryManifest();

  // Cast the open `{ [key: string]: unknown }` API schema to our typed shape.
  const manifest: ManifestData = (data as ManifestData | undefined) ?? STATIC_MANIFEST;

  return (
    <ManifestContext.Provider value={{ manifest, isLoading, isError, refetch }}>
      {children}
    </ManifestContext.Provider>
  );
}

/**
 * Returns the live manifest plus query state.  Must be called inside a
 * `<ManifestProvider>` (provided at app root by `App.tsx`).
 */
export function useManifest(): ManifestContextValue {
  const ctx = useContext(ManifestContext);
  if (!ctx) throw new Error("useManifest must be used within <ManifestProvider>");
  return ctx;
}
