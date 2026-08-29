import React,{useEffect,useState} from 'react';
import {ArrowLeft,Home,Users,CalendarDays,WalletCards,Menu} from 'lucide-react';
import {createPortal} from 'react-dom';
import './MobileNavigationEnhancement.css';

const routes=[
  {label:'Inicio',icon:<Home/>,key:'inicio'},
  {label:'Clientes',icon:<Users/>,key:'clientes'},
  {label:'Calendario',icon:<CalendarDays/>,key:'calendario'},
  {label:'Pagos',icon:<WalletCards/>,key:'pagos'},
  {label:'Más',icon:<Menu/>,key:'mas'}
];

function clickNav(label:string){
  const buttons=Array.from(document.querySelectorAll<HTMLButtonElement>('.sidebar .nav-item'));
  const button=buttons.find(x=>String(x.textContent||'').trim().toLowerCase().includes(label.toLowerCase()));
  if(button)button.click();
}

export default function MobileNavigationEnhancement(){
  const [topbar,setTopbar]=useState<Element|null>(null);
  const [current,setCurrent]=useState('Inicio');
  const [canBack,setCanBack]=useState(false);

  useEffect(()=>{
    let cancelled=false;let tries=0;
    const bind=()=>{
      if(cancelled)return;
      const host=document.querySelector('.crm-topbar');
      if(host)setTopbar(host);
      if(!host&&tries++<30)setTimeout(bind,100);
    };
    bind();
    return()=>{cancelled=true};
  },[]);

  useEffect(()=>{
    const sync=()=>{
      const active=document.querySelector('.sidebar .nav-item.active');
      setCurrent(String(active?.textContent||'Inicio').trim().split(/\s+/)[0]);
      setCanBack(Number(sessionStorage.getItem('he-nav-depth')||'0')>0);
    };
    const onNavClick=(event:MouseEvent)=>{
      const target=event.target as HTMLElement|null;
      const button=target?.closest('.sidebar .nav-item') as HTMLElement|null;
      if(!button||(window as any).__heGoingBack)return;
      const label=String(button.textContent||'').trim().split(/\s+/)[0]||'Inicio';
      const depth=Number(sessionStorage.getItem('he-nav-depth')||'0')+1;
      sessionStorage.setItem('he-nav-depth',String(depth));
      window.history.pushState({heView:label},'',`#${encodeURIComponent(label.toLowerCase())}`);
      setTimeout(sync,0);
    };
    const onPop=()=>{
      const depth=Math.max(0,Number(sessionStorage.getItem('he-nav-depth')||'0')-1);
      sessionStorage.setItem('he-nav-depth',String(depth));
      setTimeout(sync,0);
    };
    document.addEventListener('click',onNavClick,true);
    window.addEventListener('popstate',onPop);
    const observer=new MutationObserver(sync);
    const nav=document.querySelector('.sidebar nav');
    if(nav)observer.observe(nav,{subtree:true,attributes:true,attributeFilter:['class']});
    sync();
    return()=>{document.removeEventListener('click',onNavClick,true);window.removeEventListener('popstate',onPop);observer.disconnect()};
  },[]);

  const back=()=>{
    if(!canBack)return;
    (window as any).__heGoingBack=true;
    window.history.back();
    setTimeout(()=>{(window as any).__heGoingBack=false},150);
  };

  const go=(key:string)=>{
    if(key==='inicio')clickNav('Inicio');
    else if(key==='clientes')clickNav('Clientes');
    else if(key==='calendario')clickNav('Calendario');
    else if(key==='pagos')clickNav('Pagos');
    else document.querySelector('.sidebar nav')?.scrollTo({left:9999,behavior:'smooth'});
  };

  const backPortal=topbar&&createPortal(<button className="he-back-button" onClick={back} disabled={!canBack} aria-label="Volver a la pantalla anterior"><ArrowLeft size={18}/><span>Volver</span></button>,topbar);
  const mobilePortal=createPortal(<nav className="he-mobile-nav" aria-label="Navegación principal móvil">{routes.map(item=><button key={item.key} className={current.toLowerCase().startsWith(item.label.toLowerCase().split(' ')[0])?'active':''} onClick={()=>go(item.key)}>{item.icon}<span>{item.label}</span></button>)}</nav>,document.body);
  return <>{backPortal}{mobilePortal}</>;
}
