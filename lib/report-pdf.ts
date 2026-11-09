import type {ReportDoc,ReportTable} from './record-report.ts';
// PDF export for the website and the Android app. WebView has no print-to-PDF, and PDF fonts can't shape Malayalam,
// Hindi or Arabic, so each A4 page is drawn on a canvas (the browser shapes every script) and stored as an image.
// It needs no library or connection, and nothing about the report leaves the device.
const M=36,SCALE=2,ROW=20;
const ink='#293b31',muted='#5f6b5d',line='#e3e8de',brand='#2d6048',soft='#f3f6ef',out='#a2472f';
export type PdfPage={jpeg:Uint8Array;width:number;height:number;pxWidth:number;pxHeight:number};
const ascii=(s:string)=>Uint8Array.from(s,c=>c.charCodeAt(0)&255);
const hexTitle=(s:string)=>'<FEFF'+Array.from({length:s.length},(_,i)=>s.charCodeAt(i).toString(16).padStart(4,'0')).join('').toUpperCase()+'>';
// A minimal PDF: one page per image, with the cross-reference table readers need to open it.
export function pdfFromJpegs(pages:PdfPage[],title=''){
 const parts:Uint8Array[]=[],offsets:number[]=[];let size=0;
 const put=(b:Uint8Array)=>{parts.push(b);size+=b.length};
 const object=(n:number,head:string,stream?:Uint8Array)=>{offsets[n]=size;put(ascii(`${n} 0 obj\n${head}\n`));if(stream){put(ascii('stream\n'));put(stream);put(ascii('\nendstream\n'))}put(ascii('endobj\n'))};
 put(ascii('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'));
 object(1,'<< /Type /Catalog /Pages 2 0 R >>');
 object(2,`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_,i)=>`${4+i*3} 0 R`).join(' ')}] >>`);
 object(3,`<< /Producer (TWMG) /Title ${hexTitle(title)} >>`);
 pages.forEach((p,i)=>{
  const n=4+i*3,content=ascii(`q ${p.width} 0 0 ${p.height} 0 0 cm /Im0 Do Q`);
  object(n,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${p.width} ${p.height}] /Contents ${n+1} 0 R /Resources << /XObject << /Im0 ${n+2} 0 R >> >> >>`);
  object(n+1,`<< /Length ${content.length} >>`,content);
  object(n+2,`<< /Type /XObject /Subtype /Image /Width ${p.pxWidth} /Height ${p.pxHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>`,p.jpeg);
 });
 const count=4+pages.length*3,start=size;
 put(ascii(`xref\n0 ${count}\n0000000000 65535 f \n`+Array.from({length:count-1},(_,i)=>`${String(offsets[i+1]).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Size ${count} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${start}\n%%EOF\n`));
 const out=new Uint8Array(size);let at=0;for(const b of parts){out.set(b,at);at+=b.length}
 return out;
}
function fit(ctx:CanvasRenderingContext2D,value:string,max:number){
 if(ctx.measureText(value).width<=max)return value;
 // Whole characters only: cutting a Malayalam or Hindi cluster in half would draw a broken letter.
 const parts=typeof Intl.Segmenter==='function'?[...new Intl.Segmenter().segment(value)].map(s=>s.segment):Array.from(value);
 let low=0,high=parts.length;
 while(low<high){const mid=Math.ceil((low+high)/2);if(ctx.measureText(parts.slice(0,mid).join('')+'…').width<=max)low=mid;else high=mid-1}
 return parts.slice(0,low).join('')+'…';
}
function wrap(ctx:CanvasRenderingContext2D,value:string,max:number){
 const lines:string[]=[];let current='';
 for(const word of value.split(/\s+/)){const next=current?current+' '+word:word;if(ctx.measureText(next).width>max&&current){lines.push(current);current=word}else current=next}
 if(current)lines.push(current);
 return lines;
}
type Paint=(ctx:CanvasRenderingContext2D)=>void;
export type PdfLabels={brand:string;generated:string;page:(n:number,total:number)=>string};
export async function reportPdf(doc:ReportDoc,labels:PdfLabels){
 const W=doc.landscape?842:595,H=doc.landscape?595:842;
 const canvas=document.createElement('canvas');canvas.width=W*SCALE;canvas.height=H*SCALE;
 const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw Error('Canvas is not available.');
 const rtl=document.documentElement.dir==='rtl',family=getComputedStyle(document.body).fontFamily||'sans-serif';
 const font=(size:number,weight=400)=>`${weight} ${size}px ${family}`;
 const words=[doc.title,doc.subtitle,doc.period,doc.note||'',...doc.tiles.flatMap(t=>[t.label,t.value]),...doc.tables.flatMap(t=>[t.title,...t.columns.map(c=>c.label),...t.rows.flatMap(r=>r.cells)])].join(' ');
 // Web fonts load per script on first use; ask for these characters before drawing them.
 try{await Promise.all([400,600,700].map(w=>document.fonts.load(font(16,w),words.slice(0,4000))));await document.fonts.ready}catch{/* the system font still draws every script */}
 ctx.setTransform(SCALE,0,0,SCALE,0,0);ctx.textBaseline='middle';
 try{ctx.direction=rtl?'rtl':'ltr'}catch{/* older browsers lay text out left to right */}
 const X=(x:number)=>rtl?W-x:x;
 const text=(c:CanvasRenderingContext2D,value:string,x:number,y:number,size:number,color=ink,weight=400,max=W,end=false)=>{c.font=font(size,weight);c.fillStyle=color;c.textAlign=end?'end':'start';c.fillText(fit(c,value,max),X(x),y)};
 const box=(c:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,fill:string)=>{c.fillStyle=fill;c.fillRect(rtl?W-x-w:x,y,w,h)};
 const pages:Paint[][]=[[]];let y=M;
 const add=(p:Paint)=>pages[pages.length-1].push(p);
 const bottom=H-M-18;
 const continuation=()=>{pages.push([]);y=M;const title=doc.title;add(c=>{text(c,labels.brand,M,y0(),12,brand,700,90);text(c,title,M+100,y0(),9,muted,400,W-2*M-100,false)});y+=24};
 const y0=()=>M+6;
 // Masthead, first page only.
 add(c=>{text(c,labels.brand,M,M+9,20,brand,700,200);text(c,labels.generated,W-M,M+9,9,muted,400,240,true);box(c,M,M+25,W-2*M,1,line)});y=M+44;
 ctx.font=font(20,700);const titleY=y;add(c=>text(c,doc.title,M,titleY,20,ink,700,W-2*M));y+=23;
 const subY=y;add(c=>text(c,`${doc.subtitle} · ${doc.period}`,M,subY,10,muted,400,W-2*M));y+=24;
 const cols=3,gap=8,tileW=(W-2*M-gap*(cols-1))/cols,tileH=52;
 doc.tiles.forEach((t,i)=>{const col=i%cols,rowN=Math.floor(i/cols),tx=M+col*(tileW+gap),ty=y+rowN*(tileH+gap);add(c=>{box(c,tx,ty,tileW,tileH,soft);text(c,t.label,tx+10,ty+16,9,muted,400,tileW-20);let size=14;c.font=font(size,700);while(size>8&&c.measureText(t.value).width>tileW-20){size-=1;c.font=font(size,700)}text(c,t.value,tx+10,ty+35,size,ink,700,tileW-20)})});
 y+=Math.ceil(doc.tiles.length/cols)*(tileH+gap)+8;
 if(doc.note){ctx.font=font(10);for(const l of wrap(ctx,doc.note,W-2*M)){const ly=y;add(c=>text(c,l,M,ly,10,muted,400,W-2*M));y+=15}y+=8}
 const header=(t:ReportTable)=>{const hy=y,width=W-2*M;add(c=>{box(c,M,hy,width,ROW,soft);let x=M;for(const col of t.columns){const w=col.width*width;text(c,col.label,col.end?x+w-6:x+6,hy+ROW/2,9,muted,600,w-12,col.end);x+=w}});y+=ROW};
 for(const t of doc.tables){
  if(y+24+ROW*2>bottom)continuation();
  const ty=y+8;add(c=>text(c,t.title,M,ty,12,ink,700,W-2*M));y+=22;
  header(t);
  if(!t.rows.length){const ey=y+ROW/2;add(c=>text(c,t.empty||'',M+6,ey,10,muted,400,W-2*M-12));y+=ROW}
  for(const r of t.rows){
   if(y+ROW>bottom){continuation();header(t)}
   const ry=y,width=W-2*M;add(c=>{box(c,M,ry+ROW-.5,width,.5,line);let x=M;r.cells.forEach((v,i)=>{const col=t.columns[i],w=col.width*width,last=i===r.cells.length-1;text(c,v,col.end?x+w-6:x+6,ry+ROW/2,9.5,last&&r.tone==='in'?brand:last&&r.tone==='out'?out:ink,last?600:400,w-12,col.end);x+=w})});y+=ROW;
  }
  y+=14;
 }
 const out_:PdfPage[]=[];
 for(let i=0;i<pages.length;i++){
  ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);
  for(const p of pages[i])p(ctx);
  box(ctx,M,H-M-8,W-2*M,.5,line);text(ctx,'The Way Money Goes',M,H-M+2,8,muted,400,240);text(ctx,labels.page(i+1,pages.length),W-M,H-M+2,8,muted,400,200,true);
  const data=atob(canvas.toDataURL('image/jpeg',.9).split(',')[1]);
  out_.push({jpeg:ascii(data),width:W,height:H,pxWidth:canvas.width,pxHeight:canvas.height});
  // Let the screen stay responsive on long reports.
  await new Promise(r=>setTimeout(r));
 }
 return new Blob([pdfFromJpegs(out_,`${doc.title} - ${doc.subtitle}`) as BlobPart],{type:'application/pdf'});
}
// In the Android app the native download hook picks this up and saves to Downloads.
export function saveBlob(name:string,blob:Blob){const a=document.createElement('a'),url=URL.createObjectURL(blob);a.href=url;a.download=name;a.style.display='none';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)}
