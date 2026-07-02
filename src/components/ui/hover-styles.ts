/**
 * Shared hover-style deltas for teacher-app buttons and links.
 *
 * These are merged over a control's base inline style by {@link HoverButton}
 * and {@link HoverLink} while hovered or keyboard-focused. Keep them limited to
 * visual feedback (background, border, shadow) so they compose over any base.
 */

/** Filled primary action (base background #2563EB). Darkens on hover. */
export const primaryHover: React.CSSProperties = {
  background: "#1D4ED8",
};

/** Outline / ghost secondary action. Tints the surface and darkens the border. */
export const secondaryHover: React.CSSProperties = {
  background: "#F3F4F6",
  borderColor: "#9CA3AF",
};

/** Destructive action (base background #B42318 / #DC2626). Darkens on hover. */
export const dangerHover: React.CSSProperties = {
  background: "#991B1B",
};

/** Subtle icon / text-only control (transparent base). Tints the surface. */
export const subtleHover: React.CSSProperties = {
  background: "#F3F4F6",
};
