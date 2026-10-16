import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { BrowserRouter, HashRouter, Navigate, Route, Routes } from "react-router-dom";

import { AppShell } from "./layout/AppShell";
import { ThemeProvider } from "./lib/theme";
import { LocalUserProvider, useLocalUser } from "./lib/user";
import { ClientsScreen, ProjectsScreen, TagsScreen } from "./screens/CollectionScreens";
import { ImportScreen } from "./screens/ImportScreen";
import { ReportsScreen } from "./screens/ReportsScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { Timesheet } from "./screens/Timesheet";
import { Button } from "./ui/Button";
import { Card, Spinner, TextField } from "./ui/controls";
import { Toaster } from "./ui/toast";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1 },
  },
});

// Static hosting without SPA fallbacks can opt into hash routing.
const Router = import.meta.env.VITE_ANIMO_HASH_ROUTING === "true" ? HashRouter : BrowserRouter;

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LocalUserProvider>
          <Router>
            <Gate />
          </Router>
          <Toaster />
        </LocalUserProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function Gate() {
  const { state } = useLocalUser();
  if (state.kind === "bootstrapping") {
    return (
      <div className="stack stack--center" style={{ height: "100vh" }}>
        <Spinner />
      </div>
    );
  }
  if (state.kind === "needs-setup") return <SetupScreen />;
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Timesheet view="calendar" />} />
        <Route path="/list" element={<Timesheet view="list" />} />
        <Route path="/projects" element={<ProjectsScreen />} />
        <Route path="/clients" element={<ClientsScreen />} />
        <Route path="/tags" element={<TagsScreen />} />
        <Route path="/import" element={<ImportScreen />} />
        <Route path="/reports" element={<ReportsScreen />} />
        <Route path="/settings" element={<SettingsScreen />} />
        {/* Legacy auth routes and unknown paths land on the workspace. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

function SetupScreen() {
  const { state, createUser } = useLocalUser();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const loading = state.loading;
  const error = state.kind === "needs-setup" ? state.error : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !username.trim()) return;
    createUser(name.trim(), username.trim()).catch(() => {
      // The error is surfaced through the gate state.
    });
  };

  return (
    <div className="row row--center" style={{ minHeight: "100vh", padding: 16 }}>
      <Card style={{ maxWidth: 440, width: "100%", padding: 20 }}>
        <div className="stack stack--gap-1">
          <div className="text-bold text-large text-strong">Welcome to Animo</div>
          <div className="text-secondary text-small">
            Let's set up your local profile. It stays on this device and scopes your time
            tracking to you.
          </div>
        </div>
        <form className="stack stack--gap-3" onSubmit={submit}>
          <TextField
            label="Display name"
            value={name}
            onChange={setName}
            required
            autoFocus
            maxLength={100}
          />
          <TextField
            label="Username"
            value={username}
            onChange={setUsername}
            required
            maxLength={30}
          />
          <div className="text-secondary text-small">
            Lowercase letters, numbers, and underscores recommended (3-30 chars).
          </div>
          {error && <div className="text-danger text-small">{error}</div>}
          <Button type="submit" label={loading ? "Creating..." : "Get Started"} disabled={loading} />
        </form>
      </Card>
    </div>
  );
}
