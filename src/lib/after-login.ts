// Lets a page ask for "send me back here after I sign in" across the sign-in
// pages (including the Google redirect, which reloads /auth). Only whitelisted
// paths are ever honored, so this can't be used as an open redirect.
const KEY = "lumin-after-login";

export type AfterLoginPath = "/app-link" | "/chat";

export function setAfterLogin(path: AfterLoginPath): void {
  try {
    sessionStorage.setItem(KEY, path);
  } catch {
    // storage unavailable; the user lands on /home instead
  }
}

/** Where to go once signed in; clears the stored request. */
export function takeAfterLogin(): AfterLoginPath | "/home" {
  try {
    const value = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (value === "/app-link" || value === "/chat") return value;
  } catch {
    // ignore
  }
  return "/home";
}
