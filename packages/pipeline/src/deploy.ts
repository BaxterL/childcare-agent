export type DeployProfile = "local" | "linux-2g" | "linux-4g";

export interface DeployPlan {
  profile: DeployProfile;
  /** Whether the small local embedding model should load. */
  embedEnabled: boolean;
  label: string;
}

/** 回答都走 DeepSeek。检索用本地向量模型，启动日志只说明这件事。 */
export function resolveDeployProfile(raw?: string): DeployProfile {
  const value = raw?.trim().toLowerCase();
  if (value === "linux-2g" || value === "2g") return "linux-2g";
  if (value === "linux-4g" || value === "4g") return "linux-4g";
  return "local";
}

export function deployPlan(profile: DeployProfile): DeployPlan {
  return {
    profile,
    embedEnabled: true,
    label: "回答使用 DeepSeek，检索使用 Qwen3-Embedding。",
  };
}
