"use client";

export function TeacherWorkspaceStyles() {
  return <style jsx global>{`
    .teacher-shell { min-height: 100dvh; display: grid; grid-template-columns: 210px minmax(0, 1fr); background: #fff; color: #0f172a; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    .teacher-shell *, .teacher-shell *::before, .teacher-shell *::after { box-sizing: border-box; }
    .teacher-shell .sidebar { background: #f8fafc; border-right: 1px solid #e2e8f0; padding: 22px 14px; }
    .teacher-shell .brand { display: block; padding: 0 10px 22px; color: #172554; font-size: 18px; font-weight: 800; text-decoration: none; }
    .teacher-shell .nav { display: block; padding: 10px 12px; margin: 3px 0; border-radius: 8px; color: #334155; text-decoration: none; font-size: 14px; }
    .teacher-shell .nav, .teacher-shell a, .teacher-shell button { transition: background-color 160ms ease, border-color 160ms ease, color 160ms ease, box-shadow 160ms ease, transform 160ms ease; }
    .teacher-shell .nav:hover, .teacher-shell .filters a:hover, .teacher-shell .pagination a:hover { background: #e0e7ff; color: #1d4ed8; }
    .teacher-shell .review-row:hover, .teacher-shell .activity-row:hover { background: #f8fafc; box-shadow: inset 3px 0 #93c5fd; }
    .teacher-shell button:hover { filter: brightness(.96); }
    .teacher-shell a:focus-visible, .teacher-shell button:focus-visible, .teacher-shell summary:focus-visible { outline: 3px solid #93c5fd; outline-offset: 2px; }
    .teacher-shell .nav.active { background: #dbeafe; color: #1d4ed8; font-weight: 700; }
    .teacher-shell .count, .teacher-shell .muted-count { float: right; }
    .teacher-shell .count { min-width: 22px; padding: 2px 6px; border-radius: 999px; background: #2563eb; color: #fff; text-align: center; font-size: 11px; }
    .teacher-shell .class-nav-link { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 8px; overflow: hidden; }
    .teacher-shell .class-name-window { min-width: 0; overflow: hidden; white-space: nowrap; }
    .teacher-shell .class-name-track { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .teacher-shell .class-nav-link[data-overflow="true"]:hover .class-name-track, .teacher-shell .class-nav-link[data-overflow="true"]:focus-visible .class-name-track { width: max-content; overflow: visible; text-overflow: clip; animation: teacher-class-name-reveal 1.6s ease-in-out forwards; }
    @keyframes teacher-class-name-reveal { to { transform: translateX(calc(-1 * var(--class-name-travel))); } }
    .teacher-shell .muted-count { color: #64748b; }
    .teacher-shell .section { padding: 14px 10px 4px; margin: 0; color: #94a3b8; font-size: 10px; text-transform: uppercase; letter-spacing: .07em; }
    .teacher-shell .create { color: #2563eb; }
    .teacher-shell .workspace { min-width: 0; }
    .teacher-shell .workspace > header { height: 64px; padding: 0 24px; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: space-between; }
    .teacher-shell .workspace > main { padding: 24px; }
    .teacher-shell .pagination { display: grid; grid-template-columns: 90px 1fr 90px; align-items: center; margin-top: 18px; font-size: 12px; }
    .teacher-shell .pagination strong { text-align: center; color: #475569; }
    .teacher-shell .pagination a, .teacher-shell .pagination span { padding: 8px 10px; border: 1px solid #cbd5e1; border-radius: 7px; color: #2563eb; text-align: center; text-decoration: none; }
    .teacher-shell .pagination span { background: #f8fafc; color: #94a3b8; }
    .teacher-shell .pagination a:last-child, .teacher-shell .pagination span:last-child { justify-self: end; }
    @media (max-width: 800px) {
      .teacher-shell { grid-template-columns: 1fr; padding-top: 48px; }
      .teacher-shell .sidebar { display: none; position: fixed; z-index: 9; inset: 48px 0 0; overflow: auto; }
      .teacher-shell .sidebar.open { display: block; }
      .teacher-shell .workspace > header { position: absolute; top: 0; left: 0; right: 0; padding-left: 110px; }
      .teacher-shell .workspace > main { padding: 16px; }
    }
    @media (prefers-reduced-motion: reduce) {
      .teacher-shell *, .teacher-shell *::before, .teacher-shell *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; }
      .teacher-shell .class-nav-link[data-overflow="true"]:hover .class-name-track, .teacher-shell .class-nav-link[data-overflow="true"]:focus-visible .class-name-track { transform: none; }
    }
  `}</style>;
}
