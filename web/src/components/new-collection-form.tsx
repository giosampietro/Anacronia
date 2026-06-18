"use client";

import {
  type ReactNode,
  useState,
} from "react";
import { useFormStatus } from "react-dom";
import { Archive, FolderOpen, Play } from "lucide-react";

import { BatchTargetControl } from "@/components/batch-target-control";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  canStartNewCollectionSearch,
  isDuplicateCollectionName,
  type ExistingCollectionIdentity,
} from "@/lib/new-collection";
import { announceProviderSearchRefresh } from "@/lib/dashboard-refresh";

export type NewCollectionServerError = "duplicate_name";
type CreationTrajectory = "online-archive" | "local-folder";

type NewCollectionFormProps = {
  initialTrajectory?: CreationTrajectory | null;
  localFolderAction: (formData: FormData) => void | Promise<void>;
  onlineArchiveAction: (formData: FormData) => void | Promise<void>;
  existingCollections?: ExistingCollectionIdentity[];
  serverError?: NewCollectionServerError | null;
};

const providerSources = [
  { label: "Met", value: "met", disabled: false },
  { label: "V&A", value: "vam", disabled: false },
] as const;
type ProviderSourceValue = (typeof providerSources)[number]["value"];

function StepNumber({ children }: { children: ReactNode }) {
  return (
    <span className="flex size-7 items-center justify-center rounded-full border bg-muted text-sm font-medium">
      {children}
    </span>
  );
}

function StepCard({
  children,
  number,
  title,
}: {
  children: ReactNode;
  number: number;
  title: string;
}) {
  return (
    <Card className="gap-3" size="sm">
      <CardHeader className="flex flex-row items-center gap-3">
        <StepNumber>{number}</StepNumber>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">{children}</CardContent>
    </Card>
  );
}

function TrajectoryButton({
  active,
  children,
  icon,
  onClick,
  title,
}: {
  active: boolean;
  children: ReactNode;
  icon: ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      aria-pressed={active}
      className={[
        "grid min-h-28 gap-3 rounded-lg border bg-background p-4 text-left transition-colors",
        active ? "border-primary ring-2 ring-primary/20" : "hover:bg-muted/50",
      ].join(" ")}
      onClick={onClick}
      type="button"
    >
      <span className="flex items-center gap-2 text-sm font-medium">
        {icon}
        {title}
      </span>
      <span className="text-sm text-muted-foreground">{children}</span>
    </button>
  );
}

function ProviderSelect({
  onSelect,
  selectedProvider,
}: {
  onSelect: (provider: ProviderSourceValue | "") => void;
  selectedProvider: ProviderSourceValue | "";
}) {
  return (
    <NativeSelect
      aria-label="Provider"
      className="w-full"
      name="provider"
      onChange={(event) =>
        onSelect(event.currentTarget.value as ProviderSourceValue | "")
      }
      required
      value={selectedProvider}
    >
      <NativeSelectOption value="">Choose provider</NativeSelectOption>
      {providerSources.map((provider) => (
        <NativeSelectOption key={provider.value} value={provider.value}>
          {provider.label}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

function SubmitTrajectoryButton({
  disabled,
  idleLabel,
  pendingLabel,
}: {
  disabled: boolean;
  idleLabel: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      aria-busy={pending}
      disabled={disabled || pending}
      onClick={() => announceProviderSearchRefresh()}
      size="lg"
      type="submit"
    >
      {pending ? (
        <Spinner data-icon="inline-start" />
      ) : (
        <Play data-icon="inline-start" />
      )}
      {pending ? pendingLabel : idleLabel}
    </Button>
  );
}

function LocalFolderImportPendingNotice() {
  const { pending } = useFormStatus();

  if (!pending) {
    return null;
  }

  return (
    <div
      aria-live="polite"
      className="flex items-start gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
      role="status"
    >
      <Spinner className="mt-0.5 size-4" />
      <span className="grid gap-0.5">
        <span className="font-medium text-foreground">
          Local folder import running
        </span>
        <span>Keep Anacronia open while this import finishes.</span>
      </span>
    </div>
  );
}

function localFolderDisplayName(folderPath: string): string {
  const normalizedPath = folderPath.trim();
  const segments = normalizedPath.split(/[\\/]+/).filter((segment) => segment !== "");
  return segments.at(-1) ?? normalizedPath;
}

export function NewCollectionForm({
  initialTrajectory = null,
  localFolderAction,
  onlineArchiveAction,
  existingCollections = [],
  serverError = null,
}: NewCollectionFormProps) {
  const [trajectory, setTrajectory] = useState<CreationTrajectory | null>(
    initialTrajectory,
  );
  const [displayName, setDisplayName] = useState("");
  const [folderPath, setFolderPath] = useState("");
  const [folderPathDisplay, setFolderPathDisplay] = useState("");
  const [folderPickerError, setFolderPickerError] = useState("");
  const [providerSource, setProviderSource] = useState<ProviderSourceValue | "">("");
  const [termsText, setTermsText] = useState("");
  const duplicateName = isDuplicateCollectionName(displayName, existingCollections);
  const serverDuplicateName = serverError === "duplicate_name" && displayName.trim() === "";
  const hasLocalFolderSelection =
    trajectory === "local-folder" &&
    folderPath.trim() !== "";
  const missingLocalFolderName =
    displayName.trim() === "" && hasLocalFolderSelection;
  const nameError = duplicateName || serverDuplicateName
    ? "A Collection with this name already exists."
    : missingLocalFolderName
      ? "Collection name is required."
    : "";
  const canStart = canStartNewCollectionSearch(
    displayName,
    termsText,
    existingCollections,
  ) && providerSource !== "";
  const canImportFolder =
    displayName.trim() !== "" &&
    folderPath.trim() !== "" &&
    !isDuplicateCollectionName(displayName, existingCollections);
  const activeAction =
    trajectory === "local-folder" ? localFolderAction : onlineArchiveAction;

  async function chooseLocalFolder() {
    setFolderPickerError("");
    const response = await fetch("/api/local-folder-picker", { method: "POST" });
    if (response.status === 204) {
      return;
    }
    if (!response.ok) {
      setFolderPickerError("Folder picker could not open. Paste a folder path manually.");
      return;
    }

    const payload = (await response.json()) as { folder_path?: unknown };
    if (typeof payload.folder_path !== "string" || payload.folder_path.trim() === "") {
      return;
    }
    const selectedFolderPath = payload.folder_path.trim();
    setFolderPath(selectedFolderPath);
    setFolderPathDisplay(localFolderDisplayName(selectedFolderPath));
  }

  return (
    <form
      action={activeAction}
      autoComplete="off"
      className="mx-auto flex w-full max-w-4xl flex-col gap-4"
    >
      <input name="display_name" type="hidden" value={displayName} />
      <StepCard number={1} title="Name the Collection">
        <Field className="md:w-1/2" data-invalid={Boolean(nameError)}>
          <FieldLabel className="sr-only" htmlFor="collection_name_entry">
            Collection name
          </FieldLabel>
          <Input
            aria-describedby={nameError ? "collection_name_error" : undefined}
            aria-invalid={Boolean(nameError)}
            autoComplete="off"
            autoCorrect="off"
            id="collection_name_entry"
            name="collection_name_entry"
            onChange={(event) => setDisplayName(event.currentTarget.value)}
            placeholder="Collection name"
            required
            spellCheck={false}
            value={displayName}
          />
          <FieldError id="collection_name_error">{nameError}</FieldError>
        </Field>
      </StepCard>

      <StepCard number={2} title="Choose source">
        <div className="grid gap-3 md:grid-cols-2">
          <TrajectoryButton
            active={trajectory === "online-archive"}
            icon={<Archive className="size-4" />}
            onClick={() => setTrajectory("online-archive")}
            title="Online archive"
          >
            Choose a museum archive, then search by keywords
          </TrajectoryButton>
          <TrajectoryButton
            active={trajectory === "local-folder"}
            icon={<FolderOpen className="size-4" />}
            onClick={() => setTrajectory("local-folder")}
            title="Local folder"
          >
            Import a local image folder
          </TrajectoryButton>
        </div>
      </StepCard>

      {trajectory === "online-archive" ? (
        <>
          <StepCard number={3} title="Search and import online archive">
            <Field className="md:w-1/2">
              <FieldLabel className="sr-only" htmlFor="terms_text">
                Search terms
              </FieldLabel>
              <Textarea
                className="min-h-20 resize-y"
                id="terms_text"
                name="terms_text"
                onChange={(event) => setTermsText(event.currentTarget.value)}
                placeholder="Add search terms, separated by commas or new lines"
                required
                value={termsText}
              />
            </Field>

            <div className="grid gap-3 md:w-1/2">
              <Field className="gap-2">
                <ProviderSelect
                  onSelect={setProviderSource}
                  selectedProvider={providerSource}
                />
              </Field>
              <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
                <BatchTargetControl
                  idPrefix="new_collection"
                  showLabel={false}
                />
                <SubmitTrajectoryButton
                  disabled={!canStart}
                  idleLabel="Start search"
                  pendingLabel="Starting..."
                />
              </div>
            </div>
          </StepCard>
        </>
      ) : null}

      {trajectory === "local-folder" ? (
        <>
          <StepCard number={3} title="Import folder">
            <div className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-end">
              <Button
                onClick={chooseLocalFolder}
                size="lg"
                type="button"
                variant="outline"
              >
                <FolderOpen data-icon="inline-start" />
                Choose folder
              </Button>
              <input name="folder_path" type="hidden" value={folderPath} />
              <Field>
                <FieldLabel className="sr-only" htmlFor="folder_path_display">
                  Folder path
                </FieldLabel>
                <Input
                  autoComplete="off"
                  id="folder_path_display"
                  onChange={(event) => {
                    setFolderPickerError("");
                    setFolderPath(event.currentTarget.value);
                    setFolderPathDisplay(event.currentTarget.value);
                  }}
                  placeholder="/Users/giorgio/Desktop/reference-folder"
                  required
                  spellCheck={false}
                  value={folderPathDisplay}
                />
                <FieldError>{folderPickerError}</FieldError>
              </Field>
              <SubmitTrajectoryButton
                disabled={!canImportFolder}
                idleLabel="Import"
                pendingLabel="Importing..."
              />
            </div>
            <LocalFolderImportPendingNotice />
          </StepCard>
        </>
      ) : null}
    </form>
  );
}
