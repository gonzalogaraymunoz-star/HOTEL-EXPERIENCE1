import React,{useEffect,useState} from 'react';
import type {Session} from '@supabase/supabase-js';
import CRMApp from './components/CRMApp';
import PublicRegistration from './components/PublicRegistration';
import LoginScreen from './components/LoginScreen';
import ErrorBoundary from './components/ErrorBoundary';
import {supabase} from './lib/supabase';

export default function App(){
  const path=window.location.pathname.replace(/\/+$/,'')||'/';
  const [session,setSession]=useState<Session|null|undefined>(undefined);
  const [profile,setProfile]=useState<any>(null);
  const [profileLoading,setProfileLoading]=useState(false);

  useEffect(()=>{
    let alive=true;
    supabase.auth.getSession().then(({data})=>{if(alive)setSession(data.session)}).catch(()=>{if(alive)setSession(null)});
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,next)=>setSession(next));
    return ()=>{alive=false;subscription.unsubscribe()};
  },[]);

  useEffect(()=>{
    if(!session){setProfile(null);return}
    let alive=true;
    setProfileLoading(true);
    void (async()=>{
      try{
        const {data,error}=await supabase.from('profiles').select('*').eq('id',session.user.id).maybeSingle();
        if(!alive)return;
        if(error) console.error('profile',error);
        setProfile(data||{
          id:session.user.id,
          email:session.user.email,
          full_name:session.user.user_metadata?.full_name||session.user.email?.split('@')[0]||'Usuario',
          role:'agent',
          is_active:true
        });
      }finally{
        if(alive)setProfileLoading(false);
      }
    })();
    return ()=>{alive=false};
  },[session?.user.id]);

  if(path==='/registro') return <ErrorBoundary><PublicRegistration/></ErrorBoundary>;
  if(session===undefined) return <div className="app-loading">Cargando Hotel Experience…</div>;
  if(!session) return <LoginScreen/>;
  if(profileLoading||!profile) return <div className="app-loading">Preparando tu CRM…</div>;
  if(profile.is_active===false) return <main className="blocked-screen"><h1>Cuenta desactivada</h1><p>Solicita acceso a un administrador.</p><button className="primary-button" onClick={()=>supabase.auth.signOut()}>Cerrar sesión</button></main>;
  return <ErrorBoundary><CRMApp profile={profile}/></ErrorBoundary>;
}
