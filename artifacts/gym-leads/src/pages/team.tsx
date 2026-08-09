import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Trash2, Users, Mail, Clock, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUser } from "@clerk/react";

interface Member {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  createdAt: string;
}

interface Invite {
  id: string;
  email: string;
  token: string;
  expiresAt: string;
  createdAt: string;
  inviterName: string | null;
}

interface DbUser {
  id: string;
  role: string;
  gymId: string | null;
}

interface InvitesResponse {
  invites: Invite[];
  expiredInvites: Invite[];
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error ?? "Request failed");
  }
  return res.json() as Promise<T>;
}

export default function Team() {
  const { user: clerkUser } = useUser();
  const queryClient = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState("");
  const [resendSuccess, setResendSuccess] = useState<string | null>(null);
  const [resendError, setResendError] = useState<{ token: string; message: string } | null>(null);

  // Get local DB user (for role / gymId)
  const { data: meData } = useQuery<{ user: DbUser }>({
    queryKey: ["me"],
    queryFn: () => apiFetch<{ user: DbUser }>("/api/me"),
    staleTime: 30_000,
  });
  const dbUser = meData?.user;
  const isOwner = dbUser?.role === "owner";

  // Use externalId (migrated Replit Auth ID) or Clerk native ID for comparisons
  const currentUserId = clerkUser ? (clerkUser.externalId ?? clerkUser.id) : undefined;

  const membersQuery = useQuery({
    queryKey: ["team-members"],
    queryFn: () => apiFetch<{ members: Member[] }>("/api/invites/members"),
  });

  const invitesQuery = useQuery({
    queryKey: ["pending-invites"],
    queryFn: () => apiFetch<InvitesResponse>("/api/invites"),
  });

  const sendInviteMutation = useMutation({
    mutationFn: (email: string) =>
      apiFetch("/api/invites", {
        method: "POST",
        body: JSON.stringify({ email }),
      }),
    onSuccess: () => {
      setInviteEmail("");
      setInviteError("");
      queryClient.invalidateQueries({ queryKey: ["pending-invites"] });
    },
    onError: (err: Error) => {
      setInviteError(err.message);
    },
  });

  const revokeInviteMutation = useMutation({
    mutationFn: (token: string) =>
      apiFetch(`/api/invites/${token}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-invites"] });
    },
  });

  const resendInviteMutation = useMutation({
    mutationFn: (token: string) =>
      apiFetch(`/api/invites/resend/${token}`, { method: "POST" }),
    onSuccess: (_data, token) => {
      setResendSuccess(token);
      setResendError(null);
      queryClient.invalidateQueries({ queryKey: ["pending-invites"] });
      setTimeout(() => setResendSuccess(null), 4000);
    },
    onError: (err: Error, token) => {
      setResendError({ token, message: err.message });
      setResendSuccess(null);
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: (userId: string) =>
      apiFetch(`/api/team/members/${userId}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
    },
  });

  function handleInviteSubmit(e: React.FormEvent) {
    e.preventDefault();
    setInviteError("");
    if (!inviteEmail.includes("@")) {
      setInviteError("A valid email address is required.");
      return;
    }
    sendInviteMutation.mutate(inviteEmail.trim());
  }

  const members = membersQuery.data?.members ?? [];
  const invites = invitesQuery.data?.invites ?? [];
  const expiredInvites = invitesQuery.data?.expiredInvites ?? [];

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Team</h1>
        <p className="text-muted-foreground mt-1">
          Manage your gym's staff and pending invitations.
        </p>
      </div>

      {/* Invite form — owner only */}
      {isOwner && (
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-base font-semibold text-foreground mb-4 flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-primary" />
            Invite a team member
          </h2>
          <form onSubmit={handleInviteSubmit} className="flex gap-3">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="colleague@example.com"
              className="flex-1 px-3 py-2 rounded-lg border border-border text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <Button
              type="submit"
              disabled={sendInviteMutation.isPending}
              size="sm"
            >
              {sendInviteMutation.isPending ? "Sending…" : "Send invite"}
            </Button>
          </form>
          {inviteError && (
            <p className="text-xs text-destructive mt-2">{inviteError}</p>
          )}
          {sendInviteMutation.isSuccess && (
            <p className="text-xs text-green-600 mt-2">
              Invite sent! They'll receive an email with a link to join.
            </p>
          )}
        </div>
      )}

      {/* Current staff */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          <h2 className="text-base font-semibold text-foreground">
            Staff ({members.length})
          </h2>
        </div>
        {membersQuery.isLoading ? (
          <div className="px-6 py-8 text-center text-muted-foreground text-sm">
            Loading…
          </div>
        ) : members.length === 0 ? (
          <div className="px-6 py-8 text-center text-muted-foreground text-sm">
            No staff members yet.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {members.map((m) => (
              <li key={m.id} className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-xs uppercase">
                    {(m.name?.[0] ?? m.email?.[0] ?? "?").toUpperCase()}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-foreground">
                      {m.name ?? m.email}
                    </div>
                    {m.name && (
                      <div className="text-xs text-muted-foreground">{m.email}</div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      m.role === "owner"
                        ? "bg-primary/10 text-primary border border-primary/20"
                        : "bg-muted text-muted-foreground border border-border"
                    }`}
                  >
                    {m.role}
                  </span>
                  <span className="text-xs text-muted-foreground hidden sm:block">
                    Joined {new Date(m.createdAt).toLocaleDateString()}
                  </span>
                  {isOwner && m.role !== "owner" && m.id !== dbUser?.id && m.id !== currentUserId && (
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(`Remove ${m.name ?? m.email} from the gym? They will lose access immediately.`)) {
                          removeMemberMutation.mutate(m.id);
                        }
                      }}
                      disabled={removeMemberMutation.isPending}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                      title="Remove staff member"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Remove</span>
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Pending invites — owner only */}
      {isOwner && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center gap-2">
            <Mail className="w-4 h-4 text-primary" />
            <h2 className="text-base font-semibold text-foreground">
              Pending invites ({invites.length})
            </h2>
          </div>
          {invitesQuery.isLoading ? (
            <div className="px-6 py-8 text-center text-muted-foreground text-sm">
              Loading…
            </div>
          ) : invites.length === 0 ? (
            <div className="px-6 py-8 text-center text-muted-foreground text-sm">
              No pending invites.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {invites.map((inv) => (
                <li
                  key={inv.id}
                  className="px-6 py-4 flex items-center justify-between gap-4"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">
                      {inv.email}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3" />
                      Expires {new Date(inv.expiresAt).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => revokeInviteMutation.mutate(inv.token)}
                    disabled={revokeInviteMutation.isPending}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50 flex-shrink-0"
                    title="Revoke invite"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Revoke</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Expired invites — owner only */}
      {isOwner && expiredInvites.length > 0 && (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-6 py-4 border-b border-border flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-500" />
            <h2 className="text-base font-semibold text-foreground">
              Expired invites ({expiredInvites.length})
            </h2>
          </div>
          <ul className="divide-y divide-border">
            {expiredInvites.map((inv) => (
              <li
                key={inv.id}
                className="px-6 py-4 flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground truncate">
                    {inv.email}
                  </div>
                  <div className="text-xs text-amber-600 flex items-center gap-1 mt-0.5">
                    <Clock className="w-3 h-3" />
                    Expired {new Date(inv.expiresAt).toLocaleDateString()}
                    {inv.inviterName && (
                      <span className="text-muted-foreground ml-1">
                        · Invited by {inv.inviterName}
                      </span>
                    )}
                  </div>
                  {resendSuccess === inv.token && (
                    <p className="text-xs text-green-600 mt-1">
                      Invite resent! A new email has been sent.
                    </p>
                  )}
                  {resendError?.token === inv.token && (
                    <p className="text-xs text-destructive mt-1">
                      {resendError.message}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => resendInviteMutation.mutate(inv.token)}
                    disabled={resendInviteMutation.isPending}
                    className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors disabled:opacity-50"
                    title="Resend invite"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Resend</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => revokeInviteMutation.mutate(inv.token)}
                    disabled={revokeInviteMutation.isPending}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                    title="Delete expired invite"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Delete</span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
