import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface TicketListItem {
  id: string;
  subject: string;
  category: string;
  // Absent for a CLIENT viewer - priority is a support/triage concept they
  // never see.
  priority?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  raisedBy: { id: string; name: string | null; email: string; role: string };
  onBehalfOf: { id: string; name: string | null; email: string } | null;
  franchise: { id: string; businessName: string } | null;
  miner: { id: string; name: string } | null;
  invoice: {
    id: string;
    invoiceNumber: string;
    totalAmount: string;
    status: string;
  } | null;
  assignedTo: { id: string; name: string | null; email: string } | null;
  _count: { messages: number };
}

export interface TicketMessageItem {
  id: string;
  ticketId: string;
  authorId: string | null;
  author: {
    id: string;
    name: string | null;
    email: string;
    role: string;
  } | null;
  body: string;
  isInternal: boolean;
  isSystemGenerated: boolean;
  metadata: Record<string, unknown> | null;
  attachmentUrl: string | null;
  createdAt: string;
}

export interface TicketDetail extends Omit<TicketListItem, "_count"> {
  closedAt: string | null;
  messages: TicketMessageItem[];
  miner: { id: string; name: string; serialNumber: string | null } | null;
}

export function useTickets(filters?: {
  status?: string;
  category?: string;
  priority?: string;
}) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["tickets", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters?.status) params.append("status", filters.status);
      if (filters?.category) params.append("category", filters.category);
      if (filters?.priority) params.append("priority", filters.priority);

      const res = await fetch(`/api/tickets?${params}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch tickets");
      return res.json();
    },
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
  });

  return {
    tickets: (data?.data as TicketListItem[]) || [],
    loading: isLoading,
    error: error instanceof Error ? error.message : null,
    refetch,
  };
}

export function useTicket(id: string) {
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["ticket", id],
    queryFn: async () => {
      const res = await fetch(`/api/tickets/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch ticket");
      return res.json();
    },
    enabled: !!id,
    staleTime: 15 * 1000,
    refetchInterval: 15 * 1000,
  });

  const replyMutation = useMutation({
    mutationFn: async (input: {
      message: string;
      isInternal?: boolean;
      attachmentUrl?: string;
      attachmentPublicId?: string;
    }) => {
      const res = await fetch(`/api/tickets/${id}/messages`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to send reply");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket", id] });
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async (status: string) => {
      const res = await fetch(`/api/tickets/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to update status");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket", id] });
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });

  const priorityMutation = useMutation({
    mutationFn: async (priority: string) => {
      const res = await fetch(`/api/tickets/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priority }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to update priority");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket", id] });
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });

  const assignMutation = useMutation({
    mutationFn: async (assignedToId: string | null) => {
      const res = await fetch(`/api/tickets/${id}/assign`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedToId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to assign ticket");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ticket", id] });
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });

  return {
    ticket: (data?.data as TicketDetail) || null,
    loading: isLoading,
    error: error instanceof Error ? error.message : null,
    reply: replyMutation.mutateAsync,
    replying: replyMutation.isPending,
    updateStatus: statusMutation.mutateAsync,
    updatingStatus: statusMutation.isPending,
    updatePriority: priorityMutation.mutateAsync,
    updatingPriority: priorityMutation.isPending,
    assign: assignMutation.mutateAsync,
    assigning: assignMutation.isPending,
  };
}

export function useCreateTicket() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      subject: string;
      category: string;
      priority?: string;
      message: string;
      minerId?: string;
      invoiceId?: string;
      onBehalfOfUserId?: string;
    }) => {
      const res = await fetch("/api/tickets", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to create ticket");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tickets"] });
    },
  });
}
