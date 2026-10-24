// Capture only by scrolling. Never change inline styles, dimensions, or layers.
export async function scrollCapture(operation = 'inspect', args = {}) {
  const key = '__local_scroll_pdf_v2';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  if (operation === 'restore') {
    const state = window[key];
    if (state) { state.el.scrollTo({left:state.x,top:state.y,behavior:'instant'}); delete window[key]; }
    return;
  }
  if (operation === 'inspect') {
    const frames = [...document.querySelectorAll('iframe[src]')].flatMap(el => {
      const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
      if (r.width < 100 || r.height < 100 || cs.visibility === 'hidden' || cs.display === 'none') return [];
      const hit = document.elementFromPoint(Math.min(innerWidth-1,Math.max(0,r.x+r.width/2)),Math.min(innerHeight-1,Math.max(0,r.y+r.height/2)));
      if (hit !== el) return [];
      return [{url:new URL(el.getAttribute('src'),document.baseURI).href,x:r.x+el.clientLeft,y:r.y+el.clientTop,width:el.clientWidth,height:el.clientHeight}];
    });
    return {url:location.href,frames};
  }
  if (operation === 'start') {
    if (window[key]) throw new Error('Предыдущий захват ещё не завершён');
    const root = document.scrollingElement;
    const candidates = [root,...document.querySelectorAll('body *')].filter(el => {
      const r = el.getBoundingClientRect(), s = getComputedStyle(el);
      return r.width>200 && r.height>150 && r.x<innerWidth && r.y<innerHeight && r.right>0 && r.bottom>0 && s.visibility!=='hidden' && s.display!=='none' &&
        (el===root || /auto|scroll/.test(s.overflowY+' '+s.overflowX)) && (el.scrollHeight>el.clientHeight+8 || el.scrollWidth>el.clientWidth+8);
    });
    // Prefer the large content viewport, excluding tiny sidebars and chat rails.
    const area = el => {
      if(el===root) return innerWidth*innerHeight;
      const r=el.getBoundingClientRect();
      return Math.max(0,Math.min(innerWidth,r.right)-Math.max(0,r.x))*Math.max(0,Math.min(innerHeight,r.bottom)-Math.max(0,r.y));
    };
    candidates.sort((a,b)=>area(b)-area(a));
    const el = candidates[0] || root;
    window[key] = {el,x:el.scrollLeft,y:el.scrollTop};
  }
  const state = window[key];
  if (!state) throw new Error('Не выбрана область прокрутки');
  const el=state.el;
  el.scrollTo({left:args.x||0,top:args.y||0,behavior:'instant'});
  await sleep(250);
  const root=el===document.scrollingElement;
  const r=root?{x:0,y:0}:el.getBoundingClientRect();
  const x=Math.max(0,r.x+(root?0:el.clientLeft));
  const y=Math.max(0,r.y+(root?0:el.clientTop));
  const width=Math.min(root?innerWidth:el.clientWidth,innerWidth-x,args.viewportWidth??innerWidth);
  const height=Math.min(root?innerHeight:el.clientHeight,innerHeight-y,args.viewportHeight??innerHeight);
  if (width<50 || height<50) throw new Error('Область карточки перекрыта или находится вне экрана');
  return {x,y,width,height,left:el.scrollLeft,top:el.scrollTop,totalWidth:el.scrollWidth,totalHeight:el.scrollHeight,root};
}
