import { Switch, Route, Router as WouterRouter, useLocation, Redirect } from "wouter";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
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
import Team from "@/pages/team";
import { useKeepAlive } from "@/hooks/use-keep-alive";
import {
  ClerkProvider,
  SignIn,
  SignUp,
  Show,
  useClerk,
  useUser,
  useAuth,
} from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { dark } from "@clerk/themes";
import { useEffect, useRef, useState } from "react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 10_000,
    },
  },
});

// ─── Clerk wiring ─────────────────────────────────────────────────────────────
// REQUIRED — copy verbatim. Resolves the key from window.location.hostname.
const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

// REQUIRED — copy verbatim. Empty in dev (Clerk hits dev FAPI directly), auto-set
// in prod. Do NOT gate on import.meta.env.PROD / NODE_ENV, and do NOT hardcode a
// fallback like "/api/__clerk" — the empty dev value is intentional, and any
// fallback breaks dev by forcing requests through the (dev-only-disabled) proxy.
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

// Strip base path so wouter's setLocation doesn't double it.
function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

const clerkAppearance = {
  theme: dark,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/flow-state-logo.png`,
  },
  variables: {
    colorPrimary: "#00c8f0",
    colorForeground: "#dce8f5",
    colorMutedForeground: "#7a96b4",
    colorDanger: "#e84a5f",
    colorBackground: "#0d1b2a",
    colorInput: "#1e3448",
    colorInputForeground: "#dce8f5",
    colorNeutral: "#1e3448",
    fontFamily: "'Bricolage Grotesque', sans-serif",
    borderRadius: "0.5rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-[#152236] rounded-2xl w-[440px] max-w-full overflow-hidden border border-[#1e3448]",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-[#dce8f5]",
    headerSubtitle: "text-[#7a96b4]",
    socialButtonsBlockButtonText: "text-[#dce8f5]",
    formFieldLabel: "text-[#dce8f5]",
    footerActionLink: "text-[#00c8f0]",
    footerActionText: "text-[#7a96b4]",
    dividerText: "text-[#7a96b4]",
    identityPreviewEditButton: "text-[#00c8f0]",
    formFieldSuccessText: "text-green-400",
    alertText: "text-[#dce8f5]",
    logoBox: "flex justify-center pb-1",
    logoImage: "h-10 w-auto object-contain",
    socialButtonsBlockButton: "border border-[#1e3448] bg-[#0d1b2a] hover:bg-[#1e3448]",
    formButtonPrimary: "bg-[#00c8f0] text-[#091420] hover:bg-[#0099bb]",
    formFieldInput: "bg-[#1e3448] border-[#2a4a6a] text-[#dce8f5]",
    footerAction: "",
    dividerLine: "bg-[#1e3448]",
    alert: "border-[#1e3448] bg-[#0d1b2a]",
    otpCodeFieldInput: "bg-[#1e3448] border-[#2a4a6a] text-[#dce8f5]",
    formFieldRow: "",
    main: "",
  },
};

// ─── Auth cache invalidation ──────────────────────────────────────────────────
function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (prevUserIdRef.current !== undefined && prevUserIdRef.current !== userId) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

// ─── Gym Setup (new owners without a gym) ────────────────────────────────────
function GymSetupPage() {
  const { signOut } = useClerk();
  const qc = useQueryClient();
  const [gymName, setGymName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!gymName.trim()) { setError("Gym name is required."); return; }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/gyms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ gymName }),
      });
      if (res.ok) {
        // Invalidate the ["me"] query so HomeRedirect refetches and transitions
        // to AuthedApp automatically — no navigation needed.
        await qc.invalidateQueries({ queryKey: ["me"] });
      } else {
        const data = await res.json();
        setError((data as { error?: string }).error ?? "Failed to create gym.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center gap-3 mb-8">
          <img src="/flow-state-logo.png" alt="Flow State CRM" className="w-40 h-auto object-contain" />
          <h1 className="text-2xl font-bold text-foreground">Set up your gym</h1>
          <p className="text-sm text-muted-foreground text-center">
            Create your gym to start tracking leads and managing your team.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 bg-card border border-border rounded-xl p-6">
          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="space-y-1">
            <label htmlFor="gymName" className="text-sm font-medium text-foreground">Gym name</label>
            <input
              id="gymName"
              type="text"
              value={gymName}
              onChange={(e) => setGymName(e.target.value)}
              placeholder="CrossFit Central"
              className="w-full px-3 py-2 rounded-lg border border-border text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg font-semibold text-sm transition-all disabled:opacity-60"
            style={{
              background: "linear-gradient(135deg, #00c8f0 0%, #0099bb 100%)",
              color: "#0d1b2a",
              boxShadow: "0 4px 24px rgba(0,200,240,0.25)",
            }}
          >
            {loading ? "Creating…" : "Create gym"}
          </button>
          <p className="text-center text-xs text-muted-foreground">
            <button type="button" onClick={() => signOut({ redirectUrl: basePath || "/" })} className="text-primary hover:underline">
              Sign out
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}

// ─── Accept Invite page ───────────────────────────────────────────────────────
function AcceptInvitePage() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token") ?? "";
  const [, setLocation] = useLocation();
  const [info, setInfo] = useState<{ email: string; gymName: string } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setError("Invalid invite link."); setLoading(false); return; }
    fetch(`/api/auth/invite/${token}`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : r.json().then((d: { error?: string }) => Promise.reject(d.error ?? "Invalid")))
      .then((d: { email: string; gymName: string }) => { setInfo(d); setLoading(false); })
      .catch((err: string) => { setError(err || "This invite link is invalid or has expired."); setLoading(false); });
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Checking your invite…</p>
      </div>
    );
  }

  if (error || !info) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-md text-center space-y-4">
          <img src="/flow-state-logo.png" alt="Flow State CRM" className="w-40 h-auto object-contain mx-auto" />
          <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20">
            <p className="font-semibold text-destructive">Invite link invalid</p>
            <p className="text-sm text-muted-foreground mt-1">{error || "This invite link has expired."}</p>
          </div>
          <button type="button" onClick={() => setLocation("/")} className="text-primary hover:underline text-sm">
            ← Back to home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-md text-center space-y-6">
        <img src="/flow-state-logo.png" alt="Flow State CRM" className="w-40 h-auto object-contain mx-auto" />
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          <div>
            <h2 className="text-xl font-bold text-foreground">Join {info.gymName}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              You've been invited to join as a staff member.
            </p>
          </div>
          <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 text-sm text-foreground">
            Sign up with: <strong>{info.email}</strong>
          </div>
          <p className="text-xs text-muted-foreground">
            Create your account with the email above. You'll automatically be added to {info.gymName} after signing in.
          </p>
          <button
            type="button"
            onClick={() => {
              // Store invite context so SignUpPage can pre-fill the email.
              // JIT provisioning on the server matches by email, so signing up with
              // the correct address automatically assigns the gym from the invite.
              sessionStorage.setItem("inviteEmail", info.email);
              sessionStorage.setItem("inviteToken", token);
              setLocation(`/sign-up`);
            }}
            className="w-full py-2.5 rounded-lg font-semibold text-sm"
            style={{
              background: "linear-gradient(135deg, #00c8f0 0%, #0099bb 100%)",
              color: "#0d1b2a",
              boxShadow: "0 4px 24px rgba(0,200,240,0.25)",
            }}
          >
            Create account
          </button>
          <button
            type="button"
            onClick={() => {
              // Preserve invite context for the sign-in path too, so
              // HomeRedirect can call /auth/consume-invite after sign-in.
              sessionStorage.setItem("inviteEmail", info.email);
              sessionStorage.setItem("inviteToken", token);
              setLocation("/sign-in");
            }}
            className="text-primary hover:underline text-sm block w-full"
          >
            Already have an account? Sign in
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Authenticated app (with gym) ────────────────────────────────────────────
function AuthedApp() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/leads" component={LeadsList} />
        <Route path="/leads/new" component={LeadNew} />
        <Route path="/leads/:id" component={LeadDetail} />
        <Route path="/sequences" component={Sequences} />
        <Route path="/analytics" component={Analytics} />
        <Route path="/team" component={Team} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

// ─── Home redirect ────────────────────────────────────────────────────────────
function HomeRedirect() {
  const { isLoaded, isSignedIn } = useAuth();
  const qc = useQueryClient();

  // When a signed-in user lands on /?verified=true (e.g. via back button after
  // email verification), strip the query param so the verification banner is
  // never shown to an already-authenticated user.  We use replaceState rather
  // than wouter's setLocation because setLocation only controls the path
  // segment and wouldn't remove the ?verified query string.
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    const params = new URLSearchParams(window.location.search);
    if (params.has("verified")) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [isLoaded, isSignedIn]);

  // Consume any pending invite token once on sign-in, then invalidate ["me"]
  // so the query below refetches with the newly assigned gymId.
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    const inviteToken = sessionStorage.getItem("inviteToken");
    if (!inviteToken) return;
    (async () => {
      try {
        await fetch("/api/auth/consume-invite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ token: inviteToken }),
        });
      } catch { /* non-fatal */ } finally {
        sessionStorage.removeItem("inviteToken");
        sessionStorage.removeItem("inviteEmail");
        qc.invalidateQueries({ queryKey: ["me"] });
      }
    })();
  }, [isLoaded, isSignedIn, qc]);

  // Use TanStack Query so cache invalidation (from GymSetupPage on creation)
  // automatically triggers a refetch and re-renders with the new gymId.
  const { data: meData, isLoading: meLoading } = useQuery<{ user?: { gymId: string | null } }>({
    queryKey: ["me"],
    queryFn: () =>
      fetch("/api/me", { credentials: "include" })
        .then((r) => r.json()),
    enabled: isLoaded && !!isSignedIn,
    staleTime: 30_000,
  });

  if (!isLoaded) return null;

  const gymId = meData?.user?.gymId ?? null;

  return (
    <>
      <Show when="signed-out">
        <LandingPage />
      </Show>
      <Show when="signed-in">
        {meLoading || meData === undefined ? (
          // Still loading gym info
          null
        ) : gymId ? (
          // Signed in with gym — show app
          <AuthedApp />
        ) : (
          // Signed in but no gym — show setup
          <GymSetupPage />
        )}
      </Show>
    </>
  );
}

// ─── Landing page for unauthenticated users ───────────────────────────────────
function LandingPage() {
  const [, setLocation] = useLocation();
  const verified = new URLSearchParams(window.location.search).get("verified");

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4 gap-8">
      {verified === "true" && (
        <div className="w-full max-w-sm px-4 py-3 rounded-lg bg-green-900/30 border border-green-700/50 text-green-300 text-sm text-center space-y-2" data-testid="verified-success">
          <p>✓ Email verified! You can now sign in.</p>
          <button
            type="button"
            onClick={() => setLocation("/sign-in")}
            data-testid="sign-in-now"
            className="inline-block px-4 py-1.5 rounded-lg font-semibold text-sm text-[#0d1b2a] hover:opacity-90 transition-opacity"
            style={{ background: "linear-gradient(135deg, #00c8f0 0%, #0099bb 100%)" }}
          >
            Sign in now →
          </button>
        </div>
      )}
      {verified === "invalid" && (
        <div className="w-full max-w-sm px-4 py-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm text-center" data-testid="verified-invalid">
          Verification link is invalid or has expired.
        </div>
      )}
      <div className="flex flex-col items-center gap-4 text-center">
        <img src="/flow-state-logo.png" alt="Flow State CRM" className="w-52 h-auto object-contain" />
        <div>
          <h1 className="text-3xl font-bold text-foreground">Flow State</h1>
          <p className="text-muted-foreground mt-1">Gym Lead CRM — track, follow up, convert.</p>
        </div>
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setLocation("/sign-in")}
          className="px-6 py-2.5 rounded-lg border border-primary text-primary font-semibold text-sm hover:bg-primary/10 transition-colors"
        >
          Sign in
        </button>
        <button
          type="button"
          onClick={() => setLocation("/sign-up")}
          className="px-6 py-2.5 rounded-lg font-semibold text-sm"
          style={{ background: "linear-gradient(135deg, #00c8f0 0%, #0099bb 100%)", color: "#0d1b2a" }}
        >
          Get started
        </button>
      </div>
    </div>
  );
}

// ─── Sign-in / Sign-up pages ──────────────────────────────────────────────────
function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  // If the user arrived from an invite link, pre-fill and lock the email address.
  // sessionStorage is cleared on tab close; the invite page re-sets it each visit.
  const inviteEmail = sessionStorage.getItem("inviteEmail") ?? undefined;
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <SignUp
        routing="path"
        path={`${basePath}/sign-up`}
        signInUrl={`${basePath}/sign-in`}
        initialValues={inviteEmail ? { emailAddress: inviteEmail } : undefined}
      />
    </div>
  );
}

// ─── Root provider with Clerk + Wouter ───────────────────────────────────────
function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: { start: { title: "Welcome back", subtitle: "Sign in to Flow State" } },
        signUp: { start: { title: "Create your account", subtitle: "Start tracking gym leads today" } },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <Switch>
          <Route path="/" component={HomeRedirect} />
          {/* REQUIRED — /*? matches both bare URL and Clerk OAuth sub-paths */}
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          <Route path="/accept-invite" component={AcceptInvitePage} />
          {/* App routes — only reachable if HomeRedirect already passed gym check */}
          <Route path="/leads" component={() => <AuthedAppGuard><LeadsList /></AuthedAppGuard>} />
          <Route path="/leads/new" component={() => <AuthedAppGuard><LeadNew /></AuthedAppGuard>} />
          <Route path="/leads/:id" component={() => <AuthedAppGuard><LeadDetail /></AuthedAppGuard>} />
          <Route path="/sequences" component={() => <AuthedAppGuard><Sequences /></AuthedAppGuard>} />
          <Route path="/analytics" component={() => <AuthedAppGuard><Analytics /></AuthedAppGuard>} />
          <Route path="/team" component={() => <AuthedAppGuard><Team /></AuthedAppGuard>} />
          <Route component={NotFound} />
        </Switch>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

// Guard used by deep links: checks sign-in AND gym assignment.
// Users without a gym are redirected to / where GymSetupPage is shown.
function AuthedAppGuard({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  const [, setLocation] = useLocation();
  const [gymId, setGymId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) { setLocation("/sign-in"); return; }
    fetch("/api/me", { credentials: "include" })
      .then((r) => r.json())
      .then((d: { user?: { gymId: string | null } }) => setGymId(d.user?.gymId ?? null))
      .catch(() => setGymId(null));
  }, [isLoaded, isSignedIn, setLocation]);

  useEffect(() => {
    if (gymId === null) setLocation("/"); // redirect to gym setup
  }, [gymId, setLocation]);

  if (!isLoaded || !isSignedIn || gymId === undefined || gymId === null) return null;
  return (
    <Layout>
      {children}
    </Layout>
  );
}

function App() {
  useKeepAlive();
  return (
    <TooltipProvider>
      <WouterRouter base={basePath}>
        <ClerkProviderWithRoutes />
      </WouterRouter>
      <Toaster />
    </TooltipProvider>
  );
}

export default App;
