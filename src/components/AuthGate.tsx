// TQ ChatBot #1 - Auth Gate Component
//
// Wraps the Dashboard and enforces Supabase Auth.
// If no session exists, renders a minimal login form.
// This is security infrastructure, not UI redesign — it protects PII.

import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

// Dev-mode bypass: if Supabase is not configured (placeholder URL), skip the
// auth gate so the dashboard is accessible during local development.  Auth
// remains enforced in production where a real Supabase project is configured.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://your-project-ref.supabase.co";
const IS_DEV_MODE = SUPABASE_URL.includes("your-project-ref");

interface AuthGateProps {
  children: React.ReactNode;
}

export const AuthGate: React.FC<AuthGateProps> = ({ children }) => {
  const [session, setSession] = useState<Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Check existing session
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(authError.message);
      }
    } catch {
      setError("Authentication service unavailable. Check Supabase configuration.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !IS_DEV_MODE) {
    return (
      <div className="tq-auth-loading">
        <div className="tq-spinner" />
        <p>Checking authentication...</p>
      </div>
    );
  }

  if (!session && !IS_DEV_MODE) {
    return (
      <div className="tq-auth-gate">
        <div className="tq-auth-card">
          <h2>Dashboard Access</h2>
          <p>Sign in to view lead data and funnel metrics.</p>
          <form onSubmit={handleLogin} className="tq-auth-form">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
            {error && <p className="tq-auth-error">{error}</p>}
            <button type="submit" disabled={submitting}>
              {submitting ? "Signing in..." : "Sign In"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default AuthGate;
