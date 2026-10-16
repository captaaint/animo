import { useState, type FormEvent, type ReactNode } from "react";

import {
  buildFeedbackPreview,
  clearDraft,
  loadDraft,
  saveDraft,
  submitFeedback,
  type FeedbackCategory,
  type FeedbackDraft,
} from "../helpers/feedback";
import {
  checkForUpdates,
  downloadAndInstall,
  isAutoCheckEnabled,
  lastCheckedAt,
  recordLastChecked,
  restartApp,
  setAutoCheckEnabled,
} from "../helpers/updater";
import { useTheme, type ThemePref } from "../lib/theme";
import { useIsMobile } from "../lib/useIsMobile";
import { useCurrentUser, useLocalUser } from "../lib/user";
import { Button } from "../ui/Button";
import {
  Avatar,
  Card,
  Illustration,
  Separator,
  Switch,
  TextAreaField,
  TextField,
} from "../ui/controls";
import { Icon, type IconName } from "../ui/Icon";
import { Drawer, DrawerAction, DrawerHeader, Modal } from "../ui/overlays";
import { Select } from "../ui/Select";
import { toast } from "../ui/toast";

const THEME_OPTIONS = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function SectionHeader({ icon, children }: { icon?: IconName; children: ReactNode }) {
  return (
    <>
      <div className="row row--gap-2 text-secondary text-small">
        {icon && <Icon name={icon} size={18} />}
        {children}
      </div>
      <Separator />
    </>
  );
}

export function SettingsScreen() {
  const isMobile = useIsMobile();
  const isTauri = !!window.__TAURI_INTERNALS__;
  const isDemo = window.__ANIMO_DEMO__ === true;
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  return (
    <div className={isMobile ? "stack stack--gap-4" : "two-col"}>
      <div className="stack stack--gap-4">
        <LocalProfileCard />
        <ProfileCard />
      </div>
      <div className="stack stack--gap-4">
        <AppearanceCard />
        {isTauri && !isDemo && <UpdatesCard />}
        <Card>
          <SectionHeader icon="mail">Help & feedback</SectionHeader>
          <div className="stack stack--gap-3">
            <div className="stack stack--gap-1">
              <div>Report a bug or share an idea</div>
              <div className="text-secondary text-small">
                {isTauri
                  ? "Feedback is only sent when you submit the form. Desktop submissions use the local app origin."
                  : "Feedback is only sent when you submit the form. We use Cloudflare Turnstile in the background to keep spam out — no CAPTCHA to solve."}
              </div>
            </div>
            <div>
              <Button label="Send feedback" icon="mail" onClick={() => setFeedbackOpen(true)} />
            </div>
          </div>
        </Card>
      </div>
      {feedbackOpen && <FeedbackDialog onClose={() => setFeedbackOpen(false)} />}
    </div>
  );
}

function LocalProfileCard() {
  const user = useCurrentUser();
  return (
    <Card>
      <SectionHeader>Local profile</SectionHeader>
      <div className="row row--gap-3">
        <Avatar name={user.name || "Local User"} />
        <div className="stack grow">
          <span className="text-strong">{user.name || "Local User"}</span>
          <span className="text-secondary text-small">
            {user.username ? "@" + user.username : "Local workspace"}
          </span>
          <span className="text-secondary text-small">
            This profile is stored locally on this device.
          </span>
        </div>
      </div>
    </Card>
  );
}

function ProfileCard() {
  const user = useCurrentUser();
  const { updateUser } = useLocalUser();
  const [name, setName] = useState(user.name || "");
  const [username, setUsername] = useState(user.username || "");
  const [saving, setSaving] = useState(false);

  const nameError = !name.trim()
    ? "Display name is required"
    : name.length > 100
      ? "Display name must be 100 characters or less"
      : null;
  const usernameError = !username.trim()
    ? "Username is required"
    : username.length < 3
      ? "Username must be at least 3 characters"
      : username.length > 30
        ? "Username must be 30 characters or less"
        : null;
  const dirty = name.trim() !== (user.name || "") || username !== (user.username || "");
  const canSave = !nameError && !usernameError && dirty && !saving;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    updateUser({ name: name.trim(), username })
      .then(() => toast.success("Profile updated"))
      .catch((err: Error) => toast.error(err.message || "Save failed"))
      .finally(() => setSaving(false));
  };

  return (
    <Card style={{ flex: "1 1 auto" }}>
      <SectionHeader>Profile</SectionHeader>
      <form className="stack stack--gap-3" style={{ flex: "1 1 auto" }} onSubmit={submit}>
        <div className="stack stack--gap-1">
          <TextField label="Display name" required maxLength={100} value={name} onChange={setName} />
          {nameError && name.length > 0 && <div className="text-danger text-small">{nameError}</div>}
          <div className="text-secondary text-small">This is the name shown in the app.</div>
        </div>
        <div className="stack stack--gap-1">
          <TextField label="Username" required maxLength={30} value={username} onChange={setUsername} />
          {usernameError && username.length > 0 && (
            <div className="text-danger text-small">{usernameError}</div>
          )}
        </div>
        <span className="spacer" />
        <div className="row row--gap-2">
          <Button type="submit" label={saving ? "Saving..." : "Save profile"} disabled={!canSave} />
          <Button
            label="Revert"
            variant="outlined"
            themeColor="secondary"
            disabled={!dirty || saving}
            onClick={() => {
              setName(user.name || "");
              setUsername(user.username || "");
            }}
          />
        </div>
      </form>
    </Card>
  );
}

function AppearanceCard() {
  const user = useCurrentUser();
  const { updateUser } = useLocalUser();
  const { setPreference } = useTheme();
  const [theme, setTheme] = useState<string>(user.preferences?.theme || "system");

  return (
    <Card>
      <SectionHeader icon="palette">Appearance</SectionHeader>
      <div className="stack stack--gap-3">
        <div className="stack">
          <span>Theme</span>
          <span className="text-secondary text-small">Choose how Animo looks on your device.</span>
        </div>
        <Select
          options={THEME_OPTIONS}
          value={theme}
          onChange={(v) => {
            setTheme(v);
            setPreference(v as ThemePref);
            updateUser({ preferences: { theme: v } })
              .then(() => toast.success("Theme preference saved"))
              .catch(() => toast.error("Could not save the theme preference"));
          }}
        />
      </div>
    </Card>
  );
}

function UpdatesCard() {
  const [autoCheck, setAutoCheck] = useState(isAutoCheckEnabled);
  const [lastChecked, setLastChecked] = useState(lastCheckedAt);
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<{ message: string; tone: "ok" | "warning" | "error" } | null>(
    null,
  );
  const [available, setAvailable] = useState<{ version: string; notes: string } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);

  const check = () => {
    setChecking(true);
    setStatus(null);
    setAvailable(null);
    setReady(false);
    checkForUpdates()
      .then((info) => {
        recordLastChecked();
        setLastChecked(lastCheckedAt());
        if (info.available) {
          setAvailable({ version: info.latestVersion || "", notes: info.releaseNotes || "" });
        } else if (info.error) {
          setStatus({ message: info.error, tone: info.status || "error" });
        } else {
          setStatus({ message: "Animo is up to date.", tone: "ok" });
        }
      })
      .catch((err: Error) =>
        setStatus({ message: err.message || "Update check failed.", tone: "error" }),
      )
      .finally(() => setChecking(false));
  };

  const download = () => {
    setDownloading(true);
    setProgress(0);
    setStatus(null);
    downloadAndInstall((p) => setProgress(p.percentage || 0))
      .then((result) => {
        if (result.success) setReady(true);
        else setStatus({ message: result.error || "Download failed", tone: "error" });
      })
      .catch((err: Error) => setStatus({ message: err.message || "Download failed", tone: "error" }))
      .finally(() => setDownloading(false));
  };

  const toneColor =
    status?.tone === "error"
      ? "var(--animo-color-danger-700)"
      : status?.tone === "warning"
        ? "var(--animo-color-surface-700)"
        : "var(--animo-color-success-700)";

  return (
    <Card style={{ flex: "1 1 auto" }}>
      <SectionHeader icon="refresh">Updates</SectionHeader>
      <div className="row row--gap-3">
        <div className="stack grow">
          <span className="text-strong">Current version</span>
          <span className="text-secondary text-small">v{window.__ANIMO_VERSION__ || "unknown"}</span>
        </div>
        <div className="stack grow">
          <span className="text-strong">Last checked</span>
          <span className="text-secondary text-small">
            {lastChecked ? new Date(lastChecked).toLocaleString() : "Never"}
          </span>
        </div>
        <Button
          label={checking ? "Checking…" : "Check for updates"}
          disabled={checking || downloading}
          onClick={check}
        />
      </div>
      {status && (
        <div className="text-small" style={{ color: toneColor }}>
          {status.message}
        </div>
      )}
      {available && (
        <div className="card card--tint" style={{ padding: 12, gap: 8 }}>
          <span className="text-strong">Update available: v{available.version}</span>
          {available.notes && <span className="text-secondary text-small">{available.notes}</span>}
          {downloading && <span className="text-strong">Downloading… {Math.round(progress)}%</span>}
          {ready && (
            <span className="text-strong text-success">Update ready. Restart Animo to finish.</span>
          )}
          <div className="row row--gap-2">
            {!downloading && !ready && <Button label="Download and install" onClick={download} />}
            {ready && <Button label="Restart now" onClick={() => void restartApp()} />}
            {!downloading && (
              <Button
                label={ready ? "Later" : "Dismiss"}
                variant="ghost"
                themeColor="secondary"
                onClick={() => {
                  setAvailable(null);
                  setReady(false);
                  setProgress(0);
                }}
              />
            )}
          </div>
        </div>
      )}
      <span className="spacer" />
      <div className="row row--gap-3">
        <div className="stack grow">
          <span>Check for updates automatically</span>
          <span className="text-secondary text-small">
            Animo checks for new versions on startup and then once a day.
          </span>
        </div>
        <Switch
          checked={autoCheck}
          label="Check for updates automatically"
          onChange={(v) => {
            setAutoCheck(v);
            setAutoCheckEnabled(v);
          }}
        />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Feedback — a modal on desktop, a drawer on mobile.
// ---------------------------------------------------------------------------------------------------------------------

const CATEGORY_OPTIONS = [
  { value: "bug", label: "Bug" },
  { value: "feature", label: "Feature request" },
  { value: "question", label: "Question" },
];

const CARD_SHADOW = { boxShadow: "0 2px 8px rgba(0,0,0,0.06)" };

function FeedbackDialog({ onClose }: { onClose: () => void }) {
  const isMobile = useIsMobile();
  const [draft, setDraft] = useState<FeedbackDraft>(() => {
    const saved = loadDraft();
    return {
      category: saved?.category || "bug",
      title: saved?.title || "",
      body: saved?.body || "",
      diagnostics_opt_in: !!saved?.diagnostics_opt_in,
    };
  });
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [confirmClose, setConfirmClose] = useState(false);

  // Every edit is persisted as a draft so closing the form loses nothing.
  const update = (patch: Partial<FeedbackDraft>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    saveDraft(next);
  };

  const titleError = !draft.title.trim()
    ? "Title is required"
    : draft.title.length > 120
      ? "Title must be 120 characters or less"
      : "";
  const bodyError = !draft.body.trim()
    ? "Description is required"
    : draft.body.length > 8000
      ? "Description must be 8000 characters or less"
      : "";
  const canSubmit = !submitting && !sent && !titleError && !bodyError;

  // Unsent feedback asks before closing so a stray Esc doesn't discard it.
  const requestClose = () => {
    const hasContent = draft.title.trim() || draft.body.trim();
    if (sent || !hasContent) onClose();
    else setConfirmClose(true);
  };

  const submit = () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    submitFeedback(draft)
      .then((result) => {
        if (result.ok) {
          clearDraft();
          toast.success("Feedback sent");
          if (isMobile) onClose();
          else setSent(true);
        } else {
          setError(result.error || "Failed to send feedback");
        }
      })
      .catch((err: Error) => setError(err.message || "Failed to send feedback"))
      .finally(() => setSubmitting(false));
  };

  const form = (
    <>
      <div className={isMobile ? "stack stack--gap-3" : "row row--gap-4 row--start"}>
        <Card className="grow" style={CARD_SHADOW}>
          <Select
            label="Category"
            options={CATEGORY_OPTIONS}
            value={draft.category}
            onChange={(v) => update({ category: (v || "bug") as FeedbackCategory })}
          />
          <div className="stack stack--gap-1">
            <TextField
              label="Title"
              required
              maxLength={120}
              value={draft.title}
              onChange={(v) => update({ title: v })}
            />
            <div className="row">
              {titleError && draft.title.length > 0 && (
                <span className="text-danger text-small">{titleError}</span>
              )}
              <span className="spacer" />
              <span className="text-xs text-secondary">{draft.title.length} / 120</span>
            </div>
          </div>
          <div className="stack stack--gap-1">
            <TextAreaField
              label="Description"
              rows={8}
              maxLength={8000}
              value={draft.body}
              onChange={(v) => update({ body: v })}
              placeholder="What happened, what did you expect, or what would you like to see?"
            />
            <div className="row">
              {bodyError && draft.body.length > 0 && (
                <span className="text-danger text-small">{bodyError}</span>
              )}
              <span className="spacer" />
              <span className="text-xs text-secondary">{draft.body.length} / 8000</span>
            </div>
          </div>
        </Card>
        <div className="stack stack--gap-3 grow">
          <Card style={CARD_SHADOW}>
            <div className="row row--gap-3">
              <span className="icon-bubble" style={{ width: 40, height: 40, borderRadius: 10 }}>
                <Icon name="file-text" />
              </span>
              <div className="stack stack--gap-1 grow">
                <span className="text-strong" style={{ fontWeight: 500 }}>
                  Attach diagnostics
                </span>
                <span className="text-xs text-secondary">
                  Preview exactly what will be attached before sending.
                </span>
              </div>
              <Switch
                checked={draft.diagnostics_opt_in}
                label="Attach diagnostics"
                onChange={(v) => update({ diagnostics_opt_in: v })}
              />
            </div>
          </Card>
          {draft.diagnostics_opt_in && (
            <Card style={CARD_SHADOW}>
              <TextAreaField
                label="Diagnostics preview"
                rows={8}
                readOnly
                monospace
                value={buildFeedbackPreview({ ...draft, diagnostics_opt_in: true })}
              />
            </Card>
          )}
          <div className="card card--tint" style={CARD_SHADOW}>
            <div className="row row--gap-2">
              <Icon name="info" color="var(--animo-color-primary-600)" />
              <span className="text-xs text-secondary grow">
                Your feedback is completely anonymous — no personal data is included in what you
                send.
              </span>
            </div>
          </div>
        </div>
      </div>
      {error && <div className="text-danger text-small">{error}</div>}
    </>
  );

  const confirm = (
    <Modal
      open={confirmClose}
      onClose={() => setConfirmClose(false)}
      title="Close feedback?"
      maxWidth={420}
    >
      <div>Your feedback has not been sent yet. Are you sure you want to close this form?</div>
      <div className="row row--gap-3">
        <span className="spacer" />
        <Button
          label="Keep editing"
          variant="outlined"
          themeColor="secondary"
          onClick={() => setConfirmClose(false)}
        />
        <Button label="Close" onClick={onClose} />
      </div>
    </Modal>
  );

  if (isMobile) {
    return (
      <>
        <Drawer
          open
          onClose={requestClose}
          title="Send feedback"
          header={
            <DrawerHeader
              title="Send feedback"
              onClose={requestClose}
              action={<DrawerAction onClick={submit} disabled={!canSubmit} />}
            />
          }
        >
          {form}
        </Drawer>
        {confirm}
      </>
    );
  }

  return (
    <>
      <Modal open onClose={requestClose} maxWidth={760} showClose>
        {sent ? (
          <div className="stack stack--gap-5" style={{ alignItems: "center", padding: "24px 0" }}>
            <Illustration name="feedback-success" alt="Feedback sent" width={120} height={120} />
            <div className="stack stack--gap-1" style={{ alignItems: "center" }}>
              <div
                className="text-success"
                style={{ fontSize: "var(--animo-fontSize-2xl)", fontWeight: 700 }}
              >
                Feedback sent
              </div>
              <div className="text-secondary">Thanks — your issue was created successfully.</div>
            </div>
          </div>
        ) : (
          <>
            <div className="row row--gap-3">
              <span className="icon-bubble" style={{ width: 48, height: 48, borderRadius: 14 }}>
                <Icon name="message-heart" size="md" />
              </span>
              <div className="stack stack--gap-1 grow">
                <div
                  className="text-strong"
                  style={{ fontSize: "var(--animo-fontSize-2xl)", fontWeight: 700 }}
                >
                  Send feedback
                </div>
                <div className="text-secondary text-small">
                  Tell us what happened, what you expected, or what would help.
                </div>
              </div>
            </div>
            {form}
          </>
        )}
        <div className="row row--gap-3">
          {!sent && (
            <Button
              label="Cancel"
              variant="outlined"
              themeColor="secondary"
              disabled={submitting}
              onClick={requestClose}
            />
          )}
          <span className="spacer" />
          {sent ? (
            <Button label="Done" onClick={onClose} />
          ) : (
            <Button
              label={submitting ? "Sending..." : "Send feedback"}
              disabled={!canSubmit}
              onClick={submit}
            />
          )}
        </div>
      </Modal>
      {confirm}
    </>
  );
}
