"use client";

import { useState } from "react";

type HoverButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Base inline style applied at rest. */
  style?: React.CSSProperties;
  /**
   * Style delta merged over the base style while hovered (and on keyboard focus).
   * Keep this to visual feedback only (background, borderColor, boxShadow, etc.).
   */
  hoverStyle?: React.CSSProperties;
};

/**
 * Button that layers a hover/focus style over its base inline style.
 *
 * These teacher components style buttons with inline `style` objects, which
 * cannot express `:hover`. This keeps that convention while adding hover
 * feedback via onMouseEnter/Leave state. Disabled buttons never show hover.
 */
export function HoverButton({
  style,
  hoverStyle,
  disabled,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
  ...rest
}: HoverButtonProps) {
  const [active, setActive] = useState(false);
  const showHover = active && !disabled;

  return (
    <button
      {...rest}
      disabled={disabled}
      style={showHover ? { ...style, ...hoverStyle } : style}
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
