/**
 * Fetches a file from an export endpoint and saves it in the browser.
 * Throws with the server's error message when the response is not ok.
 */
export async function downloadExport(
  url: string,
  filename: string,
): Promise<void> {
  const response = await fetch(url, { credentials: "include" });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || "Failed to download export");
  }

  const blob = await response.blob();
  const objectUrl = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(objectUrl);
  document.body.removeChild(a);
}
