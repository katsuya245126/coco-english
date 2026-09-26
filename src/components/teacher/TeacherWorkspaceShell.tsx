"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TeacherClass } from "@/server/classroom/class-service";
import type { TeacherQueueSnapshot } from "@/server/teacher/assignment-operations";
import { TeacherClassNavLink } from "@/components/teacher/TeacherClassNavLink";
import { FlashNotice } from "@/components/ui/FlashNotice";

const POLL_INTERVAL_MS = 30000;
const fingerprint = (snapshot: TeacherQueueSnapshot) => `${snapshot.needsReviewCount}:${snapshot.unreadCount}:${snapshot.newest?.attemptId ?? ""}`;

export function TeacherWorkspaceShell({ profileName, classes, initialSnapshot, incompleteCount, children }: { profileName: string; classes: TeacherClass[]; initialSnapshot: TeacherQueueSnapshot; incompleteCount: number; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [pendingInboxSnapshot, setPendingInboxSnapshot] = useState<TeacherQueueSnapshot | null>(null);
  const [notice, setNotice] = useState<TeacherQueueSnapshot["newest"]>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const lastSeen = useRef(fingerprint(initialSnapshot));

  // A teacher action (mark reviewed / request retry) calls revalidatePath("/teacher")
  // then navigates, so the server layout re-renders this component with a fresh
  // initialSnapshot. React reuses the mounted instance across that client
  // navigation, so without this sync the count would stay stale until the next
  // 30s poll. Adopt the new server snapshot immediately and advance lastSeen so
  // this authoritative, teacher-initiated change does NOT trip the "new
  // submissions" banner/notice. Keyed on the fingerprint (a stable string) so it
  // only runs when the server-provided snapshot actually differs, never on every
  // object-identity re-render.
  const initialFingerprint = fingerprint(initialSnapshot);
  useEffect(() => {
    setSnapshot(initialSnapshot);
    lastSeen.current = initialFingerprint;
    setPendingInboxSnapshot(null);
    setNotice(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFingerprint]);

  const fetchSnapshot = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const response = await fetch("/api/teacher/queue-snapshot", { cache: "no-store" });
      if (!response.ok) return;
      const next = await response.json() as TeacherQueueSnapshot;
      const nextFingerprint = fingerprint(next);
      setSnapshot(next);
      if (nextFingerprint !== lastSeen.current) {
        if (pathname === "/teacher") setPendingInboxSnapshot(next);
        else setNotice(next.newest);
        lastSeen.current = nextFingerprint;
      }
    } catch { /* Keep the last good snapshot and leave the current task alone. */ }
  }, [pathname]);

  useEffect(() => {
    const interval = window.setInterval(fetchSnapshot, POLL_INTERVAL_MS);
    const onVisibility = () => { if (document.visibilityState === "visible") void fetchSnapshot(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", fetchSnapshot);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", onVisibility); window.removeEventListener("focus", fetchSnapshot); };
  }, [fetchSnapshot]);

  const applyInboxRefresh = () => { setPendingInboxSnapshot(null); router.refresh(); };
  const nav = useMemo(() => [
    ["Needs review", "/teacher", snapshot.needsReviewCount],
    ["Incomplete", "/teacher/incomplete", incompleteCount],
    ["All activity", "/teacher/activity", null],
  ] as const, [snapshot.needsReviewCount, incompleteCount]);

  return <div className="teacher-shell">
    <header className="mobile-bar">
      <Link className="brand-name" href="/teacher">Coco English</Link>
      <button className="mobile-trigger" type="button" aria-expanded={menuOpen} aria-controls="teacher-navigation" aria-label="Menu" onClick={() => setMenuOpen((open) => !open)}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
    </header>
    <aside id="teacher-navigation" className={menuOpen ? "sidebar open" : "sidebar"}>
      <Link className="brand" href="/teacher"><span className="brand-mark"><Image src="/images/coco-happy-alpha.png" alt="" width={32} height={32} priority/></span><span className="brand-name">Coco English</span></Link>
      <nav aria-label="Teacher workspace">
        {nav.map(([label, href, count]) => <Link key={href} href={href} className={pathname === href ? "nav active" : "nav"} aria-current={pathname === href ? "page" : undefined}>{label}{count !== null && count > 0 && <span className={href === "/teacher" ? "count hot" : "count"}>{count}</span>}</Link>)}
        <p className="section">Classes</p>
        {classes.map((klass) => <TeacherClassNavLink id={klass.id} key={klass.id} name={klass.name} active={pathname.startsWith(`/teacher/classes/${klass.id}`)}/>)}
        <Link className="nav create" href="/teacher/classes">+ Create class</Link>
        <p className="section">Content</p><Link className={pathname.startsWith("/teacher/missions") ? "nav active" : "nav"} href="/teacher/missions">Missions</Link>
      </nav>
      <div className="sidebar-footer">
        <span className="profile"><span className="avatar tone-2" aria-hidden="true">{profileName.trim().charAt(0).toUpperCase()}</span>{profileName}</span>
        <form action="/auth/logout" method="post"><button className="ghost-button" type="submit">Log out</button></form>
      </div>
    </aside>
    <div className="workspace">
      {pendingInboxSnapshot && <button className="banner" type="button" onClick={applyInboxRefresh}>{pendingInboxSnapshot.needsReviewCount} new submissions — Show now</button>}
      {notice && <div style={{ position: "fixed", top: 24, right: 24, zIndex: 1000 }}><FlashNotice variant="info" message={`${notice.studentName} · ${notice.className}`} onDismiss={() => setNotice(null)} autoHideMs={6000} action={<Link href={notice.href} style={{ color: "#2563EB", fontWeight: 600, fontSize: 13, textDecoration: "none", whiteSpace: "nowrap" }}>View</Link>}>{notice.assignmentTitle}</FlashNotice></div>}
      <main>{children}</main>
    </div>
  </div>;
}
