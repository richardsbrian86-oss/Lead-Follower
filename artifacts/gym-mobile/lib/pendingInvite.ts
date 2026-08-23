import AsyncStorage from "@react-native-async-storage/async-storage";

// Bridges the gap between the accept-invite screen (which runs before the
// user is signed in) and the moment Clerk finishes sign-in/sign-up. Clerk's
// native sign-up flow leaves the app to let the user check their email for a
// verification code, so we persist to disk (AsyncStorage) rather than
// in-memory state, which would be lost if the OS reclaims the app in the
// background during that wait.
const TOKEN_KEY = "flowstate.pendingInvite.token";
const EMAIL_KEY = "flowstate.pendingInvite.email";

export type PendingInvite = { token: string; email: string };

export async function setPendingInvite(invite: PendingInvite): Promise<void> {
  await AsyncStorage.multiSet([
    [TOKEN_KEY, invite.token],
    [EMAIL_KEY, invite.email],
  ]);
}

export async function getPendingInvite(): Promise<PendingInvite | null> {
  const [[, token], [, email]] = await AsyncStorage.multiGet([TOKEN_KEY, EMAIL_KEY]);
  if (!token || !email) return null;
  return { token, email };
}

export async function clearPendingInvite(): Promise<void> {
  await AsyncStorage.multiRemove([TOKEN_KEY, EMAIL_KEY]);
}
