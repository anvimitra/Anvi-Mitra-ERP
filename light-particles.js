/* LSKLive light-section particle field — additive and pointer-reactive. */
(()=>{
  const start=()=>{
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    const targets=[...document.querySelectorAll('section')].filter(s=>{
      const bg=getComputedStyle(s).backgroundColor;
      const m=bg.match(/rgba?\(([^)]+)\)/); if(!m)return true;
      const v=m[1].split(',').slice(0,3).map(Number); return v.every(n=>n>215);
    });
    const fallback=['#about','#facilities','.principal','.gallery'].map(x=>document.querySelector(x)).filter(Boolean);
    [...new Set([...targets,...fallback])].forEach(section=>{
      if(section.dataset.particlesAdded)return;
      section.dataset.particlesAdded='1';section.classList.add('lsk-particle-section');
      const canvas=document.createElement('canvas');canvas.className='lsk-light-particles';canvas.setAttribute('aria-hidden','true');section.insertBefore(canvas,section.firstChild);
      const ctx=canvas.getContext('2d',{alpha:true});let w=0,h=0,dpr=1,particles=[],mx=-9999,my=-9999;
      const resize=()=>{const r=section.getBoundingClientRect();w=Math.max(1,r.width);h=Math.max(1,r.height);dpr=Math.min(devicePixelRatio||1,2);canvas.width=w*dpr;canvas.height=h*dpr;canvas.style.width=w+'px';canvas.style.height=h+'px';ctx.setTransform(dpr,0,0,dpr,0,0);const count=Math.min(85,Math.max(32,Math.floor(w*h/14000)));particles=Array.from({length:count},()=>({x:Math.random()*w,y:Math.random()*h,vx:(Math.random()-.5)*.24,vy:(Math.random()-.5)*.24,r:.9+Math.random()*1.7,p:Math.random()*6.28}));};
      section.addEventListener('pointermove',e=>{const r=section.getBoundingClientRect();mx=e.clientX-r.left;my=e.clientY-r.top},{passive:true});section.addEventListener('pointerleave',()=>{mx=-9999;my=-9999},{passive:true});window.addEventListener('resize',resize,{passive:true});resize();
      const draw=()=>{ctx.clearRect(0,0,w,h);for(const p of particles){const dx=mx-p.x,dy=my-p.y,d=Math.hypot(dx,dy);if(d<190&&d>1){p.vx+=dx/d*.012;p.vy+=dy/d*.012;}p.vx*=.997;p.vy*=.997;p.x+=p.vx;p.y+=p.vy;if(p.x<-5)p.x=w+5;if(p.x>w+5)p.x=-5;if(p.y<-5)p.y=h+5;if(p.y>h+5)p.y=-5;p.p+=.015;const a=.34+.18*Math.sin(p.p);ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fillStyle=`rgba(25,83,155,${a})`;ctx.fill();}
        for(let i=0;i<particles.length;i++)for(let j=i+1;j<particles.length;j++){const a=particles[i],b=particles[j],dx=a.x-b.x,dy=a.y-b.y,d=Math.hypot(dx,dy);if(d<115){ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.strokeStyle=`rgba(25,83,155,${.085*(1-d/115)})`;ctx.lineWidth=.75;ctx.stroke();}}
        if(mx>-1000){const g=ctx.createRadialGradient(mx,my,0,mx,my,210);g.addColorStop(0,'rgba(40,110,210,.14)');g.addColorStop(1,'rgba(40,110,210,0)');ctx.fillStyle=g;ctx.fillRect(mx-210,my-210,420,420);}requestAnimationFrame(draw)};draw();
    });
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
