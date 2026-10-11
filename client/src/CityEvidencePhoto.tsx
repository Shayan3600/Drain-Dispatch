import { useEffect, useState } from "react";

export default function CityEvidencePhoto({src,isDemo,illustrative=false}:{src:string;isDemo:boolean;illustrative?:boolean}) {
  const [failed,setFailed] = useState(false);
  const [attempt,setAttempt] = useState(0);
  useEffect(()=>{setFailed(false);setAttempt(0);},[src]);
  return <figure className="cr-evidence-photo">
    {failed ? <div><p className="cr-note" role="status">Photo could not be loaded.</p><button type="button" className="cr-button cr-button-subtle" onClick={()=>{setAttempt(value=>value+1);setFailed(false);}}>Retry photo</button></div> : <a href={src} target="_blank" rel="noreferrer" aria-label="Open full-size evidence image">
      <img key={attempt} src={src} loading="lazy" alt={illustrative ? "Drainage reference image for an illustrative demo scenario" : "Submitted drainage observation"} onError={()=>setFailed(true)} />
    </a>}
    <figcaption>{isDemo && <span>{illustrative ? "Illustrative demo image · location and capture date unverified." : "Photo submitted with a labeled demo report."}</span>}{!failed && <a href={src} target="_blank" rel="noreferrer">Open full-size image ↗</a>}</figcaption>
  </figure>;
}
