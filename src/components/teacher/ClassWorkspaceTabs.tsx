"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function ClassWorkspaceTabs({ classId, needsReviewCount }: { classId: string; needsReviewCount: number }) {
  const pathname = usePathname();
  const base = `/teacher/classes/${classId}`;
  const tabs: { href: string; label: string; count?: number }[] = [
    { href: base, label: "Needs review", count: needsReviewCount },
    { href: `${base}/assignments`, label: "Assignments" },
    { href: `${base}/students`, label: "Students" },
    { href: `${base}/manage`, label: "Class settings" },
  ];
  return <nav aria-label="Class workspace" className="class-workspace-tabs">
    {tabs.map((tab) => <Link className={pathname === tab.href ? "active" : undefined} href={tab.href} key={tab.href}>{tab.label}{tab.count !== undefined && <span>{tab.count}</span>}</Link>)}
  </nav>;
}
