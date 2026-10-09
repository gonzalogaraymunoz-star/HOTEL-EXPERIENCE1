import React,{useEffect,useState} from 'react';
import type {Session} from '@supabase/supabase-js';
import OperationsApp from './components/OperationsApp';
import LoginScreen from './components/LoginScreen';
import ErrorBoundary from './components/ErrorBoundary';
import PendingClientTasks from './components/PendingClientTasks';
import NeutralCatalogPage from './components/NeutralCatalogPage';
import {supabase} from './lib/supabase';

export default function App(){
  const isCatalogRoute=window.location.pathname==='/catalogo'||window.location.pathname.startsWith('/catalogo/');
  const [session,setSession]=useState<Session|null|undefined>(undefined);
  const [profile,setProfile]=useState<any>(null);
  const [profileLoading,setProfileLoading]=useState(false);
  const [profileError,setProfileError]=useState('');

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
    setProfileError('');
    void (async()=>{
      try{
        const {data,error}=await supabase.from('profiles').select('*').eq('id',session.user.id).maybeSingle();
        if(!alive)return;
        if(error){setProfileError('No se pudo consultar la asignación de Equipo. Intenta nuevamente o contacta al administrador.');return;}
        // A valid Auth session is not, by itself, an authorization grant.
        // Only an existing, active profile may access the CRM.
        setProfile(data||{id:session.user.id,is_active:false});
      }catch(_error){if(alive)setProfileError('No se pudo validar tu permiso. Vuelve a intentarlo.');}finally{
        if(alive)setProfileLoading(false);
      }
    })();
    return ()=>{alive=false};
  },[session?.user.id]);

  if(isCatalogRoute) return <NeutralCatalogPage/>;
  if(session===undefined) return <div className="app-loading">Cargando Hotel Experience…</div>;
  if(!session) return <LoginScreen/>;
  if(profileLoading) return <div className="app-loading">Preparando operación…</div>;
  if(profileError) return <main className="blocked-screen"><h1>No pudimos verificar tu permiso</h1><p>{profileError}</p><button className="primary-button" onClick={()=>supabase.auth.signOut()}>Cerrar sesión</button></main>;
  if(!profile) return <div className="app-loading">Preparando operación…</div>;
  if(profile.is_active===false) return <main className="blocked-screen"><h1>Cuenta desactivada</h1><p>Solicita acceso a un administrador.</p><button className="primary-button" onClick={()=>supabase.auth.signOut()}>Cerrar sesión</button></main>;
  return <ErrorBoundary><OperationsApp profile={profile}/><PendingClientTasks scope="operations"/></ErrorBoundary>;
}
