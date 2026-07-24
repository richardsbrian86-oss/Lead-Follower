import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
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
import Team from "@/pages/team";
import { useKeepAlive } from "@/hooks/use-keep-alive";
import { useAuth, AuthProvider } from "@workspace/replit-auth-web";
import { useState, useEffect } from "react";

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
        <Route path="/team" component={Team} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

type AuthView = "login" | "register" | "forgot" | "check-email" | "reset-password" | "accept-invite";

function LoginGate() {
  const { isLoading, isAuthenticated, refetch } = useAuth();
  const [view, setView] = useState<AuthView>("login");
  const [location] = useLocation();
  const [registeredEmail, setRegisteredEmail] = useState("");
  const [verifiedBanner, setVerifiedBanner] = useState<"success" | "error" | null>(null);
  const [inviteToken, setInviteToken] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const invite = params.get("invite");
    if (invite) {
      setInviteToken(invite);
      setView("accept-invite");
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.get("verified") === "1") {
      setView("login");
      setVerifiedBanner("success");
      window.history.replaceState({}, "", window.location.pathname);
    } else if (params.get("verifyError") === "1") {
      setView("login");
      setVerifiedBanner("error");
      window.history.replaceState({}, "", window.location.pathname);
    } else if (window.location.pathname.includes("reset-password") || params.get("token")) {
      setView("reset-password");
    }
  }, [location]);

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
        <div className="w-full max-w-sm px-6">
          {view === "login" && (
            <LoginForm
              onRegister={() => { setVerifiedBanner(null); setView("register"); }}
              onForgot={() => { setVerifiedBanner(null); setView("forgot"); }}
              onSuccess={refetch}
              verifiedBanner={verifiedBanner}
              onDismissBanner={() => setVerifiedBanner(null)}
            />
          )}
          {view === "register" && (
            <RegisterForm
              onLogin={() => setView("login")}
              onSuccess={(email) => { setRegisteredEmail(email); setView("check-email"); }}
            />
          )}
          {view === "forgot" && <ForgotPasswordForm onBack={() => setView("login")} />}
          {view === "check-email" && (
            <CheckEmailMessage email={registeredEmail} onBack={() => setView("login")} />
          )}
          {view === "reset-password" && (
            <ResetPasswordForm onBack={() => setView("login")} onSuccess={() => setView("login")} />
          )}
          {view === "accept-invite" && (
            <AcceptInviteForm
              token={inviteToken}
              onSuccess={refetch}
              onBack={() => setView("login")}
            />
          )}
        </div>
      </div>
    );
  }

  return <Router />;
}

function Logo() {
  return (
    <div className="flex flex-col items-center gap-3 mb-6">
      <img
        src="/flow-state-logo.png"
        alt="Flow State CRM"
        className="w-48 h-auto object-contain"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />
      <div className="text-center">
        <h1 className="text-2xl font-bold" style={{ color: "#0d1b2a" }}>Flow State</h1>
        <p className="text-sm text-muted-foreground">Gym Lead CRM</p>
      </div>
    </div>
  );
}

function InputField({ label, type, value, onChange, placeholder, error, readOnly, id: idProp }: {
  label: string; type: string; value: string;
  onChange: (v: string) => void; placeholder?: string; error?: string; readOnly?: boolean; id?: string;
}) {
  const id = idProp ?? label.toLowerCase().replace(/\s+/g, "-");
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-sm font-medium text-foreground">{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        className={`w-full px-3 py-2 rounded-lg border text-sm bg-background focus:outline-none focus:ring-2 transition-all ${
          readOnly ? "opacity-60 cursor-not-allowed" :
          error ? "border-destructive focus:ring-destructive/20" : "border-border focus:ring-primary/20"
        }`}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function SubmitButton({ children, loading, disabled }: { children: React.ReactNode; loading?: boolean; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={loading || disabled}
      className="w-full py-2.5 rounded-lg font-semibold text-sm transition-all disabled:opacity-60"
      style={{
        background: "linear-gradient(135deg, #00c8f0 0%, #0099bb 100%)",
        color: "#0d1b2a",
        boxShadow: "0 4px 24px rgba(0,200,240,0.25)",
      }}
    >
      {loading ? "Please wait…" : children}
    </button>
  );
}

function LoginForm({
  onRegister,
  onForgot,
  onSuccess,
  verifiedBanner,
  onDismissBanner,
}: {
  onRegister: () => void;
  onForgot: () => void;
  onSuccess: () => void;
  verifiedBanner?: "success" | "error" | null;
  onDismissBanner?: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [needsVerify, setNeedsVerify] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setNeedsVerify(false);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (res.ok) {
        onSuccess();
      } else if (data.code === "EMAIL_NOT_VERIFIED") {
        setNeedsVerify(true);
        setError(data.error);
      } else {
        setError(data.error || "Sign in failed.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Logo />
      <h2 className="text-lg font-semibold text-center text-foreground">Welcome back</h2>

      {verifiedBanner === "success" && (
        <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700 flex items-start justify-between gap-2">
          <span>Email verified — sign in below</span>
          {onDismissBanner && (
            <button type="button" onClick={onDismissBanner} className="text-green-500 hover:text-green-700 flex-shrink-0">✕</button>
          )}
        </div>
      )}
      {verifiedBanner === "error" && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive flex items-start justify-between gap-2">
          <span>Verification link is invalid or has expired. Please request a new one.</span>
          {onDismissBanner && (
            <button type="button" onClick={onDismissBanner} className="text-destructive/60 hover:text-destructive flex-shrink-0">✕</button>
          )}
        </div>
      )}

      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
          {error}
          {needsVerify && <span className="block mt-1 text-xs opacity-80">Check your inbox for the verification link.</span>}
        </div>
      )}
      <InputField label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" />
      <InputField label="Password" type="password" value={password} onChange={setPassword} placeholder="Your password" />
      <div className="text-right">
        <button type="button" onClick={onForgot} className="text-xs text-primary hover:underline">
          Forgot password?
        </button>
      </div>
      <SubmitButton loading={loading}>Sign in</SubmitButton>
      <p className="text-center text-sm text-muted-foreground">
        No account?{" "}
        <button type="button" onClick={onRegister} className="text-primary font-medium hover:underline">
          Create one
        </button>
      </p>
    </form>
  );
}

function RegisterForm({ onLogin, onSuccess }: { onLogin: () => void; onSuccess: (email: string) => void }) {
  const [name, setName] = useState("");
  const [gymName, setGymName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);

  function validate() {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Name is required.";
    if (!gymName.trim()) e.gymName = "Gym name is required.";
    if (!email.includes("@")) e.email = "Valid email is required.";
    if (password.length < 8) e.password = "At least 8 characters.";
    return e;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setServerError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, gymName, email, password }),
      });
      const data = await res.json();
      if (res.ok) {
        onSuccess(email);
      } else {
        setServerError(data.error || "Registration failed.");
      }
    } catch {
      setServerError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Logo />
      <h2 className="text-lg font-semibold text-center text-foreground">Create your account</h2>
      {serverError && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
          {serverError}
        </div>
      )}
      <InputField label="Your name" type="text" value={name} onChange={setName} placeholder="Jane Smith" error={errors.name} />
      <InputField label="Gym name" type="text" value={gymName} onChange={setGymName} placeholder="CrossFit Central" error={errors.gymName} />
      <InputField label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" error={errors.email} />
      <InputField label="Password" type="password" value={password} onChange={setPassword} placeholder="8+ characters" error={errors.password} />
      <SubmitButton loading={loading}>Create account</SubmitButton>
      <p className="text-center text-sm text-muted-foreground">
        Already have one?{" "}
        <button type="button" onClick={onLogin} className="text-primary font-medium hover:underline">
          Sign in
        </button>
      </p>
    </form>
  );
}

function ForgotPasswordForm({ onBack }: { onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) { setError("Valid email is required."); return; }
    setError("");
    setLoading(true);
    try {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Logo />
      <h2 className="text-lg font-semibold text-center text-foreground">Reset your password</h2>
      {sent ? (
        <div className="p-3 rounded-lg bg-primary/10 border border-primary/20 text-sm text-foreground text-center">
          If an account exists for <strong>{email}</strong>, you'll receive a reset link shortly.
        </div>
      ) : (
        <>
          {error && <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">{error}</div>}
          <InputField label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" />
          <SubmitButton loading={loading}>Send reset link</SubmitButton>
        </>
      )}
      <p className="text-center text-sm">
        <button type="button" onClick={onBack} className="text-primary hover:underline text-sm">
          ← Back to sign in
        </button>
      </p>
    </form>
  );
}

function CheckEmailMessage({ email, onBack }: { email: string; onBack: () => void }) {
  const [resendState, setResendState] = useState<"idle" | "loading" | "sent" | "error">("idle");

  async function handleResend() {
    setResendState("loading");
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email }),
      });
      setResendState(res.ok ? "sent" : "error");
    } catch {
      setResendState("error");
    }
  }

  return (
    <div className="space-y-4 text-center">
      <Logo />
      <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
        <p className="font-semibold text-foreground">Check your email</p>
        <p className="text-sm text-muted-foreground mt-1">
          We sent a verification link{email ? ` to ${email}` : " to your inbox"}. Click it to activate your account, then sign in.
        </p>
      </div>
      {resendState === "sent" && (
        <div className="p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">
          Verification email resent! Check your inbox.
        </div>
      )}
      {resendState === "error" && (
        <p className="text-sm text-destructive">Failed to resend. Please try again.</p>
      )}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={handleResend}
          disabled={resendState === "loading" || resendState === "sent"}
          className="text-primary hover:underline text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {resendState === "loading" ? "Sending…" : resendState === "sent" ? "Email sent ✓" : "Resend verification email"}
        </button>
        <button type="button" onClick={onBack} className="text-muted-foreground hover:underline text-sm">
          ← Back to sign in
        </button>
      </div>
    </div>
  );
}

function AcceptInviteForm({
  token,
  onSuccess,
  onBack,
}: {
  token: string;
  onSuccess: () => void;
  onBack: () => void;
}) {
  const [inviteDetails, setInviteDetails] = useState<{ email: string; gymName: string } | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loadingDetails, setLoadingDetails] = useState(true);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) { setLoadError("Invalid invite link."); setLoadingDetails(false); return; }
    fetch(`/api/auth/invite/${token}`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : r.json().then((d: { error?: string }) => Promise.reject(d.error ?? "Invalid invite")))
      .then((d: { email: string; gymName: string }) => { setInviteDetails(d); setLoadingDetails(false); })
      .catch((err: string) => { setLoadError(err || "This invite link is invalid or has expired."); setLoadingDetails(false); });
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Your name is required."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/accept-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, name, password }),
      });
      const data = await res.json();
      if (res.ok) {
        onSuccess();
      } else {
        setError((data as { error?: string }).error || "Failed to accept invite.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (loadingDetails) {
    return (
      <div className="space-y-4 text-center">
        <Logo />
        <p className="text-muted-foreground text-sm">Checking your invite…</p>
      </div>
    );
  }

  if (loadError || !inviteDetails) {
    return (
      <div className="space-y-4 text-center">
        <Logo />
        <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/20">
          <p className="font-semibold text-destructive">Invite link invalid</p>
          <p className="text-sm text-muted-foreground mt-1">
            {loadError || "This invite link is invalid or has expired."}
          </p>
          <p className="text-xs text-muted-foreground mt-2">Contact your gym owner for a new invite.</p>
        </div>
        <button type="button" onClick={onBack} className="text-primary hover:underline text-sm">
          ← Back to sign in
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Logo />
      <div className="text-center">
        <h2 className="text-lg font-semibold text-foreground">Join {inviteDetails.gymName}</h2>
        <p className="text-sm text-muted-foreground mt-1">Set up your account to get started.</p>
      </div>
      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">
          {error}
        </div>
      )}
      <InputField
        label="Email"
        id="invite-email"
        type="email"
        value={inviteDetails.email}
        onChange={() => {}}
        readOnly
      />
      <InputField label="Your name" type="text" value={name} onChange={setName} placeholder="Jane Smith" />
      <InputField label="Password" type="password" value={password} onChange={setPassword} placeholder="8+ characters" />
      <InputField label="Confirm password" type="password" value={confirm} onChange={setConfirm} placeholder="Same as above" />
      <SubmitButton loading={loading}>Join {inviteDetails.gymName}</SubmitButton>
      <p className="text-center text-sm">
        <button type="button" onClick={onBack} className="text-primary hover:underline text-sm">
          ← Back to sign in
        </button>
      </p>
    </form>
  );
}

function ResetPasswordForm({ onBack, onSuccess }: { onBack: () => void; onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const token = new URLSearchParams(window.location.search).get("token") ?? "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { setError("At least 8 characters required."); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    if (!token) { setError("Missing reset token. Please use the link from your email."); return; }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (res.ok) {
        onSuccess();
      } else {
        setError((data as { error?: string }).error || "Reset failed. Please request a new link.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Logo />
      <h2 className="text-lg font-semibold text-center text-foreground">Set new password</h2>
      {error && <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm text-destructive">{error}</div>}
      <InputField label="New password" type="password" value={password} onChange={setPassword} placeholder="8+ characters" />
      <InputField label="Confirm password" type="password" value={confirm} onChange={setConfirm} placeholder="Same as above" />
      <SubmitButton loading={loading}>Set new password</SubmitButton>
      <p className="text-center text-sm">
        <button type="button" onClick={onBack} className="text-primary hover:underline text-sm">
          ← Back to sign in
        </button>
      </p>
    </form>
  );
}

function App() {
  useKeepAlive();
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AuthProvider>
            <LoginGate />
          </AuthProvider>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
