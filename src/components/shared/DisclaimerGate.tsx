"use client";

import { useSyncExternalStore } from "react";
import DisclaimerModal from "./DisclaimerModal";
import { loadDisclaimerAccepted, saveDisclaimerAccepted } from "@/utils/storage";

// Minimal store over the "disclaimer accepted" flag so the gate can read
// localStorage without a hydration mismatch (and without a setState-in-effect).
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Mounts the first-visit disclaimer modal globally (via the root Providers) so
 * it shows on direct entry to any route — not just the hub.
 *
 * The server snapshot reports "accepted" so the prerendered markup never
 * contains the modal; after hydration the real localStorage value is read, and
 * the modal opens only for visitors who haven't accepted yet.
 */
export default function DisclaimerGate() {
  const accepted = useSyncExternalStore(
    subscribe,
    () => loadDisclaimerAccepted(),
    () => true,
  );

  function acceptDisclaimer() {
    saveDisclaimerAccepted();
    listeners.forEach((listener) => listener());
  }

  return <DisclaimerModal opened={!accepted} onAccept={acceptDisclaimer} />;
}
