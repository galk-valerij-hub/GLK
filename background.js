import {tiledPDF,jpegSize} from './pdf.js';
import {scrollCapture} from './scroll.js';
const busy=new Set();
function base64(bytes){let out='';for(let p=0;p<bytes.length;p+=32768)out+=String.fromCharCode(...bytes.subarray(p,p+32768));return btoa(out);}
chrome.action.onClicked.addListener(async tab=>{
  if(!tab.id||busy.has(tab.id))return;
  busy.add(tab.id);
  const target={tabId:tab.id};let attached=false,frameId=null;
  const badge=text=>chrome.action.setBadgeText({tabId:tab.id,text});
  const run=async(operation,args={})=>{
    const result=await chrome.scripting.executeScript({target:{tabId:tab.id,frameIds:[frameId]},func:scrollCapture,args:[operation,args]});
    if(!result[0]?.result&&operation!=='restore')throw new Error('Не удалось прочитать область страницы');
    return result[0]?.result;
  };
  try{
    if(!/^https?:/.test(tab.url||''))throw new Error('Откройте обычную веб-страницу');
    await badge('…');
    await chrome.action.setTitle({tabId:tab.id,title:'Создаётся PDF. Не переключайте вкладку и не прокручивайте страницу.'});
    await chrome.debugger.attach(target,'1.3');attached=true;
    const frames=await chrome.scripting.executeScript({target:{tabId:tab.id,allFrames:true},func:scrollCapture,args:['inspect']});
    let current=frames.find(f=>f.frameId===0),offset={x:0,y:0},viewport={};
    // Follow the visible frontmost slider, not the board underneath it.
    for(let depth=0;depth<8;depth++){
      const list=current?.result?.frames||[];
      const visible=list.at(-1);
      if(!visible)break;
      const child=frames.find(f=>f.frameId!==current.frameId&&f.result?.url===visible.url);
      if(!child)throw new Error('Нет доступа к рамке карточки. Откройте карточку в отдельной вкладке и повторите.');
      offset.x+=visible.x;offset.y+=visible.y;
      viewport={viewportWidth:visible.width,viewportHeight:visible.height};current=child;
    }
    frameId=current.frameId;
    let view=await run('start',viewport);
    const tiles=[];let totalWidth=view.totalWidth,totalHeight=view.totalHeight;
    const stepX=Math.floor(view.width),stepY=Math.floor(view.height);
    if(Math.ceil(totalWidth/stepX)*Math.ceil(totalHeight/stepY)>160)throw new Error('Слишком много экранов для одного PDF. Уменьшите масштаб Chrome.');
    for(let y=0;y<totalHeight;y+=stepY)for(let x=0;x<totalWidth;x+=stepX){
      const active=await chrome.tabs.get(tab.id);
      if(!active.active)throw new Error('Захват прерван: вкладка перестала быть активной.');
      view=await run('move',{...viewport,x,y});
      totalWidth=Math.max(totalWidth,view.totalWidth);totalHeight=Math.max(totalHeight,view.totalHeight);
      if(tiles.length>=160)throw new Error('Страница продолжает подгружаться: превышен предел 160 снимков.');
      const metrics=await chrome.debugger.sendCommand(target,'Page.getLayoutMetrics');
      const vp=metrics.cssVisualViewport||metrics.visualViewport;
      const shot=await chrome.debugger.sendCommand(target,'Page.captureScreenshot',{
        format:'jpeg',quality:94,fromSurface:true,captureBeyondViewport:false,
        clip:{x:(vp.pageX||0)+offset.x+view.x,y:(vp.pageY||0)+offset.y+view.y,width:view.width,height:view.height,scale:1}
      });
      const jpeg=Uint8Array.from(atob(shot.data),c=>c.charCodeAt(0));
      const size=jpegSize(jpeg);
      tiles.push({jpeg,pixelWidth:size.width,pixelHeight:size.height,x:view.left,y:view.top,width:view.width,height:view.height});
      await badge(String(tiles.length));
    }
    const pdf=tiledPDF(tiles,totalWidth,totalHeight);
    const name=(tab.title||'Страница').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,100);
    const stamp=new Date().toISOString().replace(/[:.]/g,'-').slice(0,19);
    await chrome.downloads.download({url:'data:application/pdf;base64,'+base64(pdf),filename:`Page PDF/${name} ${stamp}.pdf`,saveAs:false});
    await badge('OK');
    await chrome.action.setTitle({tabId:tab.id,title:`PDF передан в загрузки. Снимков: ${tiles.length}.`});
  }catch(error){
    await badge('!').catch(()=>{});
    await chrome.action.setTitle({tabId:tab.id,title:`PDF: ${error.message}`}).catch(()=>{});
    await chrome.tabs.create({url:chrome.runtime.getURL('error.html')+'?message='+encodeURIComponent(error.message)}).catch(()=>{});
    console.error(error);
  }finally{
    if(frameId!==null)await run('restore').catch(console.error);
    if(attached)await chrome.debugger.detach(target).catch(()=>{});
    busy.delete(tab.id);
  }
});
