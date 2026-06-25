"use client";

import { useEffect, useState } from "react";
import type { FoundationSmokeResponse } from "@/domain/foundation/schemas";

type Readiness = {
  supabaseConfigured: boolean;
};

type SmokeState =
  | { status: "idle"; data?: undefined; error?: undefined }
  | { status: "loading"; data?: undefined; error?: undefined }
  | { status: "ready"; data: FoundationSmokeResponse; error?: undefined }
  | { status: "setup"; data?: undefined; error: string }
  | { status: "error"; data?: undefined; error: string };

export function FoundationSmokePanel() {
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [smokeState, setSmokeState] = useState<SmokeState>({ status: "idle" });

  useEffect(() => {
    let active = true;

    fetch("/api/foundation")
      .then((response) => response.json() as Promise<Readiness>)
      .then((payload) => {
        if (active) {
          setReadiness(payload);
        }
      })
      .catch(() => {
        if (active) {
          setReadiness({ supabaseConfigured: false });
        }
      });

    return () => {
      active = false;
    };
  }, []);

  async function createSmokeRecord() {
    setSmokeState({ status: "loading" });

    try {
      const response = await fetch("/api/foundation", { method: "POST" });
      const payload = await response.json();

      if (!response.ok) {
        setSmokeState({
          status: response.status === 503 ? "setup" : "error",
          error: payload.error ?? "Unable to create foundation smoke record",
        });
        return;
      }

      setSmokeState({ status: "ready", data: payload });
    } catch (error) {
      setSmokeState({
        status: "error",
        error:
          error instanceof Error
            ? error.message
            : "Unable to create foundation smoke record",
      });
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: "48px auto", fontFamily: "sans-serif" }}>
      <h1>Foundation smoke</h1>
      <p>
        Supabase service env:{" "}
        <strong>
          {readiness?.supabaseConfigured ? "configured" : "setup required"}
        </strong>
      </p>
      <button
        type="button"
        onClick={createSmokeRecord}
        disabled={smokeState.status === "loading"}
      >
        {smokeState.status === "loading"
          ? "Creating..."
          : "Create foundation smoke record"}
      </button>

      {smokeState.status === "ready" ? (
        <section aria-label="Persisted foundation record">
          <h2>{smokeState.data.className}</h2>
          <p>{smokeState.data.assignmentTitle}</p>
          <p>Status: {smokeState.data.assignmentStudentStatus}</p>
          <p>data-mode: {smokeState.data.dataMode}</p>
        </section>
      ) : null}

      {smokeState.status === "setup" ? (
        <p role="status">
          Internal setup state: {smokeState.error} Run the migration and set
          Supabase server env vars before live smoke writes.
        </p>
      ) : null}

      {smokeState.status === "error" ? (
        <p role="alert">{smokeState.error}</p>
      ) : null}
    </main>
  );
}
