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

func trayPng() -> Data {
    let pixels = 44
    return rasterize(pixels: pixels) { ctx in
        let inset: CGFloat = 5
        let card = CGRect(
            x: inset,
            y: inset + 1,
            width: CGFloat(pixels) - inset * 2,
            height: CGFloat(pixels) - inset * 2 - 2
        )
        ctx.setStrokeColor(NSColor.black.cgColor)
        ctx.setLineWidth(2)
        ctx.setLineJoin(.round)
        ctx.setLineCap(.round)
        ctx.addPath(CGPath(roundedRect: card, cornerWidth: 6, cornerHeight: 6, transform: nil))
        ctx.strokePath()

        let headerY = card.maxY - 11
        ctx.move(to: CGPoint(x: card.minX, y: headerY))
        ctx.addLine(to: CGPoint(x: card.maxX, y: headerY))
        ctx.strokePath()

        for x in [card.minX + 8, card.midX, card.maxX - 8] {
            ctx.move(to: CGPoint(x: x, y: card.maxY + 1))
            ctx.addLine(to: CGPoint(x: x, y: card.maxY - 5))
            ctx.strokePath()
        }
    }
}

let appIcon = drawAppIcon()
try pngData(appIcon, pixels: 1024).write(to: icons.appendingPathComponent("icon.png"))
try trayPng().write(to: icons.appendingPathComponent("tray-icon.png"))

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
