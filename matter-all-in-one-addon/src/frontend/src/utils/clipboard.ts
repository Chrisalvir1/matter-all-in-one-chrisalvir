/**
 * Universal clipboard copy utility.
 * Works across modern HTTPS secure contexts and inside Home Assistant Ingress
 * iframes / HTTP environments where navigator.clipboard might be blocked or restricted.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  // Try modern Clipboard API if supported and in secure context
  if (navigator?.clipboard && typeof navigator.clipboard.writeText === "function") {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to fallback
    }
  }

  // Fallback for iframes / non-secure contexts (Home Assistant Ingress)
  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.setAttribute("readonly", "");
    textArea.style.position = "fixed";
    textArea.style.top = "-9999px";
    textArea.style.left = "-9999px";
    textArea.style.opacity = "0";
    document.body.appendChild(textArea);

    textArea.focus();
    textArea.select();

    const success = document.execCommand("copy");
    document.body.removeChild(textArea);
    return success;
  } catch (err) {
    console.warn("Failed to copy to clipboard:", err);
    return false;
  }
}
