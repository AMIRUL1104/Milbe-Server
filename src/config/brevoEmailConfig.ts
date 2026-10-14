export interface BrevoEnvironment {
  BREVO_API_KEY?: string | undefined;
  EMAIL_FROM?: string | undefined;
}

export interface BrevoConfiguration {
  apiKey: string;
  sender: {
    name: string;
    email: string;
  };
}

const parseSender = (
  value: string,
): BrevoConfiguration["sender"] => {
  const match = /^(.*?)\s*<([^<>]+)>$/.exec(value.trim());
  const email = (match?.[2] ?? value).trim();
  const name = match?.[1]?.trim() || "Milbe";

  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) {
    throw new Error(
      "EMAIL_FROM must be a valid email address or use the format Milbe <sender@example.com>.",
    );
  }

  return { name, email };
};

export const getBrevoConfiguration = (
  input: BrevoEnvironment,
): BrevoConfiguration | null => {
  const apiKey = input.BREVO_API_KEY?.trim();
  const emailFrom = input.EMAIL_FROM?.trim();

  if (!apiKey || !emailFrom) {
    return null;
  }

  return { apiKey, sender: parseSender(emailFrom) };
};

export const getMissingBrevoVariables = (
  input: BrevoEnvironment,
): string[] => {
  const required: Array<[string, string | undefined]> = [
    ["BREVO_API_KEY", input.BREVO_API_KEY],
    ["EMAIL_FROM", input.EMAIL_FROM],
  ];
  return required.filter(([, value]) => !value?.trim()).map(([name]) => name);
};

export const assertProductionBrevoConfiguration = (
  nodeEnv: string,
  input: BrevoEnvironment,
): void => {
  if (nodeEnv !== "production") {
    return;
  }

  const missingVariables = getMissingBrevoVariables(input);
  if (missingVariables.length > 0) {
    throw new Error(
      `Production email delivery requires: ${missingVariables.join(", ")}.`,
    );
  }

  parseSender(input.EMAIL_FROM!.trim());
};
