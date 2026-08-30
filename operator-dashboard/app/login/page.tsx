"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { BackendRequestError, login } from "../lib/backend";

/**
 * PUBLIC_INTERFACE
 * Renders the operator sign-in flow without retaining credentials outside the form submission.
 */
export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const session = await login(username, password);
      if (!session.authenticated) {
        throw new Error("Authentication was not established.");
      }
      router.replace("/");
    } catch (error) {
      setErrorMessage(
        error instanceof BackendRequestError || error instanceof Error
          ? error.message
          : "Unable to sign in at this time."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <p className="brand-eyebrow">Renewi POC</p>
        <h1 id="login-title">Fire &amp; Smoke Monitor</h1>
        <p>Sign in to access private operational records and authorized uploaded-media workflows.</p>

        <form className="form-grid" onSubmit={handleSubmit}>
          <label htmlFor="username">
            Operator username
            <input
              id="username"
              autoComplete="username"
              disabled={isSubmitting}
              onChange={(event) => setUsername(event.target.value)}
              required
              value={username}
            />
          </label>

          <label htmlFor="password">
            Password
            <input
              id="password"
              autoComplete="current-password"
              disabled={isSubmitting}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>

          {errorMessage ? (
            <p className="error-message" role="alert">
              {errorMessage}
            </p>
          ) : null}

          <button disabled={isSubmitting} type="submit">
            {isSubmitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="notice">
          This POC does not connect to live CCTV or replace site fire-safety systems.
        </p>
      </section>
    </main>
  );
}
