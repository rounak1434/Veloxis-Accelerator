const fs = require('fs');
const path = require('path');

function createIconFile(outputPath) {
  const width = 32;
  const height = 32;
  const xorSize = width * height * 4;
  const andSize = Math.ceil(width / 32) * 4 * height; // 4 bytes per row * 32 rows = 128 bytes
  const bihSize = 40;
  const bytesInRes = bihSize + xorSize + andSize;
  const offset = 6 + 16;

  const buf = Buffer.alloc(offset + bytesInRes);

  // 1. ICONDIR
  buf.writeUInt16LE(0, 0); // Reserved
  buf.writeUInt16LE(1, 2); // 1 = ICO
  buf.writeUInt16LE(1, 4); // 1 image

  // 2. ICONDIRENTRY
  buf.writeUInt8(width, 6);
  buf.writeUInt8(height, 7);
  buf.writeUInt8(0, 8); // No palette
  buf.writeUInt8(0, 9); // Reserved
  buf.writeUInt16LE(1, 10); // Color planes
  buf.writeUInt16LE(32, 12); // Bits per pixel
  buf.writeUInt32LE(bytesInRes, 14); // Image size in bytes
  buf.writeUInt32LE(offset, 18); // Offset to image data

  // 3. BITMAPINFOHEADER
  let p = offset;
  buf.writeUInt32LE(40, p); p += 4; // biSize
  buf.writeInt32LE(width, p); p += 4; // biWidth
  buf.writeInt32LE(height * 2, p); p += 4; // biHeight (XOR + AND)
  buf.writeUInt16LE(1, p); p += 2; // biPlanes
  buf.writeUInt16LE(32, p); p += 2; // biBitCount
  buf.writeUInt32LE(0, p); p += 4; // biCompression (BI_RGB)
  buf.writeUInt32LE(xorSize, p); p += 4; // biSizeImage
  buf.writeInt32LE(0, p); p += 4; // biXPelsPerMeter
  buf.writeInt32LE(0, p); p += 4; // biYPelsPerMeter
  buf.writeUInt32LE(0, p); p += 4; // biClrUsed
  buf.writeUInt32LE(0, p); p += 4; // biClrImportant

  // Draw 32x32 image: rounded obsidian badge with cyan electric bolt ⚡
  // BMP rows are bottom-up: y=0 is bottom row, y=31 is top row
  for (let y = 0; y < height; y++) {
    const row = height - 1 - y; // true visual Y (0 is top)
    for (let x = 0; x < width; x++) {
      const pixelOffset = p + (y * width + x) * 4;

      // Distance from center for rounded square badge
      const dx = Math.abs(x - 15.5);
      const dy = Math.abs(row - 15.5);
      const inBadge = (dx <= 14 && dy <= 14) && !(dx > 11 && dy > 11 && (dx - 11) * (dx - 11) + (dy - 11) * (dy - 11) > 9);

      if (!inBadge) {
        // Transparent
        buf.writeUInt32LE(0, pixelOffset);
        continue;
      }

      // Check if pixel is inside the lightning bolt symbol
      // Lightning bolt geometry: top part slanted down-left, horizontal shelf, bottom part slanted to point
      let isBolt = false;
      let isCore = false;

      // Bolt points approx:
      // (18, 4) -> (10, 16) -> (16, 16) -> (13, 28) -> (22, 14) -> (16, 14) -> (18, 4)
      if (row >= 4 && row <= 15) {
        const t = (row - 4) / 11;
        const leftEdge = 17 - t * 7;
        const rightEdge = 21 - t * 6;
        if (x >= leftEdge - 1.5 && x <= rightEdge + 1.5) isBolt = true;
        if (x >= leftEdge && x <= rightEdge) isCore = true;
      }
      if (row >= 13 && row <= 16 && x >= 11 && x <= 22) {
        isBolt = true;
        if (x >= 12 && x <= 20) isCore = true;
      }
      if (row >= 15 && row <= 28) {
        const t = (row - 15) / 13;
        const leftEdge = 16 - t * 4;
        const rightEdge = 21 - t * 8;
        if (x >= Math.min(leftEdge, rightEdge) - 1.5 && x <= Math.max(leftEdge, rightEdge) + 1.5) isBolt = true;
        if (x >= Math.min(leftEdge, rightEdge) && x <= Math.max(leftEdge, rightEdge)) isCore = true;
      }

      if (isCore) {
        // Core lightning: Vibrant Cyan / Aqua White (BGR: 255, 255, 255 or 255, 230, 0)
        buf.writeUInt8(255, pixelOffset);     // Blue
        buf.writeUInt8(240, pixelOffset + 1); // Green
        buf.writeUInt8(200, pixelOffset + 2); // Red
        buf.writeUInt8(255, pixelOffset + 3); // Alpha
      } else if (isBolt) {
        // Outer cyan glow: (BGR: 250, 180, 0)
        buf.writeUInt8(255, pixelOffset);     // Blue
        buf.writeUInt8(190, pixelOffset + 1); // Green
        buf.writeUInt8(30, pixelOffset + 2);  // Red
        buf.writeUInt8(255, pixelOffset + 3); // Alpha
      } else {
        // Obsidian background (#0e111a) with subtle border
        const isBorder = (dx >= 13.2 || dy >= 13.2);
        if (isBorder) {
          buf.writeUInt8(70, pixelOffset);      // Blue
          buf.writeUInt8(50, pixelOffset + 1);  // Green
          buf.writeUInt8(35, pixelOffset + 2);  // Red
          buf.writeUInt8(255, pixelOffset + 3); // Alpha
        } else {
          buf.writeUInt8(24, pixelOffset);      // Blue
          buf.writeUInt8(16, pixelOffset + 1);  // Green
          buf.writeUInt8(12, pixelOffset + 2);  // Red
          buf.writeUInt8(255, pixelOffset + 3); // Alpha
        }
      }
    }
  }

  // AND mask: all 0 for 32-bit ARGB
  // Already 0 from Buffer.alloc

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buf);
  console.log(`Generated icon at: ${outputPath} (${buf.length} bytes)`);
}

module.exports = { createIconFile };

if (require.main === module) {
  createIconFile(path.join(__dirname, '..', 'assets', 'icon.ico'));
}
