'use client';
import { useEffect, useState } from 'react';
export default function useNetwork(){
  const [online, setOnline] = useState(true);
  useEffect(()=> {
    const set = () => setOnline(navigator.onLine);
    set(); window.addEventListener('online', set); window.addEventListener('offline', set);
    return () => { window.removeEventListener('online', set); window.removeEventListener('offline', set); };
  }, []);
  return online;
}
