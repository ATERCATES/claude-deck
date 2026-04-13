"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Lock, Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<"credentials" | "totp">("credentials");
  const totpInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === "totp" && totpInputRef.current) {
      totpInputRef.current.focus();
    }
  }, [step]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          ...(step === "totp" ? { totpCode } : {}),
        }),
      });

      const data = await res.json();

      if (res.status === 429) {
        setError(
          `Too many attempts. Try again in ${data.retryAfterSeconds || 60}s.`
        );
        return;
      }

      if (data.requiresTotp) {
        setStep("totp");
        return;
      }

      if (!res.ok) {
        setError(data.error || "Invalid credentials");
        if (step === "totp") setTotpCode("");
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("Connection error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (step === "totp" && totpCode.length === 6) {
      const form = document.getElementById("login-form") as HTMLFormElement;
      form?.requestSubmit();
    }
  }, [totpCode, step]);

  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-4">
      <div className="border-border bg-card w-full max-w-sm rounded-xl border p-8 shadow-lg">
        <div className="mb-8 text-center">
          <div className="bg-primary/10 text-primary mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full">
            <Lock className="h-6 w-6" />
          </div>
          <h1 className="text-foreground text-2xl font-semibold">ClaudeDeck</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {step === "credentials"
              ? "Sign in to continue"
              : "Enter your 2FA code"}
          </p>
        </div>

        <form id="login-form" onSubmit={handleSubmit} className="space-y-4">
          {step === "credentials" ? (
            <>
              <div className="space-y-2">
                <label
                  htmlFor="username"
                  className="text-foreground text-sm font-medium"
                >
                  Username
                </label>
                <Input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  autoFocus
                  required
                />
              </div>
              <div className="space-y-2">
                <label
                  htmlFor="password"
                  className="text-foreground text-sm font-medium"
                >
                  Password
                </label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <label
                htmlFor="totp"
                className="text-foreground text-sm font-medium"
              >
                Authentication code
              </label>
              <Input
                ref={totpInputRef}
                id="totp"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                className="text-center text-2xl tracking-[0.5em]"
                autoComplete="one-time-code"
                required
              />
              <button
                type="button"
                onClick={() => {
                  setStep("credentials");
                  setTotpCode("");
                  setError("");
                }}
                className="text-muted-foreground hover:text-foreground text-xs underline"
              >
                Back to login
              </button>
            </div>
          )}

          {error && (
            <p className="text-destructive text-center text-sm">{error}</p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {step === "credentials" ? "Sign in" : "Verify"}
          </Button>
        </form>
      </div>
    </div>
  );
}
