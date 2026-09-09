/**
 * Marks for the services a calendar link can point at. Google, Zoom, Cisco,
 * Jitsi and GoTo publish theirs through simple-icons (CC0); Apple and
 * Microsoft do not, so FaceTime and Teams wear the generic camera in the
 * service's colour rather than an invented logo.
 */
import { Video } from "lucide";
import {
  siGooglemeet,
  siGotomeeting,
  siJitsi,
  siWebex,
  siZoom,
} from "simple-icons";
import { lucideIcon } from "./icons";
import type { MeetingBrand } from "../shared/meetings";

const SVG_NS = "http://www.w3.org/2000/svg";

function brandPath(path: string, size: number, color: string): SVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", color);
  svg.setAttribute("aria-hidden", "true");
  const shape = document.createElementNS(SVG_NS, "path");
  shape.setAttribute("d", path);
  svg.append(shape);
  return svg;
}

function camera(size: number, color: string): SVGElement {
  const icon = lucideIcon(Video, size);
  icon.setAttribute("stroke", color);
  return icon;
}

/** Webex's own hex is black, which disappears on a dark menu. */
const INK = "currentColor";

export function meetingIcon(brand: MeetingBrand, size: number): SVGElement {
  switch (brand) {
    case "meet":
      return brandPath(siGooglemeet.path, size, `#${siGooglemeet.hex}`);
    case "zoom":
      return brandPath(siZoom.path, size, `#${siZoom.hex}`);
    case "webex":
      return brandPath(siWebex.path, size, INK);
    case "jitsi":
      return brandPath(siJitsi.path, size, `#${siJitsi.hex}`);
    case "gotomeeting":
      return brandPath(siGotomeeting.path, size, `#${siGotomeeting.hex}`);
    case "facetime":
      return camera(size, "#34C759");
    case "teams":
      return camera(size, "#6264A7");
    default:
      return camera(size, INK);
  }
}
