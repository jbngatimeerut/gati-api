const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const prisma = new PrismaClient();

async function main() {
  const uploadsDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // A tiny valid 1x1 GIF for placeholder
  const placeholderGif = Buffer.from("R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=", "base64");
  const placeholderPath = path.join(uploadsDir, 'placeholder.jpg'); // Just saving it as .jpg is fine for <img> tags
  fs.writeFileSync(placeholderPath, placeholderGif);

  const members = await prisma.member.findMany();
  for (const m of members) {
    if (m.photoUrl && m.photoUrl.startsWith('/api/uploads/')) {
      const fileName = m.photoUrl.replace('/api/uploads/', '');
      const filePath = path.join(uploadsDir, fileName);
      if (!fs.existsSync(filePath)) {
        fs.copyFileSync(placeholderPath, filePath);
        console.log(`Created placeholder for ${fileName}`);
      }
    }
    
    // Also fix product images if they use /api/uploads/
    if (m.productImages) {
      const imgs = m.productImages.split(',').map(s => s.trim());
      for (const img of imgs) {
        if (img.startsWith('/api/uploads/')) {
          const fileName = img.replace('/api/uploads/', '');
          const filePath = path.join(uploadsDir, fileName);
          if (!fs.existsSync(filePath)) {
            fs.copyFileSync(placeholderPath, filePath);
            console.log(`Created placeholder for ${fileName}`);
          }
        }
      }
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
