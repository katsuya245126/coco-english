"use client";

import Link from "next/link";
import { type CSSProperties, useEffect, useRef, useState } from "react";

type ClassNameStyle = CSSProperties & { "--class-name-travel"?: string };

export function TeacherClassNavLink({ id, name, rosterCount }: { id: string; name: string; rosterCount: number }) {
  const nameRef = useRef<HTMLSpanElement>(null);
  const [travel, setTravel] = useState(0);

  useEffect(() => {
    const nameElement = nameRef.current;
    if (!nameElement) return;

    const measure = () => setTravel(Math.max(0, nameElement.scrollWidth - nameElement.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(nameElement);
    return () => observer.disconnect();
  }, [name]);

  const overflowing = travel > 0;
  const style: ClassNameStyle = overflowing ? { "--class-name-travel": `${travel}px` } : {};

  return <Link className="nav class-nav-link" data-overflow={overflowing ? "true" : "false"} href={`/teacher/classes/${id}`} style={style} title={name}>
    <span className="class-name-window"><span className="class-name-track" ref={nameRef}>{name}</span></span>
    <span className="count">{rosterCount}</span>
  </Link>;
}
