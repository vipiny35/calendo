/**
 * Marks for the services a calendar link can point at. Each is the owner's
 * own logo, bundled under icons/brands; anything unrecognised falls back to a
 * plain camera. Zoom and Webex publish wordmarks, so marks are sized by
 * height and left to take the width they need.
 */
import { Video } from "lucide";
import { lucideIcon } from "./icons";
import type { MeetingBrand } from "../shared/meetings";

const FILES: Partial<Record<MeetingBrand, string>> = {
  meet: "brands/meet.png",
  zoom: "brands/zoom.png",
  teams: "brands/teams.png",
  webex: "brands/webex.png",
  facetime: "brands/facetime.png",
};


export function meetingIcon(brand: MeetingBrand, size: number): Element {
  const file = FILES[brand];
  if (!file) return lucideIcon(Video, size);
  const mark = document.createElement("img");
  mark.src = file;
  mark.height = size;
  mark.alt = "";
  mark.setAttribute("aria-hidden", "true");
  return mark;
}
