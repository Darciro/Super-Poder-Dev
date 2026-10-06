// Renders an SVG to a square PNG keeping its transparency (QuickLook fills it white).
//
// Usage: swift scripts/render-svg.swift <source.svg> <size in px> <target.png>

import AppKit

let arguments = CommandLine.arguments

guard arguments.count == 4, let size = Int(arguments[2]) else {
    fputs("Usage: swift render-svg.swift <source.svg> <size> <target.png>\n", stderr)
    exit(1)
}

guard let image = NSImage(contentsOf: URL(fileURLWithPath: arguments[1])) else {
    fputs("Could not read \(arguments[1])\n", stderr)
    exit(1)
}

let bitmap = NSBitmapImageRep(
    bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8,
    samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
    bytesPerRow: 0, bitsPerPixel: 0
)!
let canvas = NSRect(x: 0, y: 0, width: size, height: size)
bitmap.size = canvas.size

NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
NSColor.clear.set()
canvas.fill(using: .copy)
image.draw(in: canvas)
NSGraphicsContext.restoreGraphicsState()

try bitmap.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: arguments[3]))
