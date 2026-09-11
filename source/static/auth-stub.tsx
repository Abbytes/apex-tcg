import type { ReactNode } from "react";

export const SIGN_IN_PATH = "/login";
export const authEnabled = false;
export const GROK_PROVIDERS: { providerId: string; label: string }[] = [];

export function signIn(_provider?: string, _opts?: { callbackURL?: string }) {
  return Promise.resolve();
}
export function signOut() {
  return Promise.resolve();
}

export function SignedIn({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
export function SignedOut({ children: _c }: { children: ReactNode }) {
  return null;
}
export function UserButton() {
  return null;
}
export function RedirectToSignIn() {
  return null;
}
export function SignInGate({
  children,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return <>{children}</>;
}
export function useCurrentUserState() {
  return { user: { id: "local", name: "Hunter" }, isPending: false };
}
export function useCurrentUser() {
  return { id: "local", name: "Hunter" };
}
