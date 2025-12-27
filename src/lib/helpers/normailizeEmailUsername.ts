// Helper function to normalize email by removing dots from the username (local part)
const normalizeEmailUsername = (email: string): string => {
  const [localPart, domain] = email.split("@");
  if (!domain) return email;
  const normalizedLocalPart = localPart.replace(/\./g, "");
  return `${normalizedLocalPart}@${domain}`.toLowerCase();
};

export default normalizeEmailUsername;
