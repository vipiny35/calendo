/** Which service a meeting link belongs to, and how to name it in the menu. */
export type MeetingBrand =
  | "meet"
  | "zoom"
  | "facetime"
  | "teams"
  | "webex"
  | "jitsi"
  | "gotomeeting"
  | "generic";

const HOSTS: { brand: MeetingBrand; label: string; hosts: string[] }[] = [
  { brand: "meet", label: "Join Google Meet meeting", hosts: ["meet.google.com"] },
  { brand: "zoom", label: "Join Zoom meeting", hosts: ["zoom.us", "zoom.com"] },
  { brand: "facetime", label: "Join FaceTime call", hosts: ["facetime.apple.com"] },
  {
    brand: "teams",
    label: "Join Microsoft Teams meeting",
    hosts: ["teams.microsoft.com", "teams.live.com"],
  },
  { brand: "webex", label: "Join Webex meeting", hosts: ["webex.com"] },
  { brand: "jitsi", label: "Join Jitsi meeting", hosts: ["jit.si", "jitsi.org"] },
  {
    brand: "gotomeeting",
    label: "Join GoToMeeting meeting",
    hosts: ["gotomeeting.com", "goto.com"],
  },
];

/** Matches the host itself or a subdomain of it, never a lookalike suffix. */
function servesHost(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

export function meetingBrand(url: string): { brand: MeetingBrand; label: string } {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    host = "";
  }
  const match = HOSTS.find((entry) =>
    entry.hosts.some((domain) => servesHost(host, domain)),
  );
  return match
    ? { brand: match.brand, label: match.label }
    : { brand: "generic", label: "Join meeting" };
}
