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
import { useKeepAlive } from "@/hooks/use-keep-alive";
import { useAuth } from "@workspace/replit-auth-web";
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
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

type AuthView = "login" | "register" | "forgot" | "check-email" | "reset-password";

function LoginGate() {
  const { isLoading, isAuthenticated, refetch } = useAuth();
  const [view, setView] = useState<AuthView>("login");
  const [location] = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("verified") === "true") {
      setView("login");
    }
    if (window.location.pathname.includes("reset-password") || params.get("token")) {
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
          {view === "login" && <LoginForm onRegister={() => setView("register")} onForgot={() => setView("forgot")} onSuccess={refetch} />}
          {view === "register" && <RegisterForm onLogin={() => setView("login")} onSuccess={() => setView("check-email")} />}
          {view === "forgot" && <ForgotPasswordForm onBack={() => setView("login")} />}
          {view === "check-email" && <CheckEmailMessage onBack={() => setView("login")} />}
          {view === "reset-password" && <ResetPasswordForm onBack={() => setView("login")} onSuccess={() => setView("login")} />}
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

function InputField({ label, type, value, onChange, placeholder, error }: {
  label: string; type: string; value: string;
  onChange: (v: string) => void; placeholder?: string; error?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-foreground">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full px-3 py-2 rounded-lg border text-sm bg-background focus:outline-none focus:ring-2 transition-all ${
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

function LoginForm({ onRegister, onForgot, onSuccess }: { onRegister: () => void; onForgot: () => void; onSuccess: () => void }) {
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

function RegisterForm({ onLogin, onSuccess }: { onLogin: () => void; onSuccess: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState("");
  const [loading, setLoading] = useState(false);

  function validate() {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Name is required.";
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
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (res.ok) {
        onSuccess();
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

function CheckEmailMessage({ onBack }: { onBack: () => void }) {
  return (
    <div className="space-y-4 text-center">
      <Logo />
      <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
        <p className="font-semibold text-foreground">Check your email</p>
        <p className="text-sm text-muted-foreground mt-1">
          We sent a verification link to your inbox. Click it to activate your account, then sign in.
        </p>
      </div>
      <button type="button" onClick={onBack} className="text-primary hover:underline text-sm">
        ← Back to sign in
      </button>
    </div>
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
        setError(data.error || "Reset failed. Please request a new link.");
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
          <LoginGate />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
