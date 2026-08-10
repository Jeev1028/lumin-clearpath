import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Layers,
  Megaphone,
  Send,
  ShieldCheck,
  Trash2,
  Users as UsersIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { SiteHeader } from "@/components/lumin/SiteHeader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAdminStatus, type AdminRecord } from "@/hooks/useAdminStatus";
import { useAuth } from "@/hooks/useAuth";
import type { AdminCapability } from "@/lib/admin-auth";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "Admin dashboard — ClearPath" }],
  }),
  component: AdminPage,
});

type UserRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  is_admin: boolean;
};

type NoticeRow = {
  id: string;
  message: string;
  active: boolean;
  created_at: string;
  group_ids: string[] | null;
};

type GroupRow = { id: string; name: string; member_count: number };

const CAPABILITY_LABELS: Record<AdminCapability, string> = {
  can_view_users: "View users",
  can_view_grades: "View grades",
  can_manage_notices: "Manage notices",
  can_send_email: "Send email",
  can_manage_groups: "Manage groups",
};
const CAPABILITY_KEYS = Object.keys(CAPABILITY_LABELS) as AdminCapability[];

function emptyCapabilities() {
  return {
    can_view_users: false,
    can_view_grades: false,
    can_manage_notices: false,
    can_send_email: false,
    can_manage_groups: false,
  };
}

function AdminPage() {
  const navigate = useNavigate();
  const { user, loading, needsMfa, session } = useAuth();
  const { admin, loading: adminLoading, isAdmin } = useAdminStatus();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [admins, setAdmins] = useState<AdminRecord[]>([]);
  const [adminsLoading, setAdminsLoading] = useState(false);
  const [notices, setNotices] = useState<NoticeRow[]>([]);
  const [noticesLoading, setNoticesLoading] = useState(false);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);

  const [grantEmail, setGrantEmail] = useState("");
  const [grantCaps, setGrantCaps] = useState(emptyCapabilities());
  const [granting, setGranting] = useState(false);

  const [newNotice, setNewNotice] = useState("");
  const [noticeGroupIds, setNoticeGroupIds] = useState<Set<string>>(new Set());
  const [postingNotice, setPostingNotice] = useState(false);

  const [newGroupName, setNewGroupName] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [groupMemberIds, setGroupMemberIds] = useState<Set<string>>(new Set());
  const [groupMembersLoading, setGroupMembersLoading] = useState(false);
  const [groupMemberFilter, setGroupMemberFilter] = useState("");

  const [userFilter, setUserFilter] = useState("");
  const [selectedRecipients, setSelectedRecipients] = useState<Set<string>>(new Set());
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailGroupToAdd, setEmailGroupToAdd] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      void navigate({ to: "/auth" });
      return;
    }
    if (needsMfa) {
      void navigate({ to: "/mfa-challenge" });
      return;
    }
    if (adminLoading) return;
    if (!isAdmin) {
      toast.error("You don't have access to the admin dashboard.");
      void navigate({ to: "/chat" });
    }
  }, [loading, user, needsMfa, adminLoading, isAdmin, navigate]);

  function authHeaders() {
    if (!session) return {};
    return { Authorization: `Bearer ${session.access_token}` };
  }

  async function loadUsers() {
    setUsersLoading(true);
    try {
      const res = await fetch("/api/admin/users", { headers: authHeaders() });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { users: UserRow[] };
      setUsers(data.users);
    } catch {
      toast.error("Could not load users.");
    } finally {
      setUsersLoading(false);
    }
  }

  async function loadAdmins() {
    setAdminsLoading(true);
    try {
      const res = await fetch("/api/admin/admins", { headers: authHeaders() });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { admins: AdminRecord[] };
      setAdmins(data.admins);
    } catch {
      toast.error("Could not load admins.");
    } finally {
      setAdminsLoading(false);
    }
  }

  async function loadNotices() {
    setNoticesLoading(true);
    try {
      const res = await fetch("/api/admin/notices", { headers: authHeaders() });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { notices: NoticeRow[] };
      setNotices(data.notices);
    } catch {
      toast.error("Could not load notices.");
    } finally {
      setNoticesLoading(false);
    }
  }

  async function loadGroups() {
    setGroupsLoading(true);
    try {
      const res = await fetch("/api/admin/groups", { headers: authHeaders() });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { groups: GroupRow[] };
      setGroups(data.groups);
    } catch {
      toast.error("Could not load groups.");
    } finally {
      setGroupsLoading(false);
    }
  }

  async function loadGroupMembers(groupId: string) {
    setGroupMembersLoading(true);
    try {
      const res = await fetch(`/api/admin/group-members?group_id=${encodeURIComponent(groupId)}`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { members: { id: string }[] };
      setGroupMemberIds(new Set(data.members.map((m) => m.id)));
    } catch {
      toast.error("Could not load group members.");
    } finally {
      setGroupMembersLoading(false);
    }
  }

  useEffect(() => {
    if (!admin) return;
    if (admin.can_view_users || admin.can_send_email || admin.can_manage_groups) void loadUsers();
    if (admin.is_root) void loadAdmins();
    if (admin.can_manage_notices) void loadNotices();
    if (admin.can_manage_groups || admin.can_manage_notices || admin.can_send_email) void loadGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin?.user_id]);

  async function handleGrantAdmin(event: React.FormEvent) {
    event.preventDefault();
    if (!grantEmail.trim()) return;
    setGranting(true);
    try {
      const res = await fetch("/api/admin/admins", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ email: grantEmail.trim(), capabilities: grantCaps }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not grant admin access.");
      toast.success(`Admin access granted to ${grantEmail.trim()}.`);
      setGrantEmail("");
      setGrantCaps(emptyCapabilities());
      await loadAdmins();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not grant admin access.");
    } finally {
      setGranting(false);
    }
  }

  async function handleUpdateAdminCaps(userId: string, capabilities: Record<string, boolean>) {
    try {
      const res = await fetch("/api/admin/admins", {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, capabilities }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not update admin.");
      await loadAdmins();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update admin.");
    }
  }

  async function handleRevokeAdmin(userId: string) {
    try {
      const res = await fetch(`/api/admin/admins?user_id=${encodeURIComponent(userId)}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not revoke admin access.");
      toast.success("Admin access revoked.");
      await loadAdmins();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not revoke admin access.");
    }
  }

  async function handlePostNotice(event: React.FormEvent) {
    event.preventDefault();
    if (!newNotice.trim()) return;
    setPostingNotice(true);
    try {
      const res = await fetch("/api/admin/notices", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          message: newNotice.trim(),
          groupIds: noticeGroupIds.size > 0 ? [...noticeGroupIds] : undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { emailed?: number; error?: string };
      if (!res.ok) throw new Error(data.error || "Could not post notice.");
      toast.success(
        typeof data.emailed === "number"
          ? `Notice posted and emailed to ${data.emailed} recipient${data.emailed === 1 ? "" : "s"}.`
          : "Notice posted.",
      );
      setNewNotice("");
      setNoticeGroupIds(new Set());
      await loadNotices();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not post notice.");
    } finally {
      setPostingNotice(false);
    }
  }

  async function handleToggleNotice(id: string, active: boolean) {
    try {
      const res = await fetch("/api/admin/notices", {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ id, active }),
      });
      if (!res.ok) throw new Error();
      await loadNotices();
    } catch {
      toast.error("Could not update notice.");
    }
  }

  async function handleDeleteNotice(id: string) {
    try {
      const res = await fetch(`/api/admin/notices?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error();
      toast.success("Notice deleted.");
      await loadNotices();
    } catch {
      toast.error("Could not delete notice.");
    }
  }

  async function handleCreateGroup(event: React.FormEvent) {
    event.preventDefault();
    if (!newGroupName.trim()) return;
    setCreatingGroup(true);
    try {
      const res = await fetch("/api/admin/groups", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ name: newGroupName.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Could not create group.");
      toast.success(`Group "${newGroupName.trim()}" created.`);
      setNewGroupName("");
      await loadGroups();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create group.");
    } finally {
      setCreatingGroup(false);
    }
  }

  async function handleDeleteGroup(id: string) {
    try {
      const res = await fetch(`/api/admin/groups?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error();
      toast.success("Group deleted.");
      if (activeGroupId === id) setActiveGroupId(null);
      await loadGroups();
    } catch {
      toast.error("Could not delete group.");
    }
  }

  function openGroupMembers(groupId: string) {
    setActiveGroupId((current) => (current === groupId ? null : groupId));
    setGroupMemberFilter("");
    if (activeGroupId !== groupId) void loadGroupMembers(groupId);
  }

  async function toggleGroupMember(groupId: string, userId: string, isMember: boolean) {
    const next = new Set(groupMemberIds);
    if (isMember) next.delete(userId);
    else next.add(userId);
    setGroupMemberIds(next);
    try {
      const res = isMember
        ? await fetch(
            `/api/admin/group-members?group_id=${encodeURIComponent(groupId)}&user_id=${encodeURIComponent(userId)}`,
            { method: "DELETE", headers: authHeaders() },
          )
        : await fetch("/api/admin/group-members", {
            method: "POST",
            headers: { ...authHeaders(), "Content-Type": "application/json" },
            body: JSON.stringify({ groupId, userId }),
          });
      if (!res.ok) throw new Error();
      await loadGroups();
    } catch {
      toast.error("Could not update group membership.");
      setGroupMemberIds(groupMemberIds);
    }
  }

  function toggleRecipient(id: string) {
    const next = new Set(selectedRecipients);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedRecipients(next);
  }

  async function handleAddGroupToRecipients() {
    if (!emailGroupToAdd) return;
    try {
      const res = await fetch(
        `/api/admin/group-members?group_id=${encodeURIComponent(emailGroupToAdd)}`,
        { headers: authHeaders() },
      );
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { members: { id: string }[] };
      const next = new Set(selectedRecipients);
      for (const m of data.members) next.add(m.id);
      setSelectedRecipients(next);
      toast.success(`Added ${data.members.length} group member(s) to recipients.`);
    } catch {
      toast.error("Could not load that group's members.");
    }
  }

  async function handleSendEmail(event: React.FormEvent) {
    event.preventDefault();
    if (selectedRecipients.size === 0) {
      toast.error("Select at least one recipient.");
      return;
    }
    setSendingEmail(true);
    try {
      const res = await fetch("/api/admin/send-email", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          userIds: [...selectedRecipients],
          subject: emailSubject,
          body: emailBody,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        sent?: number;
        failed?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Could not send email.");
      toast.success(`Sent to ${data.sent} recipient${data.sent === 1 ? "" : "s"}.`);
      setEmailSubject("");
      setEmailBody("");
      setSelectedRecipients(new Set());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send email.");
    } finally {
      setSendingEmail(false);
    }
  }

  const filteredUsers = useMemo(() => {
    const q = userFilter.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) => u.email?.toLowerCase().includes(q) || u.full_name?.toLowerCase().includes(q),
    );
  }, [users, userFilter]);

  const filteredGroupMemberCandidates = useMemo(() => {
    const q = groupMemberFilter.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) => u.email?.toLowerCase().includes(q) || u.full_name?.toLowerCase().includes(q),
    );
  }, [users, groupMemberFilter]);

  const groupsById = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups]);

  if (loading || adminLoading || !admin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-deep">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const availableTabs = [
    admin.can_view_users && "users",
    admin.is_root && "admins",
    admin.can_manage_groups && "groups",
    admin.can_view_grades && "grades",
    admin.can_manage_notices && "notices",
    admin.can_send_email && "email",
  ].filter(Boolean) as string[];

  return (
    <div className="min-h-screen bg-deep">
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-6 pb-24">
        <div className="mt-10 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10">
            <ShieldCheck className="h-5 w-5 text-accent" aria-hidden />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Admin dashboard</h1>
            <p className="text-sm text-muted-foreground">
              {admin.is_root ? "Root admin" : "Admin"} access for {admin.email}
            </p>
          </div>
        </div>

        {availableTabs.length === 0 ? (
          <p className="mt-8 text-sm text-muted-foreground">
            You have admin access but no capabilities enabled yet — ask the root admin to grant
            you some.
          </p>
        ) : (
          <Tabs defaultValue={availableTabs[0]!} className="mt-8">
            <TabsList className="flex-wrap">
              {admin.can_view_users && <TabsTrigger value="users">Users</TabsTrigger>}
              {admin.is_root && <TabsTrigger value="admins">Admins</TabsTrigger>}
              {admin.can_manage_groups && <TabsTrigger value="groups">Groups</TabsTrigger>}
              {admin.can_view_grades && <TabsTrigger value="grades">Grades</TabsTrigger>}
              {admin.can_manage_notices && <TabsTrigger value="notices">Notices</TabsTrigger>}
              {admin.can_send_email && <TabsTrigger value="email">Email</TabsTrigger>}
            </TabsList>

            {admin.can_view_users && (
              <TabsContent value="users">
                <div className="mt-4 rounded-2xl border border-border/70 bg-card/70 p-6 shadow-panel">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <UsersIcon className="h-4 w-4 text-muted-foreground" aria-hidden />
                      <p className="text-sm font-semibold">{users.length} registered users</p>
                    </div>
                    <Input
                      value={userFilter}
                      onChange={(e) => setUserFilter(e.target.value)}
                      placeholder="Search by name or email…"
                      className="max-w-xs"
                    />
                  </div>
                  {usersLoading ? (
                    <p className="text-sm text-muted-foreground">Loading…</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-border/60 text-xs text-muted-foreground">
                            <th className="pb-2 pr-4">Name</th>
                            <th className="pb-2 pr-4">Email</th>
                            <th className="pb-2 pr-4">Joined</th>
                            <th className="pb-2 pr-4">Last sign-in</th>
                            <th className="pb-2">Admin</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredUsers.map((u) => (
                            <tr key={u.id} className="border-b border-border/40">
                              <td className="py-2 pr-4">{u.full_name || "—"}</td>
                              <td className="py-2 pr-4">{u.email}</td>
                              <td className="py-2 pr-4 text-muted-foreground">
                                {new Date(u.created_at).toLocaleDateString()}
                              </td>
                              <td className="py-2 pr-4 text-muted-foreground">
                                {u.last_sign_in_at
                                  ? new Date(u.last_sign_in_at).toLocaleDateString()
                                  : "Never"}
                              </td>
                              <td className="py-2">{u.is_admin ? "Yes" : ""}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </TabsContent>
            )}

            {admin.is_root && (
              <TabsContent value="admins">
                <div className="mt-4 space-y-6">
                  <form
                    onSubmit={handleGrantAdmin}
                    className="rounded-2xl border border-border/70 bg-card/70 p-6 shadow-panel"
                  >
                    <p className="text-sm font-semibold">Grant admin access</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      The account must already have a ClearPath account.
                    </p>
                    <div className="mt-3 space-y-2">
                      <Label htmlFor="grant-email">Email</Label>
                      <Input
                        id="grant-email"
                        type="email"
                        value={grantEmail}
                        onChange={(e) => setGrantEmail(e.target.value)}
                        placeholder="teacher@school.edu"
                        required
                      />
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {CAPABILITY_KEYS.map((key) => (
                        <label key={key} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={grantCaps[key]}
                            onCheckedChange={(checked) =>
                              setGrantCaps((prev) => ({ ...prev, [key]: Boolean(checked) }))
                            }
                          />
                          {CAPABILITY_LABELS[key]}
                        </label>
                      ))}
                    </div>
                    <Button
                      type="submit"
                      disabled={granting}
                      className="mt-4 bg-gradient-lumin text-primary-foreground shadow-glow"
                    >
                      {granting ? "Granting…" : "Grant access"}
                    </Button>
                  </form>

                  <div className="rounded-2xl border border-border/70 bg-card/70 p-6 shadow-panel">
                    <p className="text-sm font-semibold">Current admins</p>
                    {adminsLoading ? (
                      <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
                    ) : (
                      <div className="mt-3 space-y-3">
                        {admins.map((a) => (
                          <div
                            key={a.user_id}
                            className="rounded-xl border border-border/60 bg-background/40 p-4"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-medium">
                                {a.email} {a.is_root && <span className="text-accent">(root)</span>}
                              </p>
                              {!a.is_root && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="gap-1.5 text-destructive hover:text-destructive"
                                  onClick={() => void handleRevokeAdmin(a.user_id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                                  Revoke
                                </Button>
                              )}
                            </div>
                            {!a.is_root && (
                              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                                {CAPABILITY_KEYS.map((key) => (
                                  <label key={key} className="flex items-center gap-2 text-xs">
                                    <Checkbox
                                      checked={Boolean(a[key])}
                                      onCheckedChange={(checked) =>
                                        void handleUpdateAdminCaps(a.user_id, {
                                          can_view_users: a.can_view_users,
                                          can_view_grades: a.can_view_grades,
                                          can_manage_notices: a.can_manage_notices,
                                          can_send_email: a.can_send_email,
                                          can_manage_groups: a.can_manage_groups,
                                          [key]: Boolean(checked),
                                        })
                                      }
                                    />
                                    {CAPABILITY_LABELS[key]}
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>
            )}

            {admin.can_manage_groups && (
              <TabsContent value="groups">
                <div className="mt-4 space-y-6">
                  <form
                    onSubmit={handleCreateGroup}
                    className="flex flex-wrap items-end gap-3 rounded-2xl border border-border/70 bg-card/70 p-6 shadow-panel"
                  >
                    <div className="flex-1 space-y-2">
                      <Label htmlFor="new-group-name" className="flex items-center gap-2">
                        <Layers className="h-4 w-4" aria-hidden />
                        New group
                      </Label>
                      <Input
                        id="new-group-name"
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        placeholder="e.g. Grade 9, 9-1, Homeroom A…"
                        required
                      />
                    </div>
                    <Button
                      type="submit"
                      disabled={creatingGroup}
                      className="bg-gradient-lumin text-primary-foreground shadow-glow"
                    >
                      {creatingGroup ? "Creating…" : "Create group"}
                    </Button>
                  </form>

                  <div className="rounded-2xl border border-border/70 bg-card/70 p-6 shadow-panel">
                    <p className="text-sm font-semibold">Groups</p>
                    {groupsLoading ? (
                      <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
                    ) : groups.length === 0 ? (
                      <p className="mt-2 text-sm text-muted-foreground">
                        No groups yet — create one above.
                      </p>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {groups.map((g) => (
                          <div key={g.id} className="rounded-xl border border-border/60 bg-background/40">
                            <div className="flex items-center justify-between gap-3 p-3">
                              <button
                                type="button"
                                onClick={() => openGroupMembers(g.id)}
                                className="flex-1 text-left text-sm font-medium hover:underline"
                              >
                                {g.name}{" "}
                                <span className="text-xs font-normal text-muted-foreground">
                                  ({g.member_count} member{g.member_count === 1 ? "" : "s"})
                                </span>
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDeleteGroup(g.id)}
                                aria-label="Delete group"
                                className="text-muted-foreground/70 transition-colors hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                            {activeGroupId === g.id && (
                              <div className="border-t border-border/60 p-3">
                                <Input
                                  value={groupMemberFilter}
                                  onChange={(e) => setGroupMemberFilter(e.target.value)}
                                  placeholder="Search users to add/remove…"
                                  className="mb-2"
                                />
                                {groupMembersLoading ? (
                                  <p className="text-xs text-muted-foreground">Loading members…</p>
                                ) : (
                                  <div className="max-h-56 overflow-y-auto">
                                    {filteredGroupMemberCandidates.map((u) => {
                                      const isMember = groupMemberIds.has(u.id);
                                      return (
                                        <label
                                          key={u.id}
                                          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-secondary/40"
                                        >
                                          <Checkbox
                                            checked={isMember}
                                            onCheckedChange={() =>
                                              void toggleGroupMember(g.id, u.id, isMember)
                                            }
                                          />
                                          <span className="truncate">
                                            {u.full_name ? `${u.full_name} — ` : ""}
                                            {u.email}
                                          </span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>
            )}

            {admin.can_view_grades && (
              <TabsContent value="grades">
                <div className="mt-4 rounded-2xl border border-border/70 bg-card/70 p-6 shadow-panel">
                  <p className="text-sm font-semibold">Grades</p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    No grade data yet. This will populate automatically once Google Classroom or
                    ManageBac integration is connected — no manual grade entry is planned.
                  </p>
                </div>
              </TabsContent>
            )}

            {admin.can_manage_notices && (
              <TabsContent value="notices">
                <div className="mt-4 space-y-6">
                  <form
                    onSubmit={handlePostNotice}
                    className="rounded-2xl border border-border/70 bg-card/70 p-6 shadow-panel"
                  >
                    <p className="flex items-center gap-2 text-sm font-semibold">
                      <Megaphone className="h-4 w-4" aria-hidden />
                      Post a notice
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Shows as a dismissible banner across the whole app, and emails the target
                      audience.
                    </p>
                    <Textarea
                      value={newNotice}
                      onChange={(e) => setNewNotice(e.target.value)}
                      placeholder="e.g. School closed Friday for a PD day."
                      className="mt-3 min-h-20"
                      required
                    />
                    {groups.length > 0 && (
                      <div className="mt-3">
                        <p className="mb-1.5 text-xs text-muted-foreground">
                          Target (leave unchecked to notify everyone):
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {groups.map((g) => {
                            const checked = noticeGroupIds.has(g.id);
                            return (
                              <button
                                key={g.id}
                                type="button"
                                onClick={() => {
                                  const next = new Set(noticeGroupIds);
                                  if (checked) next.delete(g.id);
                                  else next.add(g.id);
                                  setNoticeGroupIds(next);
                                }}
                                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                                  checked
                                    ? "border-accent bg-accent/15 text-foreground"
                                    : "border-border/60 bg-background/40 text-muted-foreground hover:text-foreground"
                                }`}
                              >
                                {g.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    <Button
                      type="submit"
                      disabled={postingNotice}
                      className="mt-3 bg-gradient-lumin text-primary-foreground shadow-glow"
                    >
                      {postingNotice ? "Posting…" : "Post notice"}
                    </Button>
                  </form>

                  <div className="rounded-2xl border border-border/70 bg-card/70 p-6 shadow-panel">
                    <p className="text-sm font-semibold">All notices</p>
                    {noticesLoading ? (
                      <p className="mt-2 text-sm text-muted-foreground">Loading…</p>
                    ) : notices.length === 0 ? (
                      <p className="mt-2 text-sm text-muted-foreground">No notices yet.</p>
                    ) : (
                      <div className="mt-3 space-y-3">
                        {notices.map((n) => (
                          <div
                            key={n.id}
                            className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-background/40 p-4"
                          >
                            <div>
                              <p className="text-sm">{n.message}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {new Date(n.created_at).toLocaleString()} ·{" "}
                                {n.group_ids && n.group_ids.length > 0
                                  ? n.group_ids.map((id) => groupsById.get(id) ?? "Unknown group").join(", ")
                                  : "Everyone"}
                              </p>
                            </div>
                            <div className="flex items-center gap-3">
                              <Switch
                                checked={n.active}
                                onCheckedChange={(checked) => void handleToggleNotice(n.id, checked)}
                              />
                              <button
                                type="button"
                                onClick={() => void handleDeleteNotice(n.id)}
                                aria-label="Delete notice"
                                className="text-muted-foreground/70 transition-colors hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </TabsContent>
            )}

            {admin.can_send_email && (
              <TabsContent value="email">
                <form
                  onSubmit={handleSendEmail}
                  className="mt-4 rounded-2xl border border-border/70 bg-card/70 p-6 shadow-panel"
                >
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <Send className="h-4 w-4" aria-hidden />
                    Send an email
                  </p>
                  <div className="mt-3 space-y-2">
                    <Label>Recipients ({selectedRecipients.size} selected)</Label>
                    {groups.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={emailGroupToAdd}
                          onChange={(e) => setEmailGroupToAdd(e.target.value)}
                          className="h-9 rounded-md border border-border/60 bg-background/40 px-2 text-sm"
                        >
                          <option value="">Add a group…</option>
                          {groups.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.name} ({g.member_count})
                            </option>
                          ))}
                        </select>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={!emailGroupToAdd}
                          onClick={() => void handleAddGroupToRecipients()}
                          className="border-border/70 bg-background/40 text-foreground hover:text-foreground"
                        >
                          Add group to recipients
                        </Button>
                      </div>
                    )}
                    <Input
                      value={userFilter}
                      onChange={(e) => setUserFilter(e.target.value)}
                      placeholder="Search users to select…"
                    />
                    <div className="max-h-48 overflow-y-auto rounded-lg border border-border/60 bg-background/40 p-2">
                      {usersLoading ? (
                        <p className="p-2 text-xs text-muted-foreground">Loading users…</p>
                      ) : (
                        filteredUsers.map((u) => (
                          <label
                            key={u.id}
                            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-secondary/40"
                          >
                            <Checkbox
                              checked={selectedRecipients.has(u.id)}
                              onCheckedChange={() => toggleRecipient(u.id)}
                            />
                            <span className="truncate">
                              {u.full_name ? `${u.full_name} — ` : ""}
                              {u.email}
                            </span>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="mt-3 space-y-2">
                    <Label htmlFor="email-subject">Subject</Label>
                    <Input
                      id="email-subject"
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      required
                    />
                  </div>
                  <div className="mt-3 space-y-2">
                    <Label htmlFor="email-body">Message</Label>
                    <Textarea
                      id="email-body"
                      value={emailBody}
                      onChange={(e) => setEmailBody(e.target.value)}
                      className="min-h-32"
                      required
                    />
                  </div>
                  <Button
                    type="submit"
                    disabled={sendingEmail}
                    className="mt-4 bg-gradient-lumin text-primary-foreground shadow-glow"
                  >
                    {sendingEmail ? "Sending…" : "Send email"}
                  </Button>
                </form>
              </TabsContent>
            )}
          </Tabs>
        )}
      </main>
    </div>
  );
}
