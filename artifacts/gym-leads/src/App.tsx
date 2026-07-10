import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import { Layout } from "@/components/layout";
import Dashboard from "@/pages/dashboard";
import LeadsList from "@/pages/leads-list";
import LeadNew from "@/pages/lead-new";
import LeadDetail from "@/pages/lead-detail";
import Sequences from "@/pages/sequences";
import Analytics from "@/pages/analytics";
import { useKeepAlive } from "@/hooks/use-keep-alive";
import { useAuth } from "@workspace/replit-auth-web";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 10_000,
    },
  },
});

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/leads" component={LeadsList} />
        <Route path="/leads/new" component={LeadNew} />
        <Route path="/leads/:id" component={LeadDetail} />
        <Route path="/sequences" component={Sequences} />
        <Route path="/analytics" component={Analytics} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function LoginGate() {
  const { isLoading, isAuthenticated, login } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-muted-foreground text-sm">Loading…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-8 max-w-sm w-full px-6">
          <img
            src="/flow-state-logo.png"
            alt="Flow State CRM"
            className="w-56 h-auto object-contain"
          />
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold text-foreground">Welcome back</h1>
            <p className="text-muted-foreground text-sm">
              Sign in to access your gym lead pipeline
            </p>
          </div>
          <button
            onClick={login}
            className="w-full py-3 px-6 rounded-lg font-semibold text-sm transition-all"
            style={{
              background: "linear-gradient(135deg, #00c8f0 0%, #0099bb 100%)",
              color: "#0d1b2a",
              boxShadow: "0 4px 24px rgba(0,200,240,0.3)",
            }}
          >
            Sign in with Replit
          </button>
        </div>
      </div>
    );
  }

  return <Router />;
}

function App() {
  useKeepAlive();
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <LoginGate />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
