/**
 * True when the Erase ALL copy and typed guard apply: multi-trip is on, or a Traveler's trip status is not known yet
 * (loading, or failing: the flag then reads false). Only a known-disabled state and no provider keep today's reset.
 */
export function eraseAllApplies(multiTripEnabled: boolean, role: string, serverTripStatus: string): boolean {
  return multiTripEnabled || (role === "traveler" && serverTripStatus !== "known");
}
