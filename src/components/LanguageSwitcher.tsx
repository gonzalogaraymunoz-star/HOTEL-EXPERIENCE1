import React from 'react';
import {Languages} from 'lucide-react';
import {useLanguage,type AppLanguage} from '../i18n/LanguageProvider';
import './LanguageSwitcher.css';

const options:{value:AppLanguage;label:string;title:string}[]=[
  {value:'es',label:'ES',title:'Español'},
  {value:'en',label:'EN',title:'English'},
  {value:'pt-BR',label:'PT',title:'Português (Brasil)'}
];

export default function LanguageSwitcher(){
  const {language,setLanguage}=useLanguage();
  return <div className="he-language-switcher" aria-label="Language / Idioma">
    <span className="he-language-icon"><Languages size={14}/></span>
    {options.map(option=><button
      key={option.value}
      type="button"
      className={language===option.value?'active':''}
      title={option.title}
      aria-pressed={language===option.value}
      onClick={()=>setLanguage(option.value)}
    >{option.label}</button>)}
  </div>;
}
