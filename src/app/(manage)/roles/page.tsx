"use client";

/**
 * /roles - custom staff roles (RBAC stage 5, SUPER_ADMIN in Phase 1).
 * A role is a set of catalogue permissions given to ADMIN, ACCOUNTING or
 * STAFF accounts on top of what their system role has. A STAFF account has
 * nothing else, so its roles are all it can do.
 */
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import CloseIcon from "@mui/icons-material/Close";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DaylightAdminPage,
  DaylightStatusPill,
  useDaylightAdminSx,
} from "@/components/daylight/AdminPage";
import { useUser } from "@/lib/hooks";
import { can } from "@/lib/auth/can";
import { PERMISSIONS, SA_ONLY, type Permission } from "@/lib/auth/permissions";

type Person = { id: string; name: string | null; email: string; role: string };
type Role = {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  members: Person[];
};
type RolesResponse = { roles: Role[]; staff: Person[] };

const QUERY_KEY = ["staff-roles"];

async function call<T>(url: string, method = "GET", body?: unknown) {
  const res = await fetch(url, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data as T;
}

/** The catalogue, grouped by module in catalogue order. */
const MODULES = (() => {
  const groups = new Map<string, Permission[]>();
  for (const p of Object.keys(PERMISSIONS) as Permission[]) {
    const m = p.split(".")[0];
    groups.set(m, [...(groups.get(m) ?? []), p]);
  }
  return [...groups].map(([key, perms]) => ({
    key,
    title: key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()),
    perms,
  }));
})();

const personLabel = (p: Person) =>
  `${p.name || p.email} (${p.role.toLowerCase()})`;

export default function RolesPage() {
  const ds = useDaylightAdminSx();
  const { user } = useUser();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => call<RolesResponse>("/api/admin/roles"),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: QUERY_KEY });

  const canManage = can(user, "roles.manage");
  const canAssign = can(user, "roles.assign");

  const [editing, setEditing] = useState<Role | "new" | null>(null);
  const [peopleOf, setPeopleOf] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Role | null>(null);

  const roles = data?.roles ?? [];
  const peopleRole = roles.find((r) => r.id === peopleOf) ?? null;

  return (
    <DaylightAdminPage>
      <Box sx={{ mb: 3 }}>
        <Typography component="h1" sx={ds.pageTitleSx}>
          Roles
        </Typography>
        <Typography sx={ds.pageDescSx}>
          A role is a set of permissions you give to ADMIN, ACCOUNTING or STAFF
          accounts. A STAFF account can do only what its roles allow. ADMIN and
          ACCOUNTING already have every permission except the super admin ones,
          so a role adds nothing for them today. Changes apply on the
          person&apos;s next click; their menu updates when they reload.
        </Typography>
      </Box>
      <Paper elevation={0} sx={{ ...ds.listCardSx, p: { xs: 2, sm: 3 } }}>
        {canManage && (
          <Stack direction="row" justifyContent="flex-end" sx={{ mb: 2 }}>
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => setEditing("new")}
              sx={ds.primaryBtnSx}
            >
              New role
            </Button>
          </Stack>
        )}
        {error && (
          <Alert severity="error" sx={{ mb: 2, ...ds.alertSx("error") }}>
            {(error as Error).message}
          </Alert>
        )}
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Role</TableCell>
                <TableCell align="right">Permissions</TableCell>
                <TableCell>People</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={4}>Loading…</TableCell>
                </TableRow>
              )}
              {!isLoading && roles.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4}>
                    No roles yet. Create one, then give it to STAFF accounts.
                  </TableCell>
                </TableRow>
              )}
              {roles.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Typography sx={{ fontWeight: 600 }}>{r.name}</Typography>
                    {r.description && (
                      <Typography variant="body2" color="text.secondary">
                        {r.description}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">{r.permissions.length}</TableCell>
                  <TableCell>
                    {r.members.length === 0
                      ? "Nobody"
                      : r.members.map((m) => m.name || m.email).join(", ")}
                  </TableCell>
                  <TableCell align="right">
                    <Stack
                      direction="row"
                      spacing={1}
                      justifyContent="flex-end"
                    >
                      {canAssign && (
                        <Button size="small" onClick={() => setPeopleOf(r.id)}>
                          People
                        </Button>
                      )}
                      {canManage && (
                        <Button size="small" onClick={() => setEditing(r)}>
                          Edit
                        </Button>
                      )}
                      {canManage && (
                        <Button
                          size="small"
                          color="error"
                          onClick={() => setDeleting(r)}
                        >
                          Delete
                        </Button>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {editing && (
        <RoleEditor
          role={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      )}
      {peopleRole && (
        <PeopleDialog
          role={peopleRole}
          staff={data?.staff ?? []}
          onClose={() => setPeopleOf(null)}
          onChanged={refresh}
        />
      )}
      {deleting && (
        <DeleteDialog
          role={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            refresh();
          }}
        />
      )}
    </DaylightAdminPage>
  );
}

function RoleEditor({
  role,
  onClose,
  onSaved,
}: {
  role: Role | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set(role?.permissions ?? []),
  );
  const save = useMutation({
    mutationFn: () =>
      call(
        role ? `/api/admin/roles/${role.id}` : "/api/admin/roles",
        role ? "PUT" : "POST",
        { name, description, permissions: [...picked] },
      ),
    onSuccess: onSaved,
  });

  const toggle = (perms: Permission[], on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      for (const p of perms) {
        if (SA_ONLY.has(p)) continue;
        if (on) next.add(p);
        else next.delete(p);
      }
      return next;
    });

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{role ? `Edit ${role.name}` : "New role"}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {save.error && (
            <Alert severity="error">{(save.error as Error).message}</Alert>
          )}
          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
            fullWidth
            inputProps={{ maxLength: 60 }}
          />
          <TextField
            label="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            fullWidth
            inputProps={{ maxLength: 300 }}
          />
          <Typography variant="body2" color="text.secondary">
            {picked.size} permissions selected. Items marked &quot;super admin
            only&quot; can&apos;t be given by a role. Sensitive ones move money,
            change sign-in or payout details, or delete records.
          </Typography>
          {MODULES.map((m) => {
            const grantable = m.perms.filter((p) => !SA_ONLY.has(p));
            const on = grantable.filter((p) => picked.has(p)).length;
            return (
              <Box
                key={m.key}
                sx={{
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 1,
                  p: 1.5,
                }}
              >
                <FormControlLabel
                  label={
                    <Typography sx={{ fontWeight: 600 }}>{m.title}</Typography>
                  }
                  control={
                    <Checkbox
                      checked={grantable.length > 0 && on === grantable.length}
                      indeterminate={on > 0 && on < grantable.length}
                      disabled={grantable.length === 0}
                      onChange={(e) => toggle(grantable, e.target.checked)}
                    />
                  }
                />
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
                    pl: { xs: 0, sm: 4 },
                  }}
                >
                  {m.perms.map((p) => {
                    const meta = PERMISSIONS[p] as {
                      label: string;
                      sensitive?: boolean;
                    };
                    const saOnly = SA_ONLY.has(p);
                    return (
                      <FormControlLabel
                        key={p}
                        disabled={saOnly}
                        control={
                          <Checkbox
                            size="small"
                            checked={!saOnly && picked.has(p)}
                            onChange={(e) => toggle([p], e.target.checked)}
                          />
                        }
                        label={
                          <Box component="span">
                            <Typography component="span" variant="body2">
                              {meta.label}
                            </Typography>{" "}
                            {saOnly && (
                              <DaylightStatusPill
                                label="super admin only"
                                tone="neutral"
                              />
                            )}
                            {!saOnly && meta.sensitive && (
                              <DaylightStatusPill
                                label="sensitive"
                                tone="warning"
                              />
                            )}
                          </Box>
                        }
                      />
                    );
                  })}
                </Box>
              </Box>
            );
          })}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={save.isPending}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={() => save.mutate()}
          disabled={save.isPending || !name.trim()}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function PeopleDialog({
  role,
  staff,
  onClose,
  onChanged,
}: {
  role: Role;
  staff: Person[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState<Person | null>(null);
  const memberIds = useMemo(
    () => new Set(role.members.map((m) => m.id)),
    [role.members],
  );
  const change = useMutation({
    mutationFn: ({ userId, add }: { userId: string; add: boolean }) =>
      call(`/api/admin/roles/${role.id}/assignments`, add ? "POST" : "DELETE", {
        userId,
      }),
    onSuccess: () => {
      setAdding(null);
      onChanged();
    },
  });

  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>People with {role.name}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {change.error && (
            <Alert severity="error">{(change.error as Error).message}</Alert>
          )}
          {role.members.length === 0 && (
            <Typography color="text.secondary">
              Nobody has this role.
            </Typography>
          )}
          {role.members.map((m) => (
            <Stack
              key={m.id}
              direction="row"
              alignItems="center"
              justifyContent="space-between"
            >
              <Typography>{personLabel(m)}</Typography>
              <Tooltip title="Take this role away">
                <span>
                  <IconButton
                    size="small"
                    disabled={change.isPending}
                    onClick={() => change.mutate({ userId: m.id, add: false })}
                    aria-label={`Take ${role.name} from ${m.name || m.email}`}
                  >
                    <CloseIcon fontSize="small" />
                  </IconButton>
                </span>
              </Tooltip>
            </Stack>
          ))}
          <Stack direction="row" spacing={1} alignItems="center">
            <Autocomplete
              sx={{ flex: 1 }}
              options={staff.filter((s) => !memberIds.has(s.id))}
              getOptionLabel={personLabel}
              value={adding}
              onChange={(_, v) => setAdding(v)}
              renderInput={(params) => (
                <TextField {...params} label="Give to" size="small" />
              )}
            />
            <Button
              variant="contained"
              disabled={!adding || change.isPending}
              onClick={() =>
                adding && change.mutate({ userId: adding.id, add: true })
              }
            >
              Add
            </Button>
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Done</Button>
      </DialogActions>
    </Dialog>
  );
}

function DeleteDialog({
  role,
  onClose,
  onDeleted,
}: {
  role: Role;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const del = useMutation({
    mutationFn: () => call(`/api/admin/roles/${role.id}`, "DELETE"),
    onSuccess: onDeleted,
  });
  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Delete {role.name}?</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Typography>
            {role.members.length
              ? `Take it away from its ${role.members.length} people first.`
              : "This can't be undone."}
          </Typography>
          {del.error && (
            <Alert severity="error">{(del.error as Error).message}</Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={del.isPending}>
          Cancel
        </Button>
        <Button
          color="error"
          variant="contained"
          onClick={() => del.mutate()}
          disabled={del.isPending || role.members.length > 0}
        >
          Delete
        </Button>
      </DialogActions>
    </Dialog>
  );
}
