/**
 * Client-side Google Picker integration -- lets a student browse their
 * Google Drive or upload a file from their device, and returns the
 * resulting Drive file's id/name/link. Picker itself handles the actual
 * upload to Drive when "Upload" is used, so ClearPath never needs its own
 * file-upload server route.
 */

// Deliberately NOT augmenting the global Window type here -- auth.tsx
// already declares window.google for Google Identity Services (sign-in),
// with a different shape, and TypeScript requires merged declarations of
// the same global member to match exactly. Using local casts instead
// keeps this file self-contained.

type GooglePickerView = {
  setIncludeFolders?: (include: boolean) => GooglePickerView;
};

type GooglePickerBuilder = {
  addView: (view: GooglePickerView) => GooglePickerBuilder;
  setOAuthToken: (token: string) => GooglePickerBuilder;
  setDeveloperKey: (key: string) => GooglePickerBuilder;
  setCallback: (callback: (data: PickerCallbackData) => void) => GooglePickerBuilder;
  build: () => { setVisible: (visible: boolean) => void };
};

type PickerCallbackData = {
  action: string;
  docs?: { id: string; name: string; url: string }[];
};

type GapiGlobal = {
  load: (api: string, callback: () => void) => void;
};

type GooglePickerGlobal = {
  picker: {
    PickerBuilder: new () => GooglePickerBuilder;
    DocsView: new () => GooglePickerView;
    DocsUploadView: new () => GooglePickerView;
    Action: { PICKED: string; CANCEL: string };
  };
};

function getGapi(): GapiGlobal | undefined {
  return (window as unknown as { gapi?: GapiGlobal }).gapi;
}

function getGooglePicker(): GooglePickerGlobal | undefined {
  return (window as unknown as { google?: GooglePickerGlobal }).google;
}

export type PickedDriveFile = { id: string; name: string; url: string };

let scriptLoadPromise: Promise<void> | null = null;
let pickerApiLoadPromise: Promise<void> | null = null;

function loadGapiScript(): Promise<void> {
  if (scriptLoadPromise) return scriptLoadPromise;
  scriptLoadPromise = new Promise((resolve, reject) => {
    if (getGapi()) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load the Google Picker script."));
    document.head.appendChild(script);
  });
  return scriptLoadPromise;
}

async function loadPickerApi(): Promise<void> {
  if (pickerApiLoadPromise) return pickerApiLoadPromise;
  await loadGapiScript();
  pickerApiLoadPromise = new Promise((resolve) => {
    getGapi()!.load("picker", () => resolve());
  });
  return pickerApiLoadPromise;
}

/** Opens the Google Picker (Drive browser + device upload) and resolves
 * with the file the student picked/uploaded, or null if they cancelled. */
export async function openDrivePicker({
  accessToken,
  apiKey,
}: {
  accessToken: string;
  apiKey: string;
}): Promise<PickedDriveFile | null> {
  await loadPickerApi();
  const picker = getGooglePicker()!.picker;

  return new Promise((resolve, reject) => {
    try {
      const builder = new picker.PickerBuilder()
        .addView(new picker.DocsView())
        .addView(new picker.DocsUploadView())
        .setOAuthToken(accessToken)
        .setDeveloperKey(apiKey)
        .setCallback((data: PickerCallbackData) => {
          if (data.action === picker.Action.PICKED && data.docs?.[0]) {
            const doc = data.docs[0];
            resolve({ id: doc.id, name: doc.name, url: doc.url });
          } else if (data.action === picker.Action.CANCEL) {
            resolve(null);
          }
        });
      builder.build().setVisible(true);
    } catch (err) {
      reject(err instanceof Error ? err : new Error("Could not open the Google Picker."));
    }
  });
}
