import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import * as QRCode from 'qrcode';

@Controller('img')
export class MediaController {
  @Get('qr')
  async qr(@Query('data') data: string, @Res() res: Response) {
    const svg = await QRCode.toString(data || 'JITO', { type: 'svg', margin: 1, width: 240 });
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(svg);
  }

  @Get()
  async proxy(@Query('id') id: string, @Res() res: Response) {
    if (!id || !/^[A-Za-z0-9_-]{10,}$/.test(id)) return res.status(400).send('bad id');
    const sources = [
      `https://lh3.googleusercontent.com/d/${id}=w1200`,
      `https://drive.google.com/thumbnail?id=${id}&sz=w1200`,
    ];
    for (const url of sources) {
      try {
        const r = await fetch(url, { redirect: 'follow' });
        const type = r.headers.get('content-type') || '';
        if (r.ok && type.startsWith('image/')) {
          const buf = Buffer.from(await r.arrayBuffer());
          res.setHeader('Content-Type', type);
          res.setHeader('Cache-Control', 'public, max-age=604800');
          return res.send(buf);
        }
      } catch { /* try next */ }
    }
    return res.status(404).send('not found');
  }
}
