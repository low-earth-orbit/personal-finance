"use client";

import { useEffect, useState, type ReactNode } from "react";
import { IconArrowDown } from "@tabler/icons-react";
import layout from "./TwoColumn.module.css";

/**
 * Below the two-column breakpoint the result sits under the inputs, so while editing you can't
 * see what your change did. This bar pins the headline to the bottom of the screen and jumps to the
 * result. It shows only while the result is still below the viewport (not once you've reached or
 * passed it) and never on wide screens, where the result sits beside the inputs.
 */
export default function JumpToResult({
  targetId,
  children,
}: {
  /** id of the result column to watch and jump to. */
  targetId: string;
  /** The headline, kept to one short line. */
  children: ReactNode;
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      setShow(!entry.isIntersecting && entry.boundingClientRect.top > 0);
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, [targetId]);

  if (!show) return null;

  return (
    <a
      href={`#${targetId}`}
      className={layout.jump}
      onClick={(event) => {
        event.preventDefault();
        const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        document
          .getElementById(targetId)
          ?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
      }}
    >
      <span className={layout.jumpText}>{children}</span>
      <span className={layout.jumpAction}>
        Result <IconArrowDown size={14} aria-hidden="true" />
      </span>
    </a>
  );
}
