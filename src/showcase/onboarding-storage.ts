export const ONBOARDING_STORAGE_KEY = "outrazo-onboarding-v1";
export const ONBOARDING_DRAFT_STORAGE_KEY = "outrazo-onboarding-draft-v1";

export interface OnboardingSelections {
  interests: string[];
  location: string;
  preferences: string[];
}

export interface OnboardingRecord extends OnboardingSelections {
  version: 1;
  completedAt: string;
}

export interface OnboardingDraft extends OnboardingSelections {
  step: number;
}

const DEFAULT_SELECTIONS: OnboardingSelections = {
  interests: [],
  location: "Lagos",
  preferences: [],
};

export function loadOnboardingDraft(): OnboardingDraft {
  try {
    const raw = window.localStorage.getItem(ONBOARDING_DRAFT_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SELECTIONS, step: 1 };
    const value = JSON.parse(raw) as Partial<OnboardingDraft>;
    return {
      interests: Array.isArray(value.interests) ? value.interests : [],
      location: typeof value.location === "string" ? value.location : "Lagos",
      preferences: Array.isArray(value.preferences) ? value.preferences : [],
      step: typeof value.step === "number" && value.step >= 1 && value.step <= 3 ? value.step : 1,
    };
  } catch {
    return { ...DEFAULT_SELECTIONS, step: 1 };
  }
}

export function loadOnboardingRecord(): OnboardingRecord | null {
  try {
    const raw = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<OnboardingRecord>;
    if (value.version !== 1 || !Array.isArray(value.interests) || typeof value.location !== "string") {
      return null;
    }
    return {
      version: 1,
      completedAt: typeof value.completedAt === "string" ? value.completedAt : "",
      interests: value.interests,
      location: value.location,
      preferences: Array.isArray(value.preferences) ? value.preferences : [],
    };
  } catch {
    return null;
  }
}

export function saveOnboardingDraft(draft: OnboardingDraft) {
  try {
    window.localStorage.setItem(ONBOARDING_DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // The flow still works when storage is unavailable.
  }
}

export function completeOnboarding(selections: OnboardingSelections) {
  const record: OnboardingRecord = {
    ...selections,
    version: 1,
    completedAt: new Date().toISOString(),
  };

  try {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(record));
    window.localStorage.removeItem(ONBOARDING_DRAFT_STORAGE_KEY);
  } catch {
    // Completion still navigates to the app when storage is unavailable.
  }

  return record;
}