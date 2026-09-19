/**
 * Getting a generated file out of the app.
 *
 * In a browser tab a hidden download link is enough. Inside the iOS
 * home-screen app it is not: the tap either does nothing or opens the blob in
 * the app's own window with no way back, and window.print() is a silent no-op
 * for the same reason — there is no Safari behind the app to own the dialog.
 * There the file goes to the share sheet, which carries Print, Save to Files,
 * AirDrop and Mail.
 */

/** Only an iOS home-screen app sets navigator.standalone; an installed Chrome
 *  or Edge PWA on a laptop still prints and downloads normally. */
export function printBlockedByStandalone(nav: Navigator = navigator): boolean {
  return (nav as Navigator & { standalone?: boolean }).standalone === true;
}

export type ShareOutcome = "shared" | "cancelled" | "needs-gesture" | "downloaded";

/** Hand a file to the share sheet. Safari only allows share() during a tap,
 *  and building a PDF can outlast that window; "needs-gesture" tells the
 *  caller to keep the file and offer a button that shares it directly. */
export async function shareFile(file: File, nav: Navigator = navigator): Promise<ShareOutcome> {
  if (typeof nav.share === "function" && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: file.name });
      return "shared";
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      if (name === "AbortError") return "cancelled";
      if (name === "NotAllowedError" || name === "InvalidStateError") return "needs-gesture";
      throw error;
    }
  }
  downloadFile(file);
  return "downloaded";
}

/** Download in a browser; share from the home-screen app. */
export function deliverFile(file: File): Promise<ShareOutcome> {
  if (printBlockedByStandalone()) return shareFile(file);
  downloadFile(file);
  return Promise.resolve("downloaded");
}

export function downloadFile(file: File) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke so the browser has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
