// One raster image on one PDF page. Binary offsets are measured in bytes.
export function imagePDF(jpeg, width, height) {
  const scale = Math.min(0.75, 14000 / Math.max(width, height));
  const w = +(width * scale).toFixed(3), h = +(height * scale).toFixed(3);
  const parts = [], offsets = [0]; let length = 0;
  const add = value => {
    const b = typeof value === 'string' ? new TextEncoder().encode(value) : value;
    parts.push(b); length += b.length;
  };
  const obj = (n, value) => { offsets[n] = length; add(`${n} 0 obj\n${value}\nendobj\n`); };
  add('%PDF-1.4\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  offsets[4] = length;
  add(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
  add(jpeg); add('\nendstream\nendobj\n');
  const stream = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q\n`;
  obj(5, `<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
  const xref = length;
  add('xref\n0 6\n0000000000 65535 f \n');
  for (let i = 1; i <= 5; i++) add(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  add(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const result = new Uint8Array(length); let p = 0;
  for (const part of parts) { result.set(part, p); p += part.length; }
  return result;
}

export function jpegSize(bytes) {
  for (let p = 2; p < bytes.length;) {
    if (bytes[p++] !== 255) throw new Error('Некорректный JPEG');
    const marker = bytes[p++];
    const length = (bytes[p] << 8) | bytes[p + 1];
    if ([192,193,194].includes(marker)) return {height: (bytes[p+3]<<8)|bytes[p+4], width:(bytes[p+5]<<8)|bytes[p+6]};
    if (length < 2) break;
    p += length;
  }
  throw new Error('Не удалось определить размер снимка');
}

// Place viewport tiles directly in PDF; no canvas size limit and no page reflow.
export function tiledPDF(tiles,width,height){
 const scale=Math.min(0.75,14000/Math.max(width,height));
 const parts=[],offsets=[0];let length=0;
 const add=value=>{const b=typeof value==='string'?new TextEncoder().encode(value):value;parts.push(b);length+=b.length;};
 const obj=(id,value)=>{offsets[id]=length;add(`${id} 0 obj\n${value}\nendobj\n`);};
 const contentId=4+tiles.length;
 add('%PDF-1.4\n');
 obj(1,'<< /Type /Catalog /Pages 2 0 R >>');
 obj(2,'<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
 const resources=tiles.map((_,i)=>`/Im${i} ${4+i} 0 R`).join(' ');
 obj(3,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width*scale} ${height*scale}] /Resources << /XObject << ${resources} >> >> /Contents ${contentId} 0 R >>`);
 let stream='';
 for(let i=0;i<tiles.length;i++){
  const t=tiles[i],id=4+i;offsets[id]=length;
  add(`${id} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${t.pixelWidth} /Height ${t.pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${t.jpeg.length} >>\nstream\n`);
  add(t.jpeg);add('\nendstream\nendobj\n');
  stream+=`q ${t.width*scale} 0 0 ${t.height*scale} ${t.x*scale} ${(height-t.y-t.height)*scale} cm /Im${i} Do Q\n`;
 }
 obj(contentId,`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
 const xref=length,count=contentId+1;
 add(`xref\n0 ${count}\n0000000000 65535 f \n`);
 for(let i=1;i<count;i++)add(`${String(offsets[i]).padStart(10,'0')} 00000 n \n`);
 add(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
 const result=new Uint8Array(length);let p=0;for(const b of parts){result.set(b,p);p+=b.length;}return result;
}
