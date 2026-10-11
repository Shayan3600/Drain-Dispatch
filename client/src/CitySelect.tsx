import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";

export interface CitySelectOption { value: string; label: string; description?: string; color?: string }
export default function CitySelect({label,value,options,onChange,icon}: {
  label:string; value:string; options:readonly CitySelectOption[]; onChange:(value:string)=>void; icon?:ReactNode;
}) {
  const id=`cr-select-${useId().replaceAll(":","")}`;
  const wrapper=useRef<HTMLDivElement>(null);
  const trigger=useRef<HTMLButtonElement>(null);
  const menu=useRef<HTMLUListElement>(null);
  const search=useRef({text:"",at:0});
  const [open,setOpen]=useState(false);
  const selected=Math.max(0,options.findIndex(option=>option.value===value));
  const [active,setActive]=useState(selected);
  const [above,setAbove]=useState(false);
  const [height,setHeight]=useState(300);
  function reveal(index=selected) {
    const bounds=trigger.current?.getBoundingClientRect();
    if(bounds) {
      const below=window.innerHeight-bounds.bottom;
      const upwards=below<Math.min(300,options.length*54+14) && bounds.top>below;
      setAbove(upwards); setHeight(Math.max(100,Math.min(300,(upwards ? bounds.top : below)-12)));
    }
    setActive(index);setOpen(true);
  }
  function choose(index:number) { onChange(options[index].value);setOpen(false);trigger.current?.focus(); }
  useEffect(()=>{
    if(!open)return;
    const outside=(event:Event)=>{if(!wrapper.current?.contains(event.target as Node))setOpen(false);};
    const resized=()=>setOpen(false);
    document.addEventListener("pointerdown",outside);document.addEventListener("focusin",outside);window.addEventListener("resize",resized);
    return()=>{document.removeEventListener("pointerdown",outside);document.removeEventListener("focusin",outside);window.removeEventListener("resize",resized);};
  },[open]);
  useEffect(()=>{
    if(!open || !menu.current)return;
    const option=menu.current.children[active] as HTMLElement;
    if(option.offsetTop<menu.current.scrollTop)menu.current.scrollTop=option.offsetTop;
    else if(option.offsetTop+option.offsetHeight>menu.current.scrollTop+menu.current.clientHeight)menu.current.scrollTop=option.offsetTop+option.offsetHeight-menu.current.clientHeight;
  },[open,active]);
  function keyDown(event:KeyboardEvent<HTMLButtonElement>) {
    if(event.key==="Tab") {setOpen(false);return;}
    if(event.key==="Escape") {event.preventDefault();setOpen(false);search.current.text="";return;}
    if(event.key==="ArrowDown" || event.key==="ArrowUp") {
      event.preventDefault();
      if(!open)reveal();else setActive(index=>(index+(event.key==="ArrowDown" ? 1 : -1)+options.length)%options.length);
      return;
    }
    if(event.key==="Home" || event.key==="End") {
      event.preventDefault();const index=event.key==="Home" ? 0 : options.length-1; if(!open)reveal(index);else setActive(index);return;
    }
    if(event.key==="Enter" || event.key===" ") {event.preventDefault();if(open)choose(active);else reveal();return;}
    if(event.key.length===1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
      event.preventDefault();const now=Date.now();const next=now-search.current.at<700 ? search.current.text+event.key.toLowerCase() : event.key.toLowerCase();search.current={text:next,at:now};
      const query=[...next].every(char=>char===next[0]) ? next[0] : next;
      for(let offset=1;offset<=options.length;offset++) {
        const index=((open ? active : selected)+offset)%options.length;
        if(options[index].label.toLowerCase().startsWith(query)) {if(!open)reveal(index);else setActive(index);break;}
      }
    }
  }
  return <div className="cr-select" ref={wrapper}>
    <span className="cr-select-label" id={`${id}-label`}>{label}</span>
    <button type="button" className="cr-select-trigger" ref={trigger} role="combobox" aria-labelledby={`${id}-label`} aria-describedby={`${id}-value`} aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-menu`} aria-activedescendant={open ? `${id}-option-${active}` : undefined} onKeyDown={keyDown} onClick={()=>open ? setOpen(false) : reveal()}>
      {icon && <span className="cr-select-icon" aria-hidden="true">{icon}</span>}<span id={`${id}-value`}>{options[selected]?.label}</span><ChevronDown size={16} className="cr-select-chevron" aria-hidden="true" />
    </button>
    {open && <ul className={`cr-select-menu ${above ? "cr-select-above" : ""}`} id={`${id}-menu`} role="listbox" aria-labelledby={`${id}-label`} ref={menu} style={{maxHeight:height}}>
      {options.map((option,index)=><li key={option.value} id={`${id}-option-${index}`} role="option" aria-label={option.label} aria-selected={option.value===value} className={index===active ? "cr-option-active" : ""} onPointerMove={()=>setActive(index)} onPointerDown={event=>event.preventDefault()} onClick={()=>choose(index)}>
        {option.color && <span className="cr-option-dot" style={{backgroundColor:option.color}} aria-hidden="true" />}<span className="cr-option-copy"><strong>{option.label}</strong>{option.description && <small>{option.description}</small>}</span>{option.value===value && <Check size={15} aria-hidden="true" />}
      </li>)}
    </ul>}
  </div>;
}
