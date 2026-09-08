import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import LibraryPage from '@/pages/library';
import CompositionPage from '@/pages/composition';
import TemplateEditorPage from '@/pages/template-editor';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { ManifestProvider, useManifest } from '@/lib/manifest-context';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cache manifest (and other reads) for 5 min so repeated mounts don't
      // trigger extra network requests.
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={LibraryPage} />
      <Route path="/composition/:id" component={CompositionPage} />
      <Route path="/templates/:id" component={TemplateEditorPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

/**
 * Shows a non-blocking error banner when the API is unreachable.
 * Children always render immediately using the bundled manifest as fallback,
 * so the loading state never blocks the UI.
 */
function ManifestGate({ children }: { children: React.ReactNode }) {
  const { isError, refetch } = useManifest();

  return (
    <>
      {isError && (
        <div className="flex items-center justify-between gap-3 border-b border-destructive/30 bg-destructive/5 px-4 py-2 text-xs text-destructive">
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Could not reach the API — showing bundled manifest. Some data may be stale.
          </span>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      )}
      {children}
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ManifestProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <ManifestGate>
              <Router />
            </ManifestGate>
          </WouterRouter>
          <Toaster />
        </ManifestProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
