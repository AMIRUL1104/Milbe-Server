export interface SmtpEnvironment {
  SMTP_HOST?: string | undefined;
  SMTP_PORT?: number | undefined;
  SMTP_USER?: string | undefined;
  SMTP_PASS?: string | undefined;
}

export interface SmtpConfiguration {
  host: string;
  port: number;
  secure: boolean;
  connectionTimeout: number;
  greetingTimeout: number;
  socketTimeout: number;
  auth: {
    user: string;
    pass: string;
  };
}

export const getSmtpConfiguration = (
  input: SmtpEnvironment,
): SmtpConfiguration | null => {
  const host = input.SMTP_HOST?.trim();
  const user = input.SMTP_USER?.trim();
  const password = input.SMTP_PASS;

  if (!host || !user || !password?.trim()) {
    return null;
  }

  const port = input.SMTP_PORT ?? 465;
  return {
    host,
    port,
    secure: port === 465,
    connectionTimeout: 10_000,
    greetingTimeout: 5_000,
    socketTimeout: 10_000,
    auth: { user, pass: password },
  };
};

export const getMissingSmtpVariables = (
  input: SmtpEnvironment,
): string[] => {
  const required: Array<[string, string | undefined]> = [
    ["SMTP_HOST", input.SMTP_HOST],
    ["SMTP_USER", input.SMTP_USER],
    ["SMTP_PASS", input.SMTP_PASS],
  ];
  return required.filter(([, value]) => !value?.trim()).map(([name]) => name);
};

export const assertProductionSmtpConfiguration = (
  nodeEnv: string,
  input: SmtpEnvironment,
): void => {
  if (nodeEnv !== "production") {
    return;
  }

  const missingVariables = getMissingSmtpVariables(input);
  if (missingVariables.length > 0) {
    throw new Error(
      `Production email delivery requires: ${missingVariables.join(", ")}.`,
    );
  }
};
