export const BRAJESH_SUPABASE_URL = "https://pjbpghknzqmwfykbtvzp.supabase.co";
export const BRAJESH_SUPABASE_KEY = "sb_publishable_c-jEz8WNtOn5etyRxCrKNw_WIU-GBPE";
const BRAJESH_PROJECT_REF = new URL(BRAJESH_SUPABASE_URL).hostname.split(".")[0];
const BRAJESH_STORAGE_PREFIX = `sb-${BRAJESH_PROJECT_REF}-`;

export function createBrajeshClient() {
  if (!window.supabase?.createClient) {
    throw new Error("Could not load Supabase.");
  }

  return window.supabase.createClient(BRAJESH_SUPABASE_URL, BRAJESH_SUPABASE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

export function getBrajeshRedirectURL(pathname = "/admin/") {
  return new URL(pathname, window.location.origin).toString();
}

function isAuthSessionMissingError(error) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.code || "").toLowerCase();

  return message.includes("auth session missing")
    || message.includes("session from session_id claim")
    || code === "session_not_found";
}

function clearBrajeshAuthStorage() {
  if (!window.localStorage) {
    return;
  }

  const keysToRemove = [];

  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key && key.startsWith(BRAJESH_STORAGE_PREFIX)) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach((key) => {
    window.localStorage.removeItem(key);
  });
}

export async function sendBrajeshMagicLink(client, email, pathname = "/admin/") {
  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (!normalizedEmail) {
    throw new Error("Enter an email address.");
  }

  const { error } = await client.auth.signInWithOtp({
    email: normalizedEmail,
    options: {
      emailRedirectTo: getBrajeshRedirectURL(pathname),
      // This is a private owner-only tool, so do not create new auth users from the login form.
      shouldCreateUser: false,
    },
  });

  if (error) {
    throw error;
  }

  return normalizedEmail;
}

export async function getBrajeshSessionUser(client) {
  const {
    data: { session },
    error: sessionError,
  } = await client.auth.getSession();

  if (sessionError) {
    if (isAuthSessionMissingError(sessionError)) {
      clearBrajeshAuthStorage();
      return null;
    }

    throw sessionError;
  }

  if (!session?.access_token) {
    return null;
  }

  const {
    data: { user },
    error,
  } = await client.auth.getUser(session.access_token);

  if (error) {
    if (isAuthSessionMissingError(error)) {
      clearBrajeshAuthStorage();
      return null;
    }

    throw error;
  }

  return user;
}

export async function isBrajeshAdmin(client, email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) return false;

  const { data, error } = await client
    .from("brajesh_admins")
    .select("email")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data?.email);
}

export async function requireBrajeshAdmin(client) {
  const user = await getBrajeshSessionUser(client);
  if (!user?.email) {
    return { user: null, isAdmin: false };
  }

  const admin = await isBrajeshAdmin(client, user.email);
  return {
    user,
    isAdmin: admin,
  };
}

export async function signOutBrajesh(client) {
  const { error } = await client.auth.signOut({ scope: "local" });
  clearBrajeshAuthStorage();

  if (error && !isAuthSessionMissingError(error)) {
    throw error;
  }
}
