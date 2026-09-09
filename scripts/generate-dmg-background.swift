// Background for the install window. The disk image places the app icon at
// (180, 170) and the Applications alias at (480, 170) measured from the top
// left, both 128pt wide, so the arrow lives in the gap between them and the
// caption sits below their labels.
//
// Writes a 1x and a 2x bitmap; scripts/../package.json folds them into the
// multi-resolution TIFF that Finder reads, so the caption stays sharp on a
// retina display.
import AppKit

let width = 660.0
let height = 400.0
let iconCenterY = 170.0
let appRight = 180.0 + 64.0
let folderLeft = 480.0 - 64.0
let space = CGColorSpaceCreateDeviceRGB()
let slate = CGColor(colorSpace: space, components: [0.62, 0.62, 0.66, 1])!

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
  // Drawing stays in points; the extra pixels come from the rep's own size.
  rep.size = NSSize(width: width, height: height)

  guard let context = NSGraphicsContext(bitmapImageRep: rep) else { return nil }
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = context
  let ctx = context.cgContext

  // A quiet vertical wash, lighter at the top like a Finder window.
  let colors = [
    CGColor(colorSpace: space, components: [0.976, 0.976, 0.984, 1])!,
    CGColor(colorSpace: space, components: [0.925, 0.925, 0.941, 1])!,
  ]
  if let gradient = CGGradient(
    colorsSpace: space, colors: colors as CFArray, locations: [0, 1]
  ) {
    ctx.drawLinearGradient(
      gradient,
      start: CGPoint(x: 0, y: height),
      end: CGPoint(x: 0, y: 0),
      options: []
    )
  }

  // Arrow, in Core Graphics coordinates where y counts up from the bottom.
  let y = height - iconCenterY
  let start = appRight + 26.0
  let end = folderLeft - 26.0
  let head = 13.0
  ctx.setStrokeColor(slate)
  ctx.setLineWidth(3.5)
  ctx.setLineCap(.round)
  ctx.move(to: CGPoint(x: start, y: y))
  ctx.addLine(to: CGPoint(x: end - head, y: y))
  ctx.strokePath()

  ctx.setFillColor(slate)
  ctx.move(to: CGPoint(x: end, y: y))
  ctx.addLine(to: CGPoint(x: end - head, y: y + head * 0.72))
  ctx.addLine(to: CGPoint(x: end - head, y: y - head * 0.72))
  ctx.closePath()
  ctx.fillPath()

  // Caption, clear of the icon labels underneath the icons.
  let style = NSMutableParagraphStyle()
  style.alignment = .center
  let text = NSAttributedString(
    string: "Drag Calendo to your Applications folder",
    attributes: [
      .font: NSFont.systemFont(ofSize: 13, weight: .regular),
      .foregroundColor: NSColor(calibratedWhite: 0.42, alpha: 1),
      .paragraphStyle: style,
    ]
  )
  text.draw(in: NSRect(x: 0, y: height - 320, width: width, height: 24))

  NSGraphicsContext.restoreGraphicsState()
  return rep.representation(using: .png, properties: [:])
}

for (scale, name) in [(1, "background.png"), (2, "background@2x.png")] {
  guard let png = render(scale: scale) else { exit(1) }
  let url = URL(fileURLWithPath: "icons/dmg/\(name)")
  try png.write(to: url)
  print("wrote \(name) at \(Int(width) * scale)x\(Int(height) * scale)")
}
