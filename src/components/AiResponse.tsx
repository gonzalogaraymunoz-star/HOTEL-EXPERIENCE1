import React,{Fragment} from 'react';
import './AiResponse.css';

type Props={content:string;mode?:string};
type Block=
  |{type:'heading';level:2|3|4;text:string}
  |{type:'paragraph';text:string}
  |{type:'ul';items:string[]}
  |{type:'ol';items:string[]}
  |{type:'rule'}
  |{type:'table';lines:string[]};

const structural=(line:string)=>/^(#{1,3}\s+|[-*]\s+|\d+\.\s+|---+$|\|)/.test(line.trim());

function parseBlocks(content:string):Block[]{
  const lines=String(content||'').replace(/\r/g,'').split('\n');
  const blocks:Block[]=[];
  let i=0;
  while(i<lines.length){
    const line=lines[i].trim();
    if(!line){i++;continue;}
    if(/^---+$/.test(line)){blocks.push({type:'rule'});i++;continue;}
    const heading=line.match(/^(#{1,3})\s+(.+)$/);
    if(heading){
      const level=(heading[1].length===1?2:heading[1].length===2?3:4) as 2|3|4;
      blocks.push({type:'heading',level,text:heading[2].trim()});i++;continue;
    }
    if(/^[-*]\s+/.test(line)){
      const items:string[]=[];
      while(i<lines.length&&/^[-*]\s+/.test(lines[i].trim())){
        items.push(lines[i].trim().replace(/^[-*]\s+/,''));i++;
      }
      blocks.push({type:'ul',items});continue;
    }
    if(/^\d+\.\s+/.test(line)){
      const items:string[]=[];
      while(i<lines.length&&/^\d+\.\s+/.test(lines[i].trim())){
        items.push(lines[i].trim().replace(/^\d+\.\s+/,''));i++;
      }
      blocks.push({type:'ol',items});continue;
    }
    if(line.startsWith('|')){
      const table:string[]=[];
      while(i<lines.length&&lines[i].trim().startsWith('|')){table.push(lines[i].trim());i++;}
      blocks.push({type:'table',lines:table});continue;
    }
    const paragraph=[line];i++;
    while(i<lines.length&&lines[i].trim()&&!structural(lines[i])){
      paragraph.push(lines[i].trim());i++;
    }
    blocks.push({type:'paragraph',text:paragraph.join(' ')});
  }
  return blocks;
}

function Inline({text}:{text:string}){
  const parts=text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean);
  return <>{parts.map((part,index)=>{
    if(part.startsWith('**')&&part.endsWith('**')) return <strong key={index}>{part.slice(2,-2)}</strong>;
    if(part.startsWith('`')&&part.endsWith('`')) return <code key={index}>{part.slice(1,-1)}</code>;
    return <Fragment key={index}>{part}</Fragment>;
  })}</>;
}

function modeLabel(mode?:string){
  if(mode==='executive') return 'Análisis ejecutivo';
  if(mode==='quote') return 'Cotización';
  if(mode==='writing') return 'Texto listo para usar';
  if(mode==='lead') return 'Lectura del lead';
  return 'Respuesta';
}
function toneForHeading(text:string){
  const normalized=text.toLocaleLowerCase('es');
  if(normalized.includes('alert')||normalized.includes('riesgo')) return 'alert';
  if(normalized.includes('oportun')) return 'opportunity';
  if(normalized.includes('próxima')||normalized.includes('proxima')||normalized.includes('acción')||normalized.includes('accion')) return 'action';
  if(normalized.includes('prioridad')) return 'priority';
  return 'neutral';
}

export default function AiResponse({content,mode}:Props){
  const blocks=parseBlocks(content);
  return <div className={`ai-response ai-response-${mode||'general'}`}>
    <div className="ai-response-meta">{modeLabel(mode)}</div>
    <div className="ai-response-body">
      {blocks.map((block,index)=>{
        if(block.type==='rule') return <hr key={index}/>;
        if(block.type==='heading'){
          const tone=toneForHeading(block.text);
          if(block.level===2) return <h2 className={`ai-response-heading ${tone}`} key={index}><Inline text={block.text}/></h2>;
          if(block.level===3) return <h3 className={`ai-response-heading ${tone}`} key={index}><Inline text={block.text}/></h3>;
          return <h4 key={index}><Inline text={block.text}/></h4>;
        }
        if(block.type==='ul') return <ul key={index}>{block.items.map((item,j)=><li key={j}><Inline text={item}/></li>)}</ul>;
        if(block.type==='ol') return <ol key={index}>{block.items.map((item,j)=><li key={j}><Inline text={item}/></li>)}</ol>;
        if(block.type==='table') return <div className="ai-response-table-fallback" key={index}>{block.lines.filter(line=>!/^[|\s:-]+$/.test(line)).map((line,j)=><div key={j}><Inline text={line.replace(/^\||\|$/g,'').split('|').map(x=>x.trim()).filter(Boolean).join(' · ')}/></div>)}</div>;
        const fact=block.text.match(/^\*\*(.+?):\*\*\s*(.*)$/);
        if(fact) return <div className="ai-response-fact" key={index}><strong>{fact[1]}</strong><span><Inline text={fact[2]}/></span></div>;
        return <p key={index}><Inline text={block.text}/></p>;
      })}
    </div>
  </div>;
}
