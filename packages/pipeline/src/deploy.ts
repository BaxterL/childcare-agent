export type DeployProfile = "local" | "linux-2g" | "linux-4g";

export interface DeployPlan {
  profile: DeployProfile;
  /** Whether a failed DeepSeek call may fall through to a local Ollama model. */
  ollamaFallback: boolean;
  /** Whether the small local embedding model should load. */
  embedEnabled: boolean;
  label: string;
}

/** `local` is this 5060 workstation. The Linux names are the two small server sizes. */
export function resolveDeployProfile(raw?: string): DeployProfile {
  const value = raw?.trim().toLowerCase();
  if (value === "linux-2g" || value === "2g") return "linux-2g";
  if (value === "linux-4g" || value === "4g") return "linux-4g";
  return "local";
}

export function deployPlan(profile: DeployProfile): DeployPlan {
  // Chatlab 的做法：小模型只做检索，回答交给联网对话模型。
  // qwen3:8b 是对话模型，不参与回答，也不代替检索向量模型。
  if (profile === "linux-2g") {
    return {
      profile,
      ollamaFallback: false,
      embedEnabled: true,
      label: "2核2G：DeepSeek 回答，bge-small 本地检索",
    };
  }
  if (profile === "linux-4g") {
    return {
      profile,
      ollamaFallback: false,
      embedEnabled: true,
      label: "2核4G：DeepSeek 回答，bge-small 本地检索",
    };
  }
  return {
    profile: "local",
    ollamaFallback: false,
    embedEnabled: true,
    label: "本机 5060：DeepSeek 回答，本地小模型只做检索",
  };
}
