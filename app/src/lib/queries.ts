// Server state (TanStack Query). One cache key per API collection, so every
// screen that shows projects / tags / entries reads the same data and a
// mutation anywhere refreshes all of them.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "./api";
import type { Client, Project, ReportSummary, Tag, TimeEntry } from "./types";

export const keys = {
  projects: ["projects"] as const,
  clients: ["clients"] as const,
  tags: ["tags"] as const,
  entries: ["time-entries"] as const,
  entriesRange: (from: string, to: string) => ["time-entries", "range", from, to] as const,
  entriesAll: ["time-entries", "all"] as const,
  reports: ["reports"] as const,
  summary: (from: string, to: string) => ["reports", "summary", from, to] as const,
};

export function useProjects() {
  return useQuery({ queryKey: keys.projects, queryFn: () => apiFetch<Project[]>("/projects") });
}

export function useClients() {
  return useQuery({ queryKey: keys.clients, queryFn: () => apiFetch<Client[]>("/clients") });
}

export function useTags() {
  return useQuery({ queryKey: keys.tags, queryFn: () => apiFetch<Tag[]>("/tags") });
}

export function useEntriesInRange(from: string, to: string) {
  return useQuery({
    queryKey: keys.entriesRange(from, to),
    queryFn: () => apiFetch<TimeEntry[]>(`/time-entries?from=${from}&to=${to}`),
    placeholderData: (prev) => prev,
  });
}

/** Every entry — feeds the description autocomplete. */
export function useAllEntries() {
  return useQuery({ queryKey: keys.entriesAll, queryFn: () => apiFetch<TimeEntry[]>("/time-entries") });
}

export function useReportSummary(from: string, to: string) {
  return useQuery({
    queryKey: keys.summary(from, to),
    queryFn: () => apiFetch<ReportSummary>(`/reports/summary?from=${from}&to=${to}`),
    placeholderData: (prev) => prev,
  });
}

export type EntryInput = {
  projectId: string | null;
  description: string;
  startTime: string;
  endTime: string;
  billable?: boolean;
  tagIds?: string[];
};

/** Create (no id) or update (id) a time entry. */
export function useSaveEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: Partial<EntryInput> }) =>
      id
        ? apiFetch<TimeEntry>(`/time-entries/${id}`, { method: "PATCH", body })
        : apiFetch<TimeEntry>("/time-entries", { method: "POST", body }),
    onSuccess: () => invalidateEntries(qc),
  });
}

export function useDeleteEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<null>(`/time-entries/${id}`, { method: "DELETE" }),
    onSuccess: () => invalidateEntries(qc),
  });
}

function invalidateEntries(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: keys.entries });
  void qc.invalidateQueries({ queryKey: keys.reports });
}

type Collection = "projects" | "clients" | "tags";

/** Create / update / delete for the named collections (projects, clients, tags). */
export function useCollectionMutations<T extends { id: string }>(collection: Collection) {
  const qc = useQueryClient();
  const onSuccess = () => {
    void qc.invalidateQueries({ queryKey: [collection] });
    // Renames and color changes show up in entry lists and reports.
    void qc.invalidateQueries({ queryKey: keys.reports });
  };
  const save = useMutation({
    mutationFn: ({ id, body }: { id?: string; body: Record<string, unknown> }) =>
      id
        ? apiFetch<T>(`/${collection}/${id}`, { method: "PATCH", body })
        : apiFetch<T>(`/${collection}`, { method: "POST", body }),
    onSuccess,
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch<null>(`/${collection}/${id}`, { method: "DELETE" }),
    onSuccess,
  });
  return { save, remove };
}
