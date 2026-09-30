const path = require("path");
const fs = require("fs");
const sharp = require("sharp");

async function main() {
  const src = path.resolve(__dirname, "..", "assets", "brand-source.png");
  const out = path.resolve(__dirname, "..", "assets");
  fs.mkdirSync(out, { recursive: true });
  const source = fs.readFileSync(src);
  await sharp(source)
    .resize(1024, 1024)
    .png({ palette: true, quality: 100 })
    .toFile(path.join(out, "icon.png"));
  await sharp(source)
    .resize(1024, 1024)
    .png({ palette: true, quality: 100 })
    .toFile(path.join(out, "adaptive-icon.png"));
  await sharp(source)
    .resize(1024, 1024)
    .png({ palette: true, quality: 100 })
    .toFile(path.join(out, "splash-icon.png"));
  console.log("Nova mobile assets generated.");
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
