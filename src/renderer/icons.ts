import {
  createElement,
  type IconNode,
  type SVGProps,
} from "lucide";

export function lucideIcon(
  icon: IconNode,
  size: number,
  attrs: SVGProps = {},
): SVGElement {
  const node = createElement(icon, {
    width: size,
    height: size,
    "stroke-width": 2,
    "aria-hidden": "true",
    ...attrs,
  });
  node.setAttribute("aria-hidden", "true");
  return node;
}
