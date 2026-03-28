'use client';
export default function Pagination({page,totalPages,onChange}:{page:number,totalPages:number,onChange:(p:number)=>void}) {
  return (
    <div className="flex gap-2 items-center">
      <button disabled={page<=1} onClick={()=>onChange(page-1)} className="px-3 py-1 rounded border disabled:opacity-50">Prev</button>
      <span className="text-sm">Page {page} / {totalPages}</span>
      <button disabled={page>=totalPages} onClick={()=>onChange(page+1)} className="px-3 py-1 rounded border disabled:opacity-50">Next</button>
    </div>
  );
}
