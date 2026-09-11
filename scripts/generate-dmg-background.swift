// Background for the install window. Finder draws the app and Applications
// icons itself at (170, 175) and (550, 175), 128pt wide. This image only
// fills the gap: "drag and drop" and a curved arrow pointing at Applications.
//
// Writes a 1x and a 2x bitmap; `pnpm dmg:background` folds them into the
// multi-resolution TIFF that Finder reads, so the type stays sharp on retina.
import AppKit

let width = 720.0
let height = 400.0
let iconCenterY = 175.0
let appCenterX = 170.0
let folderCenterX = 550.0
let appRight = appCenterX + 64.0
let folderLeft = folderCenterX - 64.0

func roundedFont(size: CGFloat, weight: NSFont.Weight) -> NSFont {
  let base = NSFont.systemFont(ofSize: size, weight: weight)
  guard let descriptor = base.fontDescriptor.withDesign(.rounded) else { return base }
  return NSFont(descriptor: descriptor, size: size) ?? base
}

func render(scale: Int) -> Data? {
  guard let rep = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: Int(width) * scale,
    pixelsHigh: Int(height) * scale,
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: true,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: 0,
    bitsPerPixel: 0
  ) else { return nil }
  rep.size = NSSize(width: width, height: height)

  guard let context = NSGraphicsContext(bitmapImageRep: rep) else { return nil }
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = context
  let ctx = context.cgContext

  NSColor.white.setFill()
  ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))

  let ink = NSColor(calibratedRed: 0.12, green: 0.24, blue: 0.42, alpha: 1)
  let y = height - iconCenterY

  let style = NSMutableParagraphStyle()
  style.alignment = .center
  let caption = NSAttributedString(
    string: "drag and drop",
    attributes: [
      .font: roundedFont(size: 28, weight: .semibold),
      .foregroundColor: ink,
      .paragraphStyle: style,
    ]
  )
  let textHeight = 34.0
  caption.draw(
    in: NSRect(x: 0, y: y + 16, width: width, height: textHeight)
  )

  let start = CGPoint(x: appRight + 18, y: y - 6)
  let end = CGPoint(x: folderLeft - 10, y: y + 2)
  let control1 = CGPoint(x: start.x + 70, y: start.y - 58)
  let control2 = CGPoint(x: end.x - 95, y: end.y - 52)
  let head = 14.0
  let tangent = CGPoint(x: end.x - control2.x, y: end.y - control2.y)
  let length = hypot(tangent.x, tangent.y)
  let ux = tangent.x / length
  let uy = tangent.y / length
  let px = -uy
  let py = ux
  let tip = end
  let base = CGPoint(x: end.x - ux * head, y: end.y - uy * head)
  let shaftEnd = CGPoint(x: end.x - ux * (head * 0.45), y: end.y - uy * (head * 0.45))

  ctx.setStrokeColor(ink.cgColor)
  ctx.setFillColor(ink.cgColor)
  ctx.setLineWidth(4.25)
  ctx.setLineCap(.round)
  ctx.move(to: start)
  ctx.addCurve(to: shaftEnd, control1: control1, control2: control2)
  ctx.strokePath()

  ctx.move(to: tip)
  ctx.addLine(to: CGPoint(x: base.x + px * head * 0.58, y: base.y + py * head * 0.58))
  ctx.addLine(to: CGPoint(x: base.x - px * head * 0.58, y: base.y - py * head * 0.58))
  ctx.closePath()
  ctx.fillPath()

  NSGraphicsContext.restoreGraphicsState()
  return rep.representation(using: .png, properties: [:])
}

for (scale, name) in [(1, "background.png"), (2, "background@2x.png")] {
  guard let png = render(scale: scale) else { exit(1) }
  let url = URL(fileURLWithPath: "icons/dmg/\(name)")
  try png.write(to: url)
  print("wrote \(name) at \(Int(width) * scale)x\(Int(height) * scale)")
}
