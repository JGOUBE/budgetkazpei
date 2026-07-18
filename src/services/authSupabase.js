export function signInWithPasswordAuth(client, email, password) {
  return client.auth.signInWithPassword({
    email,
    password,
  })
}

export function signUpWithEmailAuth(client, { email, password, nom, emailRedirectTo }) {
  return client.auth.signUp({
    email,
    password,
    options: {
      data: {
        name: nom,
      },
      emailRedirectTo,
    },
  })
}

export function resetPasswordForEmailAuth(client, { email, redirectTo }) {
  return client.auth.resetPasswordForEmail(email, {
    redirectTo,
  })
}

export function signInWithGoogleAuth(client, { redirectTo }) {
  return client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      queryParams: {
        prompt: "select_account",
      },
    },
  })
}
