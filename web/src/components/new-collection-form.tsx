"use client";

import {
  type InputHTMLAttributes,
  type ReactNode,
  useRef,
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
type DirectoryInputProps = InputHTMLAttributes<HTMLInputElement> & {
  directory: string;
  webkitdirectory: string;
};

const directoryInputProps: DirectoryInputProps = {
  directory: "",
  webkitdirectory: "",
};

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
  const folderFileInputRef = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState("");
  const [folderPath, setFolderPath] = useState("");
  const [folderUploadManifest, setFolderUploadManifest] = useState("");
  const [folderUploadFileCount, setFolderUploadFileCount] = useState(0);
  const [providerSource, setProviderSource] = useState<ProviderSourceValue | "">("");
  const [termsText, setTermsText] = useState("");
  const duplicateName = isDuplicateCollectionName(displayName, existingCollections);
  const serverDuplicateName = serverError === "duplicate_name" && displayName.trim() === "";
  const nameError = duplicateName || serverDuplicateName
    ? "A Collection with this name already exists."
    : "";
  const canStart = canStartNewCollectionSearch(
    displayName,
    termsText,
    existingCollections,
  ) && providerSource !== "";
  const hasFolderUpload = folderUploadFileCount > 0;
  const canImportFolder =
    displayName.trim() !== "" &&
    (folderPath.trim() !== "" || hasFolderUpload) &&
    !isDuplicateCollectionName(displayName, existingCollections);
  const activeAction =
    trajectory === "local-folder" ? localFolderAction : onlineArchiveAction;

  async function chooseLocalFolder() {
    folderFileInputRef.current?.click();
  }

  function resetSelectedFolderUpload() {
    setFolderUploadManifest("");
    setFolderUploadFileCount(0);
    if (folderFileInputRef.current !== null) {
      folderFileInputRef.current.value = "";
    }
  }

  function updateSelectedFolderUpload(files: FileList | null) {
    if (files === null || files.length === 0) {
      return;
    }

    const selectedFiles = Array.from(files);
    const manifestFiles = selectedFiles.map((file) => ({
      name: file.name,
      relativePath: file.webkitRelativePath || file.name,
    }));
    const firstRelativePath = manifestFiles[0]?.relativePath ?? "";
    const rootFolderName = firstRelativePath.includes("/")
      ? firstRelativePath.split("/")[0]
      : "";
    const fileCount = selectedFiles.length;

    setFolderUploadManifest(JSON.stringify({ files: manifestFiles }));
    setFolderUploadFileCount(fileCount);
    setFolderPath(
      rootFolderName !== ""
        ? `${rootFolderName} (${fileCount} files selected)`
        : `${fileCount} files selected`,
    );
  }

  return (
    <form
      action={activeAction}
      autoComplete="off"
      className="mx-auto flex w-full max-w-4xl flex-col gap-4"
    >
      <input name="display_name" type="hidden" value={displayName} />
      <input
        name="folder_upload_manifest"
        type="hidden"
        value={folderUploadManifest}
      />
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
            placeholder="Snake studies"
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
              <input
                {...directoryInputProps}
                ref={folderFileInputRef}
                aria-hidden="true"
                className="sr-only"
                multiple
                name="folder_files"
                onChange={(event) =>
                  updateSelectedFolderUpload(event.currentTarget.files)
                }
                tabIndex={-1}
                type="file"
              />
              <Button
                onClick={chooseLocalFolder}
                size="lg"
                type="button"
                variant="outline"
              >
                <FolderOpen data-icon="inline-start" />
                Choose folder
              </Button>
              <Field>
                <FieldLabel className="sr-only" htmlFor="folder_path">
                  Folder path
                </FieldLabel>
                <Input
                  autoComplete="off"
                  id="folder_path"
                  name="folder_path"
                  onChange={(event) => {
                    setFolderPath(event.currentTarget.value);
                    resetSelectedFolderUpload();
                  }}
                  required
                  spellCheck={false}
                  value={folderPath}
                />
              </Field>
              <SubmitTrajectoryButton
                disabled={!canImportFolder}
                idleLabel="Import"
                pendingLabel="Importing..."
              />
            </div>
          </StepCard>
        </>
      ) : null}
    </form>
  );
}
