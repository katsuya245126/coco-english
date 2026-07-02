"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { useState } from "react";

type HoverLinkProps = ComponentProps<typeof Link> & {
  /** Base inline style applied at rest. */
  style?: React.CSSProperties;
  /** Style delta merged over the base style while hovered (and on keyboard focus). */
  hoverStyle?: React.CSSProperties;
};

/**
 * `next/link` that layers a hover/focus style over its base inline style, so
 * link-styled buttons get the same hover feedback as {@link HoverButton}.
 * Renders as a client component; safe to use inside server components.
 */
export function HoverLink({
  style,
  hoverStyle,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
  ...rest
}: HoverLinkProps) {
  const [active, setActive] = useState(false);

  return (
    <Link
      {...rest}
      style={active ? { ...style, ...hoverStyle } : style}
      onMouseEnter={(event) => {
        setActive(true);
        onMouseEnter?.(event);
      }}
      onMouseLeave={(event) => {
        setActive(false);
        onMouseLeave?.(event);
      }}
      onFocus={(event) => {
        setActive(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setActive(false);
        onBlur?.(event);
      }}
    />
  );
}
