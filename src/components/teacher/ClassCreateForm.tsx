"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createClassAction } from "@/app/teacher/classes/actions";
import styles from "./ClassCreateForm.module.css";

export function ClassCreateForm() {
  const [state, formAction, pending] = useActionState(createClassAction, {
    error: null,
    name: "",
  });

  return (
    <form action={formAction} className={styles.form}>
      <label className={styles.label} htmlFor="class-name">
        Class name
      </label>
      <input
        autoFocus
        autoComplete="off"
        className={styles.input}
        defaultValue={state.name}
        id="class-name"
        maxLength={80}
        name="name"
        required
        aria-describedby={state.error ? "class-name-error" : undefined}
        aria-invalid={state.error ? true : undefined}
      />
      {state.error && (
        <p className={styles.error} id="class-name-error" role="alert">
          {state.error}
        </p>
      )}
      <div className={styles.actions}>
        <Link className="ghost-button" href="/teacher">
          Cancel
        </Link>
        <button className="primary-button" disabled={pending} type="submit">
          {pending ? "Saving…" : "Save class"}
        </button>
      </div>
    </form>
  );
}
