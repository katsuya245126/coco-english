"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TeacherClass } from "@/server/classroom/class-service";
import type { TeacherQueueSnapshot } from "@/server/teacher/assignment-operations";
import { TeacherClassNavLink } from "@/components/teacher/TeacherClassNavLink";

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
    <button className="mobile-trigger" type="button" aria-expanded={menuOpen} aria-controls="teacher-navigation" onClick={() => setMenuOpen((open) => !open)}>☰ <span>Menu</span></button>
    <aside id="teacher-navigation" className={menuOpen ? "sidebar open" : "sidebar"}>
      <Link className="brand" href="/teacher">Coco English</Link>
      <nav aria-label="Teacher workspace">
        {nav.map(([label, href, count]) => <Link key={href} href={href} className={pathname === href ? "nav active" : "nav"}>{label}{count !== null && <span className="count">{count}</span>}</Link>)}
        <p className="section">Classes</p>
        {classes.map((klass) => <TeacherClassNavLink id={klass.id} key={klass.id} name={klass.name} rosterCount={klass.rosterCount}/>)}
        <Link className="nav create" href="/teacher/classes">＋ Create class</Link>
        <p className="section">Content</p><Link className="nav" href="/teacher/missions">Missions</Link>
      </nav>
    </aside>
    <div className="workspace"><header><strong>Teacher home</strong><span>{profileName} · <form action="/auth/logout" method="post"><button type="submit">Log out</button></form></span></header>
      {pendingInboxSnapshot && <button className="banner" type="button" onClick={applyInboxRefresh}>{pendingInboxSnapshot.needsReviewCount} new submissions — Show now</button>}
      {notice && <div className="notice"><span><strong>{notice.studentName}</strong> · {notice.assignmentTitle} · {notice.className}</span><Link href={notice.href}>View</Link><button type="button" aria-label="Dismiss" onClick={() => setNotice(null)}>×</button></div>}
      <main>{children}</main>
    </div>
    <style jsx>{`*{box-sizing:border-box}.teacher-shell{min-height:100dvh;display:grid;grid-template-columns:210px minmax(0,1fr);background:#fff;color:#0f172a;font-family:Inter,ui-sans-serif,system-ui,sans-serif}.sidebar{background:#f8fafc;border-right:1px solid #e2e8f0;padding:22px 14px}.brand{display:block;padding:0 10px 22px;color:#172554;font-size:18px;font-weight:800;text-decoration:none}.nav{display:block;padding:10px 12px;margin:3px 0;border-radius:8px;color:#334155;text-decoration:none;font-size:14px}.nav.active{background:#dbeafe;color:#1d4ed8;font-weight:700}.count,.muted-count{float:right}.count{background:#2563eb;color:#fff;border-radius:999px;min-width:22px;padding:2px 6px;text-align:center;font-size:11px}.muted-count{color:#64748b}.section{padding:14px 10px 4px;margin:0;color:#94a3b8;font-size:10px;text-transform:uppercase;letter-spacing:.07em}.create{color:#2563eb}.workspace{min-width:0}.workspace header{height:64px;border-bottom:1px solid #e2e8f0;padding:0 24px;display:flex;align-items:center;justify-content:space-between}.workspace header span,.workspace header form{display:flex;align-items:center;gap:6px;color:#64748b;font-size:12px}.workspace header button{border:0;background:none;color:#2563eb;cursor:pointer}.workspace main{padding:24px}.banner{display:block;width:calc(100% - 48px);margin:16px 24px 0;padding:10px;border:1px solid #93c5fd;border-radius:8px;background:#eff6ff;color:#1d4ed8;font-weight:700;cursor:pointer}.notice{position:fixed;z-index:5;right:20px;bottom:20px;max-width:440px;display:flex;align-items:center;gap:12px;padding:12px 14px;border:1px solid #bfdbfe;border-radius:9px;background:#fff;box-shadow:0 8px 28px #0f172a22;font-size:13px}.notice a{color:#2563eb;font-weight:700}.notice button{border:0;background:none;font-size:18px;cursor:pointer}.mobile-trigger{display:none}@media(max-width:800px){.teacher-shell{grid-template-columns:1fr;padding-top:48px}.mobile-trigger{display:block;position:fixed;z-index:10;left:10px;top:8px;border:1px solid #cbd5e1;background:#fff;border-radius:7px;padding:8px 10px}.sidebar{display:none;position:fixed;z-index:9;inset:48px 0 0 0;overflow:auto}.sidebar.open{display:block}.workspace header{position:absolute;top:0;left:0;right:0;padding-left:110px}.workspace main{padding:16px}}`}</style>
  </div>;
}
