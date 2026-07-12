"use client";
import { useState } from "react";
import { loadHistoryAudioAction } from "@/app/student/history/[assignmentStudentId]/actions";

export function StudentHistoryAudioPlayer({ audioClipId }: { audioClipId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  async function load() {
    setPending(true); setUnavailable(false);
    const result = await loadHistoryAudioAction(audioClipId);
    setPending(false);
    if (result.ok) setUrl(result.signedUrl); else setUnavailable(true);
  }
  if (url) return <audio controls src={url} style={{ width: "100%", marginTop: 10 }}>Audio unavailable</audio>;
  return <div><button type="button" onClick={load} disabled={pending} style={{ minHeight: 44, marginTop: 10, border: 0, borderRadius: 999, padding: "8px 16px", background: "#2563EB", color: "white", fontWeight: 700 }}>{pending ? "Preparing…" : "▶ Play recording"}</button>{unavailable ? <p role="alert">Recording unavailable</p> : null}</div>;
}
