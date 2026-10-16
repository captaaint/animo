// API payload shapes (camelCase, as serialized by api/src/*.rs).

export type Client = {
  id: string;
  name: string;
  color: string;
};

export type Project = {
  id: string;
  name: string;
  color: string;
  clientId: string | null;
  hourlyRate?: number;
  currency?: string;
};

export type Tag = {
  id: string;
  name: string;
  color: string;
};

export type TimeEntry = {
  id: string;
  projectId: string | null;
  description: string;
  startTime: string; // ISO, wall-clock HH:MM (see lib/format.ts)
  endTime: string;
  durationSeconds?: number;
  billable?: boolean;
  tagIds?: string[];
};

export type ReportEntry = TimeEntry & {
  projectName: string | null;
  clientName: string | null;
  durationSeconds: number;
  billable: boolean;
  hourlyRate: number | null;
  currency: string | null;
  tagIds: string[];
};

export type ReportSummary = {
  totalSeconds: number;
  billableSeconds: number;
  daily: { date: string; seconds: number }[];
  entries: ReportEntry[];
  amounts: { currency: string; amount: number }[];
};

export type UserPreferences = {
  theme: string;
  uiDensity?: string;
  dateFormat?: string;
  timeFormat?: string;
};

export type LocalUser = {
  id: string;
  name: string;
  username: string;
  preferences?: UserPreferences;
};
