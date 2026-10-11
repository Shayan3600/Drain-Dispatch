import { useEffect, useMemo, useRef, useState } from "react";
import type { Incident, IncidentEvent } from "./types";
import { formatReportPacket, officialReportingUrl, type PacketOptions } from "./reportPacket";

export default function PacketPreview({ incident, history, historyState, evidenceStale = false }: {
  incident: Incident;
  history: IncidentEvent[];
  historyState: PacketOptions["historyState"];
  evidenceStale?: boolean;
}) {
  const [includePhotoLinks, setIncludePhotoLinks] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const textarea = useRef<HTMLTextAreaElement>(null);
  const copyGeneration = useRef(0);
  const apiOrigin = (import.meta as unknown as { env: Record<string, string> }).env.VITE_API_URL;
  const packet = useMemo(() => formatReportPacket(incident, history, {
    includePhotoLinks, historyState, evidenceStale, photoBaseUrl: apiOrigin || window.location.origin,
  }), [incident, history, includePhotoLinks, historyState, evidenceStale, apiOrigin]);
  useEffect(() => {
    copyGeneration.current += 1;
    setCopyStatus("");
    return () => { copyGeneration.current += 1; };
  }, [packet]);

  function selectText() { textarea.current?.focus(); textarea.current?.select(); }
  async function copy() {
    const generation = copyGeneration.current;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(packet);
      if (generation === copyGeneration.current) setCopyStatus("Report copied. Nothing has been submitted to the Town.");
    } catch {
      if (generation !== copyGeneration.current) return;
      selectText();
      setCopyStatus("Automatic copy is unavailable. The report text is selected; press Ctrl+C or Command+C to copy manually.");
    }
  }
  return <section className="cr-packet" aria-label="Report packet">
    <h3>Prepare a report packet</h3>
    <p>Preview exactly what will be copied. Check submitted text for personal details before sharing.</p>
    <label className="cr-packet-option"><input type="checkbox" checked={includePhotoLinks} onChange={event => setIncludePhotoLinks(event.target.checked)} />Include eligible public photo links</label>
    {incident.isDemo && <p className="cr-note">Embedded synthetic image placeholders are not exported as photo links.</p>}
    <textarea ref={textarea} aria-label="Report packet preview" value={packet} readOnly spellCheck={false} rows={14} />
    <div className="cr-actions"><button type="button" className="cr-button" onClick={() => void copy()}>Copy report</button><button type="button" className="cr-button" onClick={selectText}>Select report text</button><a className="cr-button" href={officialReportingUrl} target="_blank" rel="noreferrer">Town reporting resources ↗</a></div>
    <p role="status" aria-live="polite">{copyStatus}</p>
    <p className="cr-note">This prepares evidence only. Opening Town resources does not file a report or change community status.</p>
  </section>;
}
