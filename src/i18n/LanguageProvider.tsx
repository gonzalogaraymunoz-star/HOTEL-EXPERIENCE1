import React,{createContext,useContext,useEffect,useMemo,useState} from 'react';

export type AppLanguage='es'|'en'|'pt-BR';

type LanguageContextValue={
  language:AppLanguage;
  setLanguage:(language:AppLanguage)=>void;
};

const LanguageContext=createContext<LanguageContextValue>({language:'es',setLanguage:()=>{}});
const STORAGE_KEY='hotel-experience-language';

function normalizeLanguage(raw:string|null|undefined):AppLanguage|null{
  const value=String(raw||'').trim().toLowerCase();
  if(!value)return null;
  if(value==='pt'||value==='pt-br'||value.startsWith('pt-'))return 'pt-BR';
  if(value==='en'||value.startsWith('en-'))return 'en';
  if(value==='es'||value.startsWith('es-'))return 'es';
  return null;
}

function initialLanguage():AppLanguage{
  if(typeof window==='undefined')return 'es';
  const params=new URLSearchParams(window.location.search);
  return normalizeLanguage(params.get('lang'))
    ||normalizeLanguage(window.localStorage.getItem(STORAGE_KEY))
    ||normalizeLanguage(window.navigator.language)
    ||'es';
}

export function LanguageProvider({children}:{children:React.ReactNode}){
  const [language,setLanguageState]=useState<AppLanguage>(initialLanguage);
  const setLanguage=(next:AppLanguage)=>setLanguageState(next);

  useEffect(()=>{
    document.documentElement.lang=language;
    window.localStorage.setItem(STORAGE_KEY,language);
  },[language]);

  const value=useMemo(()=>({language,setLanguage}),[language]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(){return useContext(LanguageContext)};
