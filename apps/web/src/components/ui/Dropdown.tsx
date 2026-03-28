'use client';
import { useEffect, useRef, useState } from 'react';

export default function Dropdown({ trigger, items }:{
  trigger: React.ReactNode;
  items: {label:string; onClick:()=>void}[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(()=> {
    const close = (e: MouseEvent) => { if(!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <div onClick={()=>setOpen(v=>!v)}>{trigger}</div>
      {open && (
        <div className="absolute right-0 mt-2 w-48 rounded-xl border bg-white shadow-lg">
          {items.map((it,i)=>(
            <button key={i} onClick={()=>{it.onClick(); setOpen(false);}} className="w-full text-left px-3 py-2 hover:bg-gray-50">
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
