import type { Page } from '@playwright/test';
import { API_URL } from './constants';

export function uniqueName(prefix: string): string {
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `${prefix}-${stamp}-${rand}`;
}

// Run API calls from the page context so cookies (Secure on localhost) are
// applied by Chromium, which honours the localhost trustworthy-origin rule.
async function pageFetch<T>(
  page: Page,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const result = await page.evaluate(
    async (args) => {
      const res = await fetch(args.url, {
        method: args.method ?? 'GET',
        credentials: 'include',
        headers: args.body ? { 'Content-Type': 'application/json' } : undefined,
        body: args.body ? JSON.stringify(args.body) : undefined,
      });
      const text = await res.text();
      return { ok: res.ok, status: res.status, text };
    },
    { url: `${API_URL}${path}`, method: init.method, body: init.body },
  );
  if (!result.ok) {
    throw new Error(`API ${init.method ?? 'GET'} ${path} → ${result.status}: ${result.text}`);
  }
  return (result.text ? JSON.parse(result.text) : null) as T;
}

export type Client = { id: string; name: string; color: string };
export type Project = { id: string; name: string; clientId: string | null; color: string };

export async function createClient(
  page: Page,
  name: string,
  color = '#10b981',
): Promise<Client> {
  return pageFetch<Client>(page, '/clients', {
    method: 'POST',
    body: { name, color },
  });
}

export async function createProject(
  page: Page,
  name: string,
  clientId: string | null = null,
  color = '#3b82f6',
): Promise<Project> {
  return pageFetch<Project>(page, '/projects', {
    method: 'POST',
    body: { name, clientId, color },
  });
}

export type TimeEntryInput = {
  description?: string;
  projectId?: string | null;
  startTime: string; // ISO
  endTime: string; // ISO
  billable?: boolean;
  tagIds?: string[];
};

export async function createTimeEntry(page: Page, input: TimeEntryInput) {
  return pageFetch(page, '/time-entries', {
    method: 'POST',
    body: {
      description: input.description ?? '',
      projectId: input.projectId ?? null,
      startTime: input.startTime,
      endTime: input.endTime,
      billable: !!input.billable,
      tagIds: input.tagIds ?? [],
    },
  });
}

export type Tag = { id: string; name: string; color: string };

export async function createTag(
  page: Page,
  name: string,
  color = '#64748b',
): Promise<Tag> {
  return pageFetch<Tag>(page, '/tags', {
    method: 'POST',
    body: { name, color },
  });
}

// Returns an ISO timestamp for `date` at HH:mm local time.
export function localIso(date: Date, hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

// "Today" at midnight local — useful for entries inside the current week.
export function todayAt(hhmm: string): string {
  return localIso(new Date(), hhmm);
}
