import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AGENT_ADAPTER_TYPES,
  getAdapterEnvironmentSupport,
  type Environment,
  type EnvironmentProbeResult,
  type JsonSchema,
} from "@paperclipai/shared";
import { Check, Settings } from "lucide-react";
import { environmentsApi } from "@/api/environments";
import { instanceSettingsApi } from "@/api/instanceSettings";
import { secretsApi } from "@/api/secrets";
import { Button } from "@/components/ui/button";
import { JsonSchemaForm, getDefaultValues, validateJsonSchemaForm } from "@/components/JsonSchemaForm";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/ToastContext";
import { queryKeys } from "@/lib/queryKeys";
import {
  Field,
  ToggleField,
  adapterLabels,
} from "../components/agent-config-primitives";

type EnvironmentFormState = {
  name: string;
  description: string;
  driver: "local" | "ssh" | "sandbox";
  sshHost: string;
  sshPort: string;
  sshUsername: string;
  sshRemoteWorkspacePath: string;
  sshPrivateKey: string;
  sshPrivateKeySecretId: string;
  sshKnownHosts: string;
  sshStrictHostKeyChecking: boolean;
  sandboxProvider: string;
  sandboxConfig: Record<string, unknown>;
};

const ENVIRONMENT_SUPPORT_ROWS = AGENT_ADAPTER_TYPES.map((adapterType) => ({
  adapterType,
  support: getAdapterEnvironmentSupport(adapterType),
}));

function buildEnvironmentPayload(form: EnvironmentFormState) {
  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    driver: form.driver,
    config:
      form.driver === "ssh"
        ? {
            host: form.sshHost.trim(),
            port: Number.parseInt(form.sshPort || "22", 10) || 22,
            username: form.sshUsername.trim(),
            remoteWorkspacePath: form.sshRemoteWorkspacePath.trim(),
            privateKey: form.sshPrivateKey.trim() || null,
            privateKeySecretRef:
              form.sshPrivateKey.trim().length > 0 || !form.sshPrivateKeySecretId
                ? null
                : { type: "secret_ref" as const, secretId: form.sshPrivateKeySecretId, version: "latest" as const },
            knownHosts: form.sshKnownHosts.trim() || null,
            strictHostKeyChecking: form.sshStrictHostKeyChecking,
          }
        : form.driver === "sandbox"
          ? {
              provider: form.sandboxProvider.trim(),
              ...form.sandboxConfig,
            }
          : {},
  } as const;
}

function createEmptyEnvironmentForm(): EnvironmentFormState {
  return {
    name: "",
    description: "",
    driver: "ssh",
    sshHost: "",
    sshPort: "22",
    sshUsername: "",
    sshRemoteWorkspacePath: "",
    sshPrivateKey: "",
    sshPrivateKeySecretId: "",
    sshKnownHosts: "",
    sshStrictHostKeyChecking: true,
    sandboxProvider: "",
    sandboxConfig: {},
  };
}

function readSshConfig(environment: Environment) {
  const config = environment.config ?? {};
  return {
    host: typeof config.host === "string" ? config.host : "",
    port:
      typeof config.port === "number"
        ? String(config.port)
        : typeof config.port === "string"
          ? config.port
          : "22",
    username: typeof config.username === "string" ? config.username : "",
    remoteWorkspacePath:
      typeof config.remoteWorkspacePath === "string" ? config.remoteWorkspacePath : "",
    privateKey: "",
    privateKeySecretId:
      config.privateKeySecretRef &&
      typeof config.privateKeySecretRef === "object" &&
      !Array.isArray(config.privateKeySecretRef) &&
      typeof (config.privateKeySecretRef as { secretId?: unknown }).secretId === "string"
        ? String((config.privateKeySecretRef as { secretId: string }).secretId)
        : "",
    knownHosts: typeof config.knownHosts === "string" ? config.knownHosts : "",
    strictHostKeyChecking:
      typeof config.strictHostKeyChecking === "boolean"
        ? config.strictHostKeyChecking
        : true,
  };
}

function readSandboxConfig(environment: Environment) {
  const config = environment.config ?? {};
  const { provider: rawProvider, ...providerConfig } = config;
  return {
    provider: typeof rawProvider === "string" && rawProvider.trim().length > 0
      ? rawProvider
      : "fake",
    config: providerConfig,
  };
}

function normalizeJsonSchema(schema: unknown): JsonSchema | null {
  return schema && typeof schema === "object" && !Array.isArray(schema)
    ? schema as JsonSchema
    : null;
}

function summarizeSandboxConfig(config: Record<string, unknown>): string | null {
  for (const key of ["template", "image", "region", "workspacePath"]) {
    const value = config[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return null;
}

function SupportMark({ supported }: { supported: boolean }) {
  const { t } = useTranslation("companyEnvironmentsPage");
  return supported ? (
    <span className="inline-flex items-center gap-1 text-green-700 dark:text-green-400">
      <Check className="h-3 w-3" />
      {t("yes", "Yes")}
    </span>
  ) : (
    <span className="text-muted-foreground">{t("no", "No")}</span>
  );
}

export function CompanyEnvironments() {
  const { t } = useTranslation("companyEnvironmentsPage");
  const { selectedCompany, selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [editingEnvironmentId, setEditingEnvironmentId] = useState<string | null>(null);
  const [environmentForm, setEnvironmentForm] = useState<EnvironmentFormState>(createEmptyEnvironmentForm);
  const [probeResults, setProbeResults] = useState<Record<string, EnvironmentProbeResult | null>>({});

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? t("companyFallback", "Company"), href: "/dashboard" },
      { label: t("settingsBreadcrumb", "Settings"), href: "/company/settings" },
      { label: t("environmentsBreadcrumb", "Environments") },
    ]);
  }, [selectedCompany?.name, setBreadcrumbs, t]);

  const { data: experimentalSettings } = useQuery({
    queryKey: queryKeys.instance.experimentalSettings,
    queryFn: () => instanceSettingsApi.getExperimental(),
    retry: false,
  });
  const environmentsEnabled = experimentalSettings?.enableEnvironments === true;

  const { data: environments } = useQuery({
    queryKey: selectedCompanyId ? queryKeys.environments.list(selectedCompanyId) : ["environments", "none"],
    queryFn: () => environmentsApi.list(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId) && environmentsEnabled,
  });
  const { data: environmentCapabilities } = useQuery({
    queryKey: selectedCompanyId ? ["environment-capabilities", selectedCompanyId] : ["environment-capabilities", "none"],
    queryFn: () => environmentsApi.capabilities(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId) && environmentsEnabled,
  });

  const { data: secrets } = useQuery({
    queryKey: selectedCompanyId ? ["company-secrets", selectedCompanyId] : ["company-secrets", "none"],
    queryFn: () => secretsApi.list(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId),
  });

  const environmentMutation = useMutation({
    mutationFn: async (form: EnvironmentFormState) => {
      const body = buildEnvironmentPayload(form);

      if (editingEnvironmentId) {
        return await environmentsApi.update(editingEnvironmentId, body);
      }

      return await environmentsApi.create(selectedCompanyId!, body);
    },
    onSuccess: async (environment) => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.environments.list(selectedCompanyId!),
      });
      setEditingEnvironmentId(null);
      setEnvironmentForm(createEmptyEnvironmentForm());
      pushToast({
        title: editingEnvironmentId ? t("toastEnvUpdated", "Environment updated") : t("toastEnvCreated", "Environment created"),
        body: t("toastEnvReady", "{{name}} is ready.", { name: environment.name }),
        tone: "success",
      });
    },
    onError: (error) => {
      pushToast({
        title: t("toastEnvSaveFailed", "Failed to save environment"),
        body: error instanceof Error ? error.message : t("envSaveFailed", "Environment save failed."),
        tone: "error",
      });
    },
  });

  const environmentProbeMutation = useMutation({
    mutationFn: async (environmentId: string) => await environmentsApi.probe(environmentId),
    onSuccess: (probe, environmentId) => {
      setProbeResults((current) => ({
        ...current,
        [environmentId]: probe,
      }));
      pushToast({
        title: probe.ok ? t("toastProbePassed", "Environment probe passed") : t("toastProbeFailed", "Environment probe failed"),
        body: probe.summary,
        tone: probe.ok ? "success" : "error",
      });
    },
    onError: (error, environmentId) => {
      const failedEnvironment = (environments ?? []).find((environment) => environment.id === environmentId);
      setProbeResults((current) => ({
        ...current,
        [environmentId]: {
          ok: false,
          driver: failedEnvironment?.driver ?? "local",
          summary: error instanceof Error ? error.message : t("probeFailed", "Environment probe failed."),
          details: null,
        },
      }));
      pushToast({
        title: t("toastProbeFailed", "Environment probe failed"),
        body: error instanceof Error ? error.message : t("probeFailed", "Environment probe failed."),
        tone: "error",
      });
    },
  });

  const draftEnvironmentProbeMutation = useMutation({
    mutationFn: async (form: EnvironmentFormState) => {
      const body = buildEnvironmentPayload(form);
      return await environmentsApi.probeConfig(selectedCompanyId!, body);
    },
    onSuccess: (probe) => {
      pushToast({
        title: probe.ok ? t("toastDraftProbePassed", "Draft probe passed") : t("toastDraftProbeFailed", "Draft probe failed"),
        body: probe.summary,
        tone: probe.ok ? "success" : "error",
      });
    },
    onError: (error) => {
      pushToast({
        title: t("toastDraftProbeFailed", "Draft probe failed"),
        body: error instanceof Error ? error.message : t("probeFailed", "Environment probe failed."),
        tone: "error",
      });
    },
  });

  useEffect(() => {
    setEditingEnvironmentId(null);
    setEnvironmentForm(createEmptyEnvironmentForm());
    setProbeResults({});
  }, [selectedCompanyId]);

  function handleEditEnvironment(environment: Environment) {
    setEditingEnvironmentId(environment.id);
    if (environment.driver === "ssh") {
      const ssh = readSshConfig(environment);
      setEnvironmentForm({
        ...createEmptyEnvironmentForm(),
        name: environment.name,
        description: environment.description ?? "",
        driver: "ssh",
        sshHost: ssh.host,
        sshPort: ssh.port,
        sshUsername: ssh.username,
        sshRemoteWorkspacePath: ssh.remoteWorkspacePath,
        sshPrivateKey: ssh.privateKey,
        sshPrivateKeySecretId: ssh.privateKeySecretId,
        sshKnownHosts: ssh.knownHosts,
        sshStrictHostKeyChecking: ssh.strictHostKeyChecking,
      });
      return;
    }

    if (environment.driver === "sandbox") {
      const sandbox = readSandboxConfig(environment);
      setEnvironmentForm({
        ...createEmptyEnvironmentForm(),
        name: environment.name,
        description: environment.description ?? "",
        driver: "sandbox",
        sandboxProvider: sandbox.provider,
        sandboxConfig: sandbox.config,
      });
      return;
    }

    setEnvironmentForm({
      ...createEmptyEnvironmentForm(),
      name: environment.name,
      description: environment.description ?? "",
      driver: "local",
    });
  }

  function handleCancelEnvironmentEdit() {
    setEditingEnvironmentId(null);
    setEnvironmentForm(createEmptyEnvironmentForm());
  }

  const discoveredPluginSandboxProviders = Object.entries(environmentCapabilities?.sandboxProviders ?? {})
    .filter(([provider, capability]) => provider !== "fake" && capability.supportsRunExecution)
    .map(([provider, capability]) => ({
      provider,
      displayName: capability.displayName || provider,
      description: capability.description,
      configSchema: normalizeJsonSchema(capability.configSchema),
    }))
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
  const sandboxCreationEnabled = discoveredPluginSandboxProviders.length > 0;
  const sandboxSupportVisible = sandboxCreationEnabled;
  const pluginSandboxProviders =
    environmentForm.sandboxProvider.trim().length > 0 &&
    environmentForm.sandboxProvider !== "fake" &&
    !discoveredPluginSandboxProviders.some((provider) => provider.provider === environmentForm.sandboxProvider)
      ? [
          ...discoveredPluginSandboxProviders,
          { provider: environmentForm.sandboxProvider, displayName: environmentForm.sandboxProvider, description: undefined, configSchema: null },
        ]
      : discoveredPluginSandboxProviders;

  const selectedSandboxProvider = pluginSandboxProviders.find(
    (provider) => provider.provider === environmentForm.sandboxProvider,
  ) ?? null;
  const selectedSandboxSchema = selectedSandboxProvider?.configSchema ?? null;
  const sandboxConfigErrors =
    environmentForm.driver === "sandbox" && selectedSandboxSchema
      ? validateJsonSchemaForm(selectedSandboxSchema as any, environmentForm.sandboxConfig)
      : {};

  useEffect(() => {
    if (environmentForm.driver !== "sandbox") return;
    if (environmentForm.sandboxProvider.trim().length > 0 && environmentForm.sandboxProvider !== "fake") return;
    const firstProvider = discoveredPluginSandboxProviders[0]?.provider;
    if (!firstProvider) return;
    const firstSchema = discoveredPluginSandboxProviders[0]?.configSchema;
    setEnvironmentForm((current) => (
      current.driver !== "sandbox" || (current.sandboxProvider.trim().length > 0 && current.sandboxProvider !== "fake")
        ? current
        : {
            ...current,
            sandboxProvider: firstProvider,
            sandboxConfig: firstSchema ? getDefaultValues(firstSchema as any) : {},
          }
    ));
  }, [discoveredPluginSandboxProviders, environmentForm.driver, environmentForm.sandboxProvider]);

  const environmentFormValid =
    environmentForm.name.trim().length > 0 &&
    (environmentForm.driver !== "ssh" ||
      (
        environmentForm.sshHost.trim().length > 0 &&
        environmentForm.sshUsername.trim().length > 0 &&
        environmentForm.sshRemoteWorkspacePath.trim().length > 0
      )) &&
    (environmentForm.driver !== "sandbox" ||
      environmentForm.sandboxProvider.trim().length > 0 &&
      environmentForm.sandboxProvider !== "fake" &&
      Object.keys(sandboxConfigErrors).length === 0);

  if (!selectedCompanyId) {
    return <div className="text-sm text-muted-foreground">{t("selectCompany", "Select a company to manage environments.")}</div>;
  }

  if (!environmentsEnabled) {
    return (
      <div className="max-w-3xl space-y-4">
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">{t("title", "Company Environments")}</h1>
        </div>
        <div className="rounded-md border border-border px-4 py-4 text-sm text-muted-foreground">
          {t("enableEnvironmentsNotice", "Enable Environments in instance experimental settings to manage company execution targets.")}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-6" data-testid="company-settings-environments-section">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">{t("title", "Company Environments")}</h1>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {t("subtitle", "Define reusable execution targets for projects, issue workspaces, and remote-capable adapters.")}
        </p>
      </div>

      <div className="space-y-4 rounded-md border border-border px-4 py-4">
        <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          {t("supportMatrixNotice", "Environment choices use the same adapter support matrix as agent defaults. SSH is always available for remote-managed adapters, and sandbox environments appear only when a run-capable sandbox provider plugin is installed.")}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-left text-xs">
            <caption className="sr-only">{t("supportCaption", "Environment support by adapter")}</caption>
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="py-2 pr-3 font-medium">{t("colAdapter", "Adapter")}</th>
                <th className="px-3 py-2 font-medium">{t("colLocal", "Local")}</th>
                <th className="px-3 py-2 font-medium">{t("colSsh", "SSH")}</th>
                {sandboxSupportVisible ? (
                  <th className="px-3 py-2 font-medium">{t("colSandbox", "Sandbox")}</th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {(environmentCapabilities?.adapters.map((support) => ({
                adapterType: support.adapterType,
                support,
              })) ?? ENVIRONMENT_SUPPORT_ROWS).map(({ adapterType, support }) => (
                <tr key={adapterType}>
                  <td className="py-2 pr-3 font-medium">
                    {adapterLabels[adapterType] ?? adapterType}
                  </td>
                  <td className="px-3 py-2">
                    <SupportMark supported={support.drivers.local === "supported"} />
                  </td>
                  <td className="px-3 py-2">
                    <SupportMark supported={support.drivers.ssh === "supported"} />
                  </td>
                  {sandboxSupportVisible ? (
                    <td className="px-3 py-2">
                      <SupportMark
                        supported={discoveredPluginSandboxProviders.some((provider) =>
                          support.sandboxProviders[provider.provider] === "supported")}
                      />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-3">
          {(environments ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground">{t("noEnvironments", "No environments saved for this company yet.")}</div>
          ) : (
            (environments ?? []).map((environment) => {
              const probe = probeResults[environment.id] ?? null;
              const isEditing = editingEnvironmentId === environment.id;
              return (
                <div
                  key={environment.id}
                  className="rounded-md border border-border/70 px-3 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-sm font-medium">
                        {environment.name} <span className="text-muted-foreground">· {environment.driver}</span>
                      </div>
                      {environment.description ? (
                        <div className="text-xs text-muted-foreground">{environment.description}</div>
                      ) : null}
                      {environment.driver === "ssh" ? (
                        <div className="text-xs text-muted-foreground">
                          {typeof environment.config.host === "string" ? environment.config.host : t("sshHostFallback", "SSH host")} ·{" "}
                          {typeof environment.config.username === "string" ? environment.config.username : t("userFallback", "user")}
                        </div>
                      ) : environment.driver === "sandbox" ? (
                        <div className="text-xs text-muted-foreground">
                          {(() => {
                            const provider =
                              typeof environment.config.provider === "string" ? environment.config.provider : "sandbox";
                            const displayName =
                              environmentCapabilities?.sandboxProviders?.[provider]?.displayName ?? provider;
                            const summary = summarizeSandboxConfig(environment.config as Record<string, unknown>);
                            return `${t("sandboxProviderLabel", "{{name}} sandbox provider", { name: displayName })}${summary ? ` · ${summary}` : ""}`;
                          })()}
                        </div>
                      ) : (
                        <div className="text-xs text-muted-foreground">{t("runsOnHost", "Runs on this Paperclip host.")}</div>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {environment.driver !== "local" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => environmentProbeMutation.mutate(environment.id)}
                          disabled={environmentProbeMutation.isPending}
                        >
                          {environmentProbeMutation.isPending
                            ? t("testing", "Testing...")
                            : environment.driver === "ssh"
                              ? t("testConnection", "Test connection")
                              : t("testProvider", "Test provider")}
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleEditEnvironment(environment)}
                      >
                        {isEditing ? t("editing", "Editing") : t("edit", "Edit")}
                      </Button>
                    </div>
                  </div>
                  {probe ? (
                    <div
                      className={
                        probe.ok
                          ? "mt-3 rounded border border-green-500/30 bg-green-500/5 px-2.5 py-2 text-xs text-green-700"
                          : "mt-3 rounded border border-destructive/30 bg-destructive/5 px-2.5 py-2 text-xs text-destructive"
                      }
                    >
                      <div className="font-medium">{probe.summary}</div>
                      {probe.details?.error && typeof probe.details.error === "string" ? (
                        <div className="mt-1 font-mono text-[11px]">{probe.details.error}</div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>

        <div className="border-t border-border/60 pt-4">
          <div className="mb-3 text-sm font-medium">
            {editingEnvironmentId ? t("editEnvironmentHeading", "Edit environment") : t("addEnvironmentHeading", "Add environment")}
          </div>
          <div className="space-y-3">
            <Field label={t("fieldName", "Name")} hint={t("fieldNameHint", "Operator-facing name for this execution target.")}>
              <input
                className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                type="text"
                value={environmentForm.name}
                onChange={(e) => setEnvironmentForm((current) => ({ ...current, name: e.target.value }))}
              />
            </Field>
            <Field label={t("fieldDescription", "Description")} hint={t("fieldDescriptionHint", "Optional note about what this machine is for.")}>
              <input
                className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                type="text"
                value={environmentForm.description}
                onChange={(e) => setEnvironmentForm((current) => ({ ...current, description: e.target.value }))}
              />
            </Field>
            <Field label={t("fieldDriver", "Driver")} hint={t("fieldDriverHint", "Local runs on this host. SSH stores a remote machine target. Sandbox stores plugin-backed provider config on the shared environment seam.")}>
              <select
                className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                value={environmentForm.driver}
                onChange={(e) =>
                  setEnvironmentForm((current) => ({
                    ...current,
                    sandboxProvider:
                      e.target.value === "sandbox"
                        ? current.sandboxProvider.trim() || discoveredPluginSandboxProviders[0]?.provider || ""
                        : current.sandboxProvider,
                    sandboxConfig:
                      e.target.value === "sandbox"
                        ? (
                            current.sandboxProvider.trim().length > 0 && current.driver === "sandbox"
                              ? current.sandboxConfig
                              : discoveredPluginSandboxProviders[0]?.configSchema
                                ? getDefaultValues(discoveredPluginSandboxProviders[0].configSchema as any)
                                : {}
                          )
                        : current.sandboxConfig,
                    driver:
                      e.target.value === "local"
                        ? "local"
                        : e.target.value === "sandbox"
                          ? "sandbox"
                          : "ssh",
                  }))}
              >
                <option value="ssh">{t("driverSsh", "SSH")}</option>
                {sandboxCreationEnabled || environmentForm.driver === "sandbox" ? (
                  <option value="sandbox">{t("driverSandbox", "Sandbox")}</option>
                ) : null}
                <option value="local">{t("driverLocal", "Local")}</option>
              </select>
            </Field>

            {environmentForm.driver === "ssh" ? (
              <div className="grid gap-3 md:grid-cols-2">
                <Field label={t("fieldHost", "Host")} hint={t("fieldHostHint", "DNS name or IP address for the remote machine.")}>
                  <input
                    className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                    type="text"
                    value={environmentForm.sshHost}
                    onChange={(e) => setEnvironmentForm((current) => ({ ...current, sshHost: e.target.value }))}
                  />
                </Field>
                <Field label={t("fieldPort", "Port")} hint={t("fieldPortHint", "Defaults to 22.")}>
                  <input
                    className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                    type="number"
                    min={1}
                    max={65535}
                    value={environmentForm.sshPort}
                    onChange={(e) => setEnvironmentForm((current) => ({ ...current, sshPort: e.target.value }))}
                  />
                </Field>
                <Field label={t("fieldUsername", "Username")} hint={t("fieldUsernameHint", "SSH login user.")}>
                  <input
                    className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                    type="text"
                    value={environmentForm.sshUsername}
                    onChange={(e) => setEnvironmentForm((current) => ({ ...current, sshUsername: e.target.value }))}
                  />
                </Field>
                <Field label={t("fieldRemoteWorkspacePath", "Remote workspace path")} hint={t("fieldRemoteWorkspacePathHint", "Absolute path that Paperclip will verify during SSH connection tests.")}>
                  <input
                    className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                    type="text"
                    placeholder="/Users/paperclip/workspace"
                    value={environmentForm.sshRemoteWorkspacePath}
                    onChange={(e) =>
                      setEnvironmentForm((current) => ({ ...current, sshRemoteWorkspacePath: e.target.value }))}
                  />
                </Field>
                <Field label={t("fieldPrivateKey", "Private key")} hint={t("fieldPrivateKeyHint", "Optional PEM private key. Leave blank to rely on the server's SSH agent or default keychain.")}>
                  <div className="space-y-2">
                    <select
                      className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                      value={environmentForm.sshPrivateKeySecretId}
                      onChange={(e) =>
                        setEnvironmentForm((current) => ({
                          ...current,
                          sshPrivateKeySecretId: e.target.value,
                          sshPrivateKey: e.target.value ? "" : current.sshPrivateKey,
                        }))}
                    >
                      <option value="">{t("noSavedSecret", "No saved secret")}</option>
                      {(secrets ?? []).map((secret) => (
                        <option key={secret.id} value={secret.id}>{secret.name}</option>
                      ))}
                    </select>
                    <textarea
                      className="h-32 w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-xs font-mono outline-none"
                      value={environmentForm.sshPrivateKey}
                      disabled={!!environmentForm.sshPrivateKeySecretId}
                      onChange={(e) => setEnvironmentForm((current) => ({ ...current, sshPrivateKey: e.target.value }))}
                    />
                  </div>
                </Field>
                <Field label={t("fieldKnownHosts", "Known hosts")} hint={t("fieldKnownHostsHint", "Optional known_hosts block used when strict host key checking is enabled.")}>
                  <textarea
                    className="h-32 w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-xs font-mono outline-none"
                    value={environmentForm.sshKnownHosts}
                    onChange={(e) => setEnvironmentForm((current) => ({ ...current, sshKnownHosts: e.target.value }))}
                  />
                </Field>
                <div className="md:col-span-2">
                  <ToggleField
                    label={t("fieldStrictHostKey", "Strict host key checking")}
                    hint={t("fieldStrictHostKeyHint", "Keep this on unless you deliberately want probe-time host key acceptance disabled.")}
                    checked={environmentForm.sshStrictHostKeyChecking}
                    onChange={(checked) =>
                      setEnvironmentForm((current) => ({ ...current, sshStrictHostKeyChecking: checked }))}
                  />
                </div>
              </div>
            ) : null}

            {environmentForm.driver === "sandbox" ? (
              <div className="grid gap-3 md:grid-cols-2">
                <Field label={t("fieldProvider", "Provider")} hint={t("fieldProviderHint", "Installed run-capable sandbox provider plugins appear here.")}>
                  <select
                    className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
                    value={environmentForm.sandboxProvider}
                    onChange={(e) => {
                      const nextProviderKey = e.target.value;
                      const nextProvider = pluginSandboxProviders.find((provider) => provider.provider === nextProviderKey) ?? null;
                      setEnvironmentForm((current) => ({
                        ...current,
                        sandboxProvider: nextProviderKey,
                        sandboxConfig:
                          current.sandboxProvider === nextProviderKey
                            ? current.sandboxConfig
                            : nextProvider?.configSchema
                              ? getDefaultValues(nextProvider.configSchema as any)
                              : {},
                      }));
                    }}
                  >
                    {pluginSandboxProviders.map((provider) => (
                      <option key={provider.provider} value={provider.provider}>
                        {provider.displayName}
                      </option>
                    ))}
                  </select>
                </Field>
                <div className="md:col-span-2 space-y-3">
                  {selectedSandboxProvider?.description ? (
                    <div className="text-xs text-muted-foreground">
                      {selectedSandboxProvider.description}
                    </div>
                  ) : null}
                  {selectedSandboxSchema ? (
                    <JsonSchemaForm
                      schema={selectedSandboxSchema as any}
                      values={environmentForm.sandboxConfig}
                      onChange={(values) =>
                        setEnvironmentForm((current) => ({ ...current, sandboxConfig: values }))}
                      errors={sandboxConfigErrors}
                    />
                  ) : (
                    <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                      {t("noConfigFields", "This provider does not declare additional configuration fields.")}
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                onClick={() => environmentMutation.mutate(environmentForm)}
                disabled={environmentMutation.isPending || !environmentFormValid}
              >
                {environmentMutation.isPending
                  ? editingEnvironmentId
                    ? t("saving", "Saving...")
                    : t("creating", "Creating...")
                  : editingEnvironmentId
                    ? t("saveEnvironment", "Save environment")
                    : t("createEnvironment", "Create environment")}
              </Button>
              {editingEnvironmentId ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleCancelEnvironmentEdit}
                  disabled={environmentMutation.isPending}
                >
                  {t("cancel", "Cancel")}
                </Button>
              ) : null}
              {environmentForm.driver !== "local" ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => draftEnvironmentProbeMutation.mutate(environmentForm)}
                  disabled={draftEnvironmentProbeMutation.isPending || !environmentFormValid}
                >
                  {draftEnvironmentProbeMutation.isPending ? t("testing", "Testing...") : t("testDraft", "Test draft")}
                </Button>
              ) : null}
              {environmentMutation.isError ? (
                <span className="text-xs text-destructive">
                  {environmentMutation.error instanceof Error
                    ? environmentMutation.error.message
                    : t("toastEnvSaveFailed", "Failed to save environment")}
                </span>
              ) : null}
              {draftEnvironmentProbeMutation.data ? (
                <span className={draftEnvironmentProbeMutation.data.ok ? "text-xs text-green-600" : "text-xs text-destructive"}>
                  {draftEnvironmentProbeMutation.data.summary}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
