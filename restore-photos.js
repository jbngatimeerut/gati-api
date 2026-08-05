const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const prisma = new PrismaClient();

const PROD_BASE = 'https://34-9-69-227.sslip.io';

async function main() {
  const uploadsDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const members = await prisma.member.findMany();
  let downloadedCount = 0;
  
  for (const m of members) {
    if (m.photoUrl && m.photoUrl.startsWith('/api/uploads/')) {
      const fileName = m.photoUrl.replace('/api/uploads/', '');
      const filePath = path.join(uploadsDir, fileName);
      
      const prodUrl = PROD_BASE + m.photoUrl;
      try {
        console.log(`Downloading ${prodUrl}...`);
        execSync(`curl -sL "${prodUrl}" -o "${filePath}"`);
        downloadedCount++;
      } catch (e) {
        console.log(`Failed to find ${fileName} on production.`);
      }
    }
    
    if (m.productImages) {
      const imgs = m.productImages.split(',').map(s => s.trim());
      for (const img of imgs) {
        if (img.startsWith('/api/uploads/')) {
          const fileName = img.replace('/api/uploads/', '');
          const filePath = path.join(uploadsDir, fileName);
          const prodUrl = PROD_BASE + img;
          try {
             console.log(`Downloading ${prodUrl}...`);
             execSync(`curl -sL "${prodUrl}" -o "${filePath}"`);
             downloadedCount++;
          } catch (e) {
            console.log(`Failed to download ${fileName}`);
          }
        }
      }
    }
  }
  
  // Also get the products
  const products = await prisma.product.findMany();
  for (const p of products) {
    if (p.images) {
      const imgs = p.images.split(',').map(s => s.trim());
      for (const img of imgs) {
        if (img.startsWith('/api/uploads/')) {
          const fileName = img.replace('/api/uploads/', '');
          const filePath = path.join(uploadsDir, fileName);
          const prodUrl = PROD_BASE + img;
          try {
             console.log(`Downloading ${prodUrl}...`);
             execSync(`curl -sL "${prodUrl}" -o "${filePath}"`);
             downloadedCount++;
          } catch (e) {
            console.log(`Failed to download ${fileName}`);
          }
        }
      }
    }
  }

  // Categories
  const categories = await prisma.category.findMany();
  for (const c of categories) {
    if (c.imageUrl && c.imageUrl.startsWith('/api/uploads/')) {
      const fileName = c.imageUrl.replace('/api/uploads/', '');
      const filePath = path.join(uploadsDir, fileName);
      const prodUrl = PROD_BASE + c.imageUrl;
      try {
         console.log(`Downloading ${prodUrl}...`);
         execSync(`curl -sL "${prodUrl}" -o "${filePath}"`);
         downloadedCount++;
      } catch (e) {
        console.log(`Failed to download ${fileName}`);
      }
    }
  }
  
  // Chapter images
  const chapters = await prisma.chapter.findMany();
  for (const c of chapters) {
    if (c.logoUrl && c.logoUrl.startsWith('/api/uploads/')) {
      const fileName = c.logoUrl.replace('/api/uploads/', '');
      const filePath = path.join(uploadsDir, fileName);
      const prodUrl = PROD_BASE + c.logoUrl;
      try {
         console.log(`Downloading ${prodUrl}...`);
         execSync(`curl -sL "${prodUrl}" -o "${filePath}"`);
         downloadedCount++;
      } catch (e) {
        console.log(`Failed to download ${fileName}`);
      }
    }
  }
  
  console.log(`Restoration complete! Downloaded ${downloadedCount} original images.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
