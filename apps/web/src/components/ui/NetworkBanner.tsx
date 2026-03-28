// in a layout or page
import useNetwork from "../../hooks/useNetwork";
function NetworkBanner(){
  const online = useNetwork();
  if (online) return null;
  return <div className="fixed bottom-2 left-1/2 -translate-x-1/2 bg-red-600 text-white px-3 py-2 rounded-xl shadow">You are offline. <button onClick={()=>location.reload()} className="underline">Retry</button></div>;
}