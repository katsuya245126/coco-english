"use client";

import Link from "next/link";
import { type CSSProperties, useEffect, useRef, useState } from "react";

type ClassNameStyle = CSSProperties & { "--class-name-travel"?: string };

export function TeacherClassNavLink({ id, name, active }: { id: string; name: string; active: boolean }) {
  const nameRef = useRef<HTMLSpanElement>(null);
  const windowRef = useRef<HTMLSpanElement>(null);
  const [travel, setTravel] = useState(0);

  useEffect(() => {
    const nameElement = nameRef.current;
    const windowElement = windowRef.current;
    if (!nameElement || !windowElement) return;

    const measure = () => setTravel(Math.max(0, nameElement.scrollWidth - windowElement.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(windowElement);
    return () => observer.disconnect();
  }, [name]);

  const overflowing = travel > 0;
  const style: ClassNameStyle = overflowing ? { "--class-name-travel": `${travel}px` } : {};

  return <Link className={active ? "nav class-nav-link active" : "nav class-nav-link"} aria-current={active ? "page" : undefined} data-overflow={overflowing ? "true" : "false"} href={`/teacher/classes/${id}`} style={style} title={name}>
    <span className="class-name-window" ref={windowRef}><span className="class-name-track" ref={nameRef}>{name}</span></span>
  </Link>;
}
