import { itIT } from "@clerk/localizations";

// Clerk's policy is 15 on both instances. The upstream translation hardcodes 8.
// Keep this display contract aligned with Clerk; E2E checks the live policy.
export const PASSWORD_MIN_LENGTH = 15;
export const passwordLengthMessage = `La password deve avere almeno ${PASSWORD_MIN_LENGTH} caratteri.`;

export const pqClerkLocalization = {
  ...itIT,
  formFieldInputPlaceholder__signUpPassword: `Almeno ${PASSWORD_MIN_LENGTH} caratteri`,
  formFieldLabel__newPassword: `Nuova password (almeno ${PASSWORD_MIN_LENGTH} caratteri)`,
  unstable__errors: {
    ...itIT.unstable__errors,
    form_password_length_too_short: passwordLengthMessage,
    passwordComplexity: {
      ...itIT.unstable__errors?.passwordComplexity,
      sentencePrefix: "La password deve contenere",
      minimumLength: "almeno {{length}} caratteri",
      maximumLength: "meno di {{length}} caratteri",
      requireLowercase: "una lettera minuscola",
      requireUppercase: "una lettera maiuscola",
      requireNumbers: "un numero",
      requireSpecialCharacter: "un carattere speciale",
    },
  },
};
