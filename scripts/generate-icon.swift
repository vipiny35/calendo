#!/usr/bin/env swift
import AppKit
import Foundation

let script = URL(fileURLWithPath: CommandLine.arguments[0]).standardizedFileURL
let root = script.deletingLastPathComponent().deletingLastPathComponent()
let icons = root.appendingPathComponent("icons")
try FileManager.default.createDirectory(at: icons, withIntermediateDirectories: true)

let canvas = 1024.0
let tile = 824.0
let origin = (canvas - tile) / 2
let radius = tile * 0.223
let header = NSColor(srgbRed: 0.25, green: 0.43, blue: 0.53, alpha: 1)
let page = NSColor(srgbRed: 0.96, green: 0.97, blue: 0.98, alpha: 1)
let ink = NSColor(srgbRed: 0.12, green: 0.14, blue: 0.16, alpha: 1)
let cell = NSColor(srgbRed: 0.82, green: 0.86, blue: 0.89, alpha: 1)

func roundedRect(_ rect: NSRect, radius: CGFloat) -> NSBezierPath {
    NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius)
}

func drawAppIcon() -> NSImage {
    let image = NSImage(size: NSSize(width: canvas, height: canvas), flipped: true) { _ in
        NSColor.clear.setFill()
        NSRect(x: 0, y: 0, width: canvas, height: canvas).fill()

        ink.setFill()
        roundedRect(NSRect(x: origin, y: origin, width: tile, height: tile), radius: radius).fill()

        let inset = tile * 0.14
        let card = NSRect(
            x: origin + inset,
            y: origin + inset,
            width: tile - inset * 2,
            height: tile - inset * 2
        )
        page.setFill()
        roundedRect(card, radius: radius * 0.42).fill()

        let bandHeight = card.height * 0.22
        let band = NSRect(x: card.minX, y: card.minY, width: card.width, height: bandHeight)
        let bandPath = NSBezierPath()
        bandPath.move(to: NSPoint(x: band.minX + radius * 0.42, y: band.minY))
        bandPath.line(to: NSPoint(x: band.maxX - radius * 0.42, y: band.minY))
        bandPath.appendArc(
            withCenter: NSPoint(x: band.maxX - radius * 0.42, y: band.minY + radius * 0.42),
            radius: radius * 0.42,
            startAngle: -90,
            endAngle: 0
        )
        bandPath.line(to: NSPoint(x: band.maxX, y: band.maxY))
        bandPath.line(to: NSPoint(x: band.minX, y: band.maxY))
        bandPath.line(to: NSPoint(x: band.minX, y: band.minY + radius * 0.42))
        bandPath.appendArc(
            withCenter: NSPoint(x: band.minX + radius * 0.42, y: band.minY + radius * 0.42),
            radius: radius * 0.42,
            startAngle: 180,
            endAngle: 270
        )
        bandPath.close()
        header.setFill()
        bandPath.fill()

        let gridTop = card.minY + bandHeight + card.height * 0.08
        let grid = NSRect(
            x: card.minX + card.width * 0.12,
            y: gridTop,
            width: card.width * 0.76,
            height: card.maxY - gridTop - card.height * 0.1
        )
        let cols = 4
        let rows = 3
        let gap = grid.width * 0.08
        let cellW = (grid.width - gap * CGFloat(cols - 1)) / CGFloat(cols)
        let cellH = (grid.height - gap * CGFloat(rows - 1)) / CGFloat(rows)
        for row in 0..<rows {
            for col in 0..<cols {
                let rect = NSRect(
                    x: grid.minX + CGFloat(col) * (cellW + gap),
                    y: grid.minY + CGFloat(row) * (cellH + gap),
                    width: cellW,
                    height: cellH
                )
                let path = roundedRect(rect, radius: cellW * 0.28)
                if row == 1 && col == 2 {
                    header.setFill()
                } else {
                    cell.setFill()
                }
                path.fill()
            }
        }
        return true
    }
    return image
}

func rasterize(pixels: Int, draw: (CGContext) -> Void) -> Data {
    let space = CGColorSpaceCreateDeviceRGB()
    let info = CGImageAlphaInfo.premultipliedLast.rawValue
    guard let ctx = CGContext(
        data: nil,
        width: pixels,
        height: pixels,
        bitsPerComponent: 8,
        bytesPerRow: 0,
        space: space,
        bitmapInfo: info
    ) else {
        fatalError("Could not create bitmap")
    }
    ctx.clear(CGRect(x: 0, y: 0, width: pixels, height: pixels))
    ctx.setShouldAntialias(true)
    ctx.interpolationQuality = .high
    draw(ctx)
    guard let image = ctx.makeImage() else {
        fatalError("Could not create image")
    }
    let rep = NSBitmapImageRep(cgImage: image)
    guard let data = rep.representation(using: .png, properties: [:]) else {
        fatalError("Could not encode PNG")
    }
    return data
}

func pngData(_ image: NSImage, pixels: Int) -> Data {
    rasterize(pixels: pixels) { ctx in
        ctx.translateBy(x: 0, y: CGFloat(pixels))
        ctx.scaleBy(x: 1, y: -1)
        if let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) {
            ctx.draw(cgImage, in: CGRect(x: 0, y: 0, width: pixels, height: pixels))
        }
    }
}

/// Writes an image as PNG at its own size, with no flip. The glyph is drawn
/// top-down in a flipped context, so it must not go through `pngData`, which
/// flips again on the way out.
func pngAtSize(_ image: NSImage) -> Data {
    guard let tiff = image.tiffRepresentation,
          let rep = NSBitmapImageRep(data: tiff),
          let data = rep.representation(using: .png, properties: [:]) else {
        fatalError("Could not encode PNG")
    }
    return data
}

/// Inner window of the calendar: square against the header, rounded at the
/// bottom so it follows the outer squircle.
func bodyHole(_ rect: NSRect, radius: CGFloat) -> NSBezierPath {
    let corner = min(radius, rect.width / 2, rect.height / 2)
    let path = NSBezierPath()
    path.move(to: NSPoint(x: rect.minX, y: rect.minY))
    path.line(to: NSPoint(x: rect.maxX, y: rect.minY))
    path.line(to: NSPoint(x: rect.maxX, y: rect.maxY - corner))
    path.appendArc(
        withCenter: NSPoint(x: rect.maxX - corner, y: rect.maxY - corner),
        radius: corner,
        startAngle: 0,
        endAngle: 90
    )
    path.line(to: NSPoint(x: rect.minX + corner, y: rect.maxY))
    path.appendArc(
        withCenter: NSPoint(x: rect.minX + corner, y: rect.maxY - corner),
        radius: corner,
        startAngle: 90,
        endAngle: 180
    )
    path.close()
    return path
}

struct TrayMetrics {
    let box: CGFloat
    let scale: CGFloat
    let stroke: CGFloat
    let side: CGFloat
    let inset: CGFloat
    let radius: CGFloat
    let header: CGFloat
    let card: NSRect
}

func trayMetrics() -> TrayMetrics {
    // Status items are 18pt tall. A 36px bitmap is 2x and lands 1:1 on retina,
    // so the tray does not have to scale the glyph and soften the edges.
    let box = 36.0
    let scale = 2.0
    let stroke = 1.25 * scale
    let side = 16.0 * scale
    let inset = (box - side) / 2
    let radius = 3.7 * scale
    let header = 4.4 * scale
    return TrayMetrics(
        box: box,
        scale: scale,
        stroke: stroke,
        side: side,
        inset: inset,
        radius: radius,
        header: header,
        card: NSRect(x: inset, y: inset, width: side, height: side)
    )
}

func drawDayNumber(_ day: Int, in hole: NSRect, scale: CGFloat) {
    let text = "\(day)" as NSString
    let fontSize = (day >= 10 ? 7.0 : 9.4) * scale
    let font = NSFont.monospacedDigitSystemFont(ofSize: fontSize, weight: .bold)
    let attributes: [NSAttributedString.Key: Any] = [
        .font: font,
        .foregroundColor: NSColor.black,
    ]
    let size = text.size(withAttributes: attributes)
    text.draw(
        at: NSPoint(
            x: hole.midX - size.width / 2,
            y: hole.midY - size.height / 2 - 0.35 * scale
        ),
        withAttributes: attributes
    )
}

/// Filled rounded calendar with a header bar and the day in the window.
func trayFilled(day: Int?) -> NSImage {
    let m = trayMetrics()
    return NSImage(size: NSSize(width: m.box, height: m.box), flipped: true) { _ in
        NSColor.clear.setFill()
        NSRect(x: 0, y: 0, width: m.box, height: m.box).fill()

        let hole = NSRect(
            x: m.card.minX + m.stroke,
            y: m.card.minY + m.header,
            width: m.card.width - m.stroke * 2,
            height: m.card.height - m.header - m.stroke
        )
        let shape = NSBezierPath()
        shape.append(roundedRect(m.card, radius: m.radius))
        shape.append(bodyHole(hole, radius: max(m.radius - m.stroke, 1.2 * m.scale)))
        shape.windingRule = .evenOdd
        NSColor.black.setFill()
        shape.fill()
        if let day { drawDayNumber(day, in: hole, scale: m.scale) }
        return true
    }
}

/// Undated outline with a quiet grid, so the glyph still reads as a month.
func trayCalendar() -> NSImage {
    let m = trayMetrics()
    return NSImage(size: NSSize(width: m.box, height: m.box), flipped: true) { _ in
        NSColor.clear.setFill()
        NSRect(x: 0, y: 0, width: m.box, height: m.box).fill()

        let card = NSRect(
            x: m.card.minX + m.stroke / 2,
            y: m.card.minY + m.stroke / 2,
            width: m.card.width - m.stroke,
            height: m.card.height - m.stroke
        )
        NSColor.black.setStroke()
        let outline = roundedRect(card, radius: m.radius - m.stroke / 2)
        outline.lineWidth = m.stroke
        outline.stroke()

        NSGraphicsContext.saveGraphicsState()
        roundedRect(m.card, radius: m.radius).addClip()
        NSColor.black.setFill()
        NSRect(x: m.card.minX, y: m.card.minY, width: m.card.width, height: m.header).fill()
        NSGraphicsContext.restoreGraphicsState()

        let padX = 1.55 * m.scale
        let padTop = 1.35 * m.scale
        let padBottom = 1.75 * m.scale
        let headerBottom = m.card.minY + m.header
        let inner = NSRect(
            x: card.minX + m.stroke / 2 + padX,
            y: headerBottom + padTop,
            width: card.width - m.stroke - padX * 2,
            height: card.maxY - headerBottom - m.stroke / 2 - padTop - padBottom
        )
        let cols = 3
        let rows = 2
        let cellW = inner.width / CGFloat(cols)
        let cellH = inner.height / CGFloat(rows)
        let dot = min(cellW, cellH) * 0.48
        for row in 0..<rows {
            for col in 0..<cols {
                let x = inner.minX + (CGFloat(col) + 0.5) * cellW - dot / 2
                let y = inner.minY + (CGFloat(row) + 0.5) * cellH - dot / 2
                NSColor.black.withAlphaComponent(row == 0 && col == 0 ? 1 : 0.4).setFill()
                roundedRect(NSRect(x: x, y: y, width: dot, height: dot), radius: dot * 0.3).fill()
            }
        }
        return true
    }
}

let appIcon = drawAppIcon()
try pngData(appIcon, pixels: 1024).write(to: icons.appendingPathComponent("icon.png"))

let trayDir = icons.appendingPathComponent("tray")
try? FileManager.default.removeItem(at: trayDir)
try FileManager.default.createDirectory(at: trayDir, withIntermediateDirectories: true)
let filledDir = trayDir.appendingPathComponent("filled")
try FileManager.default.createDirectory(at: filledDir, withIntermediateDirectories: true)

try pngAtSize(trayFilled(day: nil)).write(to: icons.appendingPathComponent("tray-icon.png"))
try pngAtSize(trayCalendar()).write(to: trayDir.appendingPathComponent("calendar.png"))
for day in 1...31 {
    let name = String(format: "day-%02d.png", day)
    try pngAtSize(trayFilled(day: day)).write(to: filledDir.appendingPathComponent(name))
}

let iconset = icons.appendingPathComponent("Calendo.iconset")
try? FileManager.default.removeItem(at: iconset)
try FileManager.default.createDirectory(at: iconset, withIntermediateDirectories: true)

let sizes: [(String, Int)] = [
    ("icon_16x16.png", 16),
    ("icon_16x16@2x.png", 32),
    ("icon_32x32.png", 32),
    ("icon_32x32@2x.png", 64),
    ("icon_128x128.png", 128),
    ("icon_128x128@2x.png", 256),
    ("icon_256x256.png", 256),
    ("icon_256x256@2x.png", 512),
    ("icon_512x512.png", 512),
    ("icon_512x512@2x.png", 1024),
]
for (name, pixels) in sizes {
    try pngData(appIcon, pixels: pixels).write(to: iconset.appendingPathComponent(name))
}

let process = Process()
process.executableURL = URL(fileURLWithPath: "/usr/bin/iconutil")
process.arguments = ["-c", "icns", iconset.path, "-o", icons.appendingPathComponent("icon.icns").path]
try process.run()
process.waitUntilExit()
guard process.terminationStatus == 0 else {
    fatalError("iconutil failed")
}

try? FileManager.default.removeItem(at: iconset)
print("Wrote icons in \(icons.path)")
