const path=require('path');
const fs=require('fs');
const sharp=require('sharp');

async function main(){
  const src=path.resolve(__dirname,'..','..','nova-avatar.svg');
  const out=path.resolve(__dirname,'..','assets');
  fs.mkdirSync(out,{recursive:true});
  const svg=fs.readFileSync(src);
  await sharp(svg).resize(1024,1024).png().toFile(path.join(out,'icon.png'));
  await sharp(svg).resize(1024,1024).png().toFile(path.join(out,'adaptive-icon.png'));
  await sharp(svg).resize(1024,1024).png().toFile(path.join(out,'splash-icon.png'));
  console.log('Nova mobile assets generated.');
}
main().catch(err=>{console.error(err);process.exit(1)});
