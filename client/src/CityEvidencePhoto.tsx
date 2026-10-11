import { useState } from "react";

export default function CityEvidencePhoto({src,isDemo}:{src:string;isDemo:boolean}) {
  const [failed,setFailed] = useState(false);
  return <figure className="cr-evidence-photo">
    {failed ? <p className="cr-note" role="status">Photo could not be loaded.</p> : <a href={src} target="_blank" rel="noreferrer" aria-label="Open full-size evidence image">
      <img src={src} loading="lazy" alt={isDemo ? "Drainage reference image for an illustrative demo scenario" : "Submitted drainage observation"} onError={()=>setFailed(true)} />
    </a>}
    <figcaption>{isDemo && <span>Illustrative demo image · location and capture date unverified.</span>}{!failed && <a href={src} target="_blank" rel="noreferrer">Open full-size image ↗</a>}</figcaption>
  </figure>;
}
