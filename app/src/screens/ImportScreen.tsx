import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type DragEvent, type ReactNode } from "react";

import {
  importCommit,
  importPreview,
  type CommitResponse,
  type PreviewResponse,
} from "../helpers/importApi";
import { useIsMobile } from "../lib/useIsMobile";
import { Button } from "../ui/Button";
import { Card, Spinner } from "../ui/controls";
import { Icon, type IconName } from "../ui/Icon";
import { Drawer, DrawerAction, DrawerHeader, Modal } from "../ui/overlays";
import { Select } from "../ui/Select";

// CSV/XLSX import. The page shows the file + format card; previewing opens
// an overlay (modal on desktop, drawer on mobile) that walks the remaining
// steps: loading → preview → summary.

const FORMATS = [
  { value: "auto", label: "Auto-detect" },
  { value: "animo", label: "Animo" },
  { value: "toggl", label: "Toggl" },
  { value: "clockify", label: "Clockify" },
  { value: "harvest", label: "Harvest" },
];

type Step = "select" | "loading" | "preview" | "summary";

export function ImportScreen() {
  const isMobile = useIsMobile();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState("auto");
  const [step, setStep] = useState<Step>("select");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [summary, setSummary] = useState<CommitResponse | null>(null);
  // Page-level error (preview failed / wrong file) vs in-overlay commit error.
  const [error, setError] = useState<string | null>(null);
  const [commitError, setCommitError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const isXlsx = !!file && file.name.toLowerCase().endsWith(".xlsx");

  // Accept any file at the picker / drop level and validate by extension:
  // during a drag browsers (and Tauri's WKWebView) only expose MIME types,
  // not names. The backend re-validates the format anyway.
  const pick = (f: File | null | undefined) => {
    if (!f) return;
    const lower = f.name.toLowerCase();
    if (!lower.endsWith(".csv") && !lower.endsWith(".xlsx")) {
      setFile(null);
      setError("Please choose a .csv or .xlsx file.");
      return;
    }
    setFile(f);
    setError(null);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    pick(e.dataTransfer.files?.[0]);
  };

  const reset = () => {
    setStep("select");
    setPreview(null);
    setSummary(null);
    setCommitError(null);
  };

  const startPreview = () => {
    if (!file) {
      setError("No file selected");
      return;
    }
    setError(null);
    setCommitError(null);
    setStep("loading");
    importPreview(file, format)
      .then((data) => {
        setPreview(data);
        setStep("preview");
      })
      .catch((err: Error) => {
        setError(err.message);
        setStep("select");
      });
  };

  const commit = () => {
    if (!preview) return;
    setStep("loading");
    setCommitError(null);
    importCommit(preview.sessionId, isXlsx)
      .then((data) => {
        setSummary(data);
        setStep("summary");
        // New entries, clients, projects and tags — refresh everything.
        void qc.invalidateQueries();
      })
      .catch((err: Error) => {
        setCommitError(err.message);
        setStep("preview");
      });
  };

  const importAnother = () => {
    setFile(null);
    if (inputRef.current) inputRef.current.value = "";
    reset();
  };

  const title = step === "summary" ? "Import complete" : "Preview import";
  const body = (
    <ImportSteps
      step={step}
      preview={preview}
      summary={summary}
      fileName={file?.name || ""}
      commitError={commitError}
      onImportAnother={importAnother}
      mobile={isMobile}
    />
  );

  return (
    <div className="page" style={{ maxWidth: 900, margin: "0 auto" }}>
      <Card>
        <div className="stack stack--gap-4">
          <div>
            Import time entries from CSV or XLSX. Supports Animo exports plus Toggl, Clockify, and
            Harvest Detailed reports (per-entry timestamps required — Summary reports are not
            supported). Duplicate rows (same date, time range, and description) are skipped
            automatically; new clients, projects, and tags are created as needed.
          </div>

          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx"
            hidden
            onChange={(e) => pick(e.target.files?.[0])}
          />

          {isMobile ? (
            <div className="stack stack--gap-2">
              <Button
                block
                label="Choose file"
                icon="file-text"
                variant="outlined"
                onClick={() => inputRef.current?.click()}
              />
              {file && <div className="text-small text-strong">{file.name}</div>}
            </div>
          ) : (
            <div
              className="dropzone"
              data-testid="import-dropzone"
              data-dragging={dragging}
              role="button"
              tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragOver={(e) => e.preventDefault()}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
            >
              <span className="icon-bubble" style={{ width: 56, height: 56 }}>
                <Icon name="file-text" size="lg" />
              </span>
              <div className="stack stack--gap-1" style={{ alignItems: "center" }}>
                <div
                  className="text-bold"
                  style={{ fontSize: "1.125rem", color: "var(--animo-textColor-primary)" }}
                >
                  {file ? file.name : "Drag and drop your file here"}
                </div>
                <div className="text-secondary text-small">
                  {file ? "Drop another file, or choose to replace" : "or click to browse"}
                </div>
              </div>
              <Button label="Choose file" variant="outlined" />
            </div>
          )}

          {isMobile ? (
            <Select label="Format" options={FORMATS} value={format} onChange={setFormat} />
          ) : (
            <div className="row row--gap-3">
              <span className="text-strong">Format</span>
              <Select style={{ width: 360 }} options={FORMATS} value={format} onChange={setFormat} />
            </div>
          )}

          <div className="card card--tint" style={{ padding: 12 }}>
            <div className="row row--gap-3 row--start">
              <Icon name="info" color="var(--animo-color-primary-600)" />
              <div className="stack stack--gap-0_5">
                <span
                  className="text-bold text-small"
                  style={{ color: "var(--animo-color-primary-700)" }}
                >
                  Supported formats
                </span>
                <span className="text-secondary text-small">CSV (.csv) and Excel (.xlsx)</span>
              </div>
            </div>
          </div>

          {error && <div className="text-danger text-small">{error}</div>}

          <div>
            <Button
              label="Preview import"
              icon="eye"
              size="lg"
              block={isMobile}
              disabled={!file}
              onClick={startPreview}
            />
          </div>
        </div>
      </Card>

      {isMobile ? (
        <Drawer
          open={step !== "select"}
          onClose={reset}
          title={title}
          header={
            <DrawerHeader
              title={title}
              onClose={reset}
              action={
                step === "preview" && preview ? (
                  <DrawerAction onClick={commit} disabled={preview.validRows <= 0} />
                ) : undefined
              }
            />
          }
        >
          {body}
        </Drawer>
      ) : (
        <Modal open={step !== "select"} onClose={reset} title={title} maxWidth={720} showClose>
          {body}
          {step === "preview" && preview && (
            <div
              className="row row--gap-2"
              style={{ paddingTop: 12, borderTop: "1px solid var(--animo-color-surface-200)" }}
            >
              <span className="spacer" />
              <Button label="Cancel" variant="ghost" onClick={reset} />
              <Button
                label={`Import ${preview.validRows} entries`}
                disabled={preview.validRows <= 0}
                onClick={commit}
              />
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: IconName;
  label: string;
  value: ReactNode;
  tone?: "neutral" | "primary" | "warn" | "danger";
}) {
  const bubble =
    tone === "primary"
      ? "icon-bubble"
      : tone === "warn"
        ? "icon-bubble icon-bubble--warn"
        : "icon-bubble icon-bubble--neutral";
  const valueColor =
    tone === "primary"
      ? "var(--animo-color-primary-600)"
      : tone === "danger"
        ? "var(--animo-color-danger-600)"
        : tone === "warn"
          ? "var(--animo-color-warn-700)"
          : "var(--animo-color-surface-900)";
  return (
    <div
      className={tone === "primary" ? "card card--tint" : tone === "warn" ? "card card--warn" : "card"}
      style={{ padding: 12, flex: "1 1 150px" }}
    >
      <div className="row row--gap-3">
        <span className={bubble} style={{ width: 36, height: 36 }}>
          <Icon name={icon} color={tone === "danger" ? "var(--animo-color-danger-500)" : undefined} />
        </span>
        <div className="stack stack--gap-0_5">
          <span className="text-secondary text-xs" style={{ fontWeight: 600 }}>
            {label}
          </span>
          <span className="text-bold" style={{ fontSize: "1.25rem", color: valueColor }}>
            {value}
          </span>
        </div>
      </div>
    </div>
  );
}

function ImportSteps({
  step,
  preview,
  summary,
  fileName,
  commitError,
  onImportAnother,
  mobile,
}: {
  step: Step;
  preview: PreviewResponse | null;
  summary: CommitResponse | null;
  fileName: string;
  commitError: string | null;
  onImportAnother: () => void;
  mobile: boolean;
}) {
  if (step === "loading") {
    return (
      <div className="stack stack--gap-3 stack--center" style={{ padding: "24px 0" }}>
        <Spinner />
        <div>Working…</div>
      </div>
    );
  }

  if (step === "summary" && summary) {
    return (
      <div className="stack stack--gap-2">
        <div className="row row--gap-2">
          <Icon name="check" color="var(--animo-color-primary-600)" />
          <span className="text-strong">Import complete</span>
        </div>
        <div>
          {summary.entriesCreated} {summary.entriesCreated === 1 ? "entry" : "entries"} created.
        </div>
        <div className="text-secondary text-small">
          Created {summary.clientsCreated} client(s), {summary.projectsCreated} project(s),{" "}
          {summary.tagsCreated} tag(s). Skipped {summary.duplicatesSkipped} duplicate(s).
        </div>
        <div>
          <Button label="Import another file" onClick={onImportAnother} />
        </div>
      </div>
    );
  }

  if (step !== "preview" || !preview) return null;
  const errors = preview.errorRows.length;
  const nothing = preview.validRows === 0;

  return (
    <div className="stack stack--gap-4">
      <div className="row row--gap-3">
        <span
          className="icon-bubble"
          style={{ width: 44, height: 44, background: "var(--animo-color-primary-50)" }}
        >
          <Icon name="file-text" />
        </span>
        <div className="stack stack--gap-0_5 grow">
          <div className="row row--gap-2">
            <span className="text-secondary text-small">Detected format:</span>
            <span className="text-bold text-small text-primary">{preview.format}</span>
          </div>
          <div className={mobile ? "stack" : "row row--gap-2"}>
            <span className="text-secondary text-small">File name:</span>
            <span className="text-bold text-small text-primary" style={{ wordBreak: "break-all" }}>
              {fileName}
            </span>
          </div>
        </div>
      </div>

      <div className="row row--gap-3 row--wrap row--stretch">
        <Kpi icon="database" label="Total rows" value={preview.totalRows} />
        <Kpi
          icon={nothing ? "warning" : "checkmark"}
          label={nothing ? "Nothing to import" : "Will import"}
          value={preview.validRows}
          tone={nothing ? "warn" : "primary"}
        />
        <Kpi icon="copy" label="Duplicates" value={preview.duplicateWarnings} />
        <Kpi icon="warning" label="Errors" value={errors} tone={errors > 0 ? "danger" : "neutral"} />
      </div>

      {nothing ? (
        <div className="card card--warn" style={{ padding: 12 }}>
          <div className="row row--gap-3 row--start">
            <Icon name="warning" color="var(--animo-color-warn-600)" />
            <div className="stack stack--gap-1 grow">
              <span className="text-bold" style={{ color: "var(--animo-color-warn-700)" }}>
                Nothing will be imported
              </span>
              <span className="text-secondary text-small">
                {errors === 0
                  ? `All ${preview.totalRows} rows are duplicates of entries you already have, so there is nothing new to add.`
                  : preview.duplicateWarnings === 0
                    ? `All ${preview.totalRows} rows have errors, so none can be imported. See the problems listed below.`
                    : "Every row is either a duplicate or contains an error, so none can be imported."}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="card card--tint" style={{ padding: 12 }}>
          <div className="row row--gap-3 row--start">
            <Icon name="info" color="var(--animo-color-primary-600)" />
            <div className="stack stack--gap-1 grow">
              <span className="text-bold" style={{ color: "var(--animo-color-primary-700)" }}>
                About this import
              </span>
              <span className="text-secondary text-small">
                Duplicate rows (same date, time range, and description) will be skipped
                automatically. New clients, projects, and tags will be created as needed.
              </span>
            </div>
          </div>
        </div>
      )}

      {errors > 0 && (
        <div className="stack stack--gap-2">
          <span className="text-strong">Rows with problems:</span>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 80 }}>Row</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {preview.errorRows.map((r) => (
                <tr key={r.row}>
                  <td>{r.row}</td>
                  <td>{r.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {commitError && <div className="text-danger text-small">{commitError}</div>}
    </div>
  );
}
