import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowRight, ArrowUpRight, MapPin, Menu, MessageCircle, ShieldCheck, SlidersHorizontal, X } from "lucide-react";

const asset = (name: string) => `/clearflow/assets/${name}`;
export const clearflowTitle = "Clearflow — Community stormwater reporting";
const official = "https://www.chapelhillnc.gov/Town-Government/Departments-and-Offices/Public-Works/Stormwater-Management/Flooding-and-Drainage";

function playCue(name: string) {
  try {
    const cue = new Audio(asset(name));
    cue.volume = 0.25;
    void cue.play().catch(() => {});
  } catch { /* Decoration works even when a browser disables audio. */ }
}

function Bubble({ hero = false, position = 1 }: { hero?: boolean; position?: number }) {
  const [popped, setPopped] = useState(false);
  const timeout = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timeout.current), []);
  return (
    <div className={hero ? "hero-bubble bubble-parallax" : `bubble-parallax bubble-position-${position}`}>
      <button className={`aero-bubble ${popped ? "clearflow-popped" : ""}`} type="button" aria-label="Pop bubble" disabled={popped} onClick={() => {
        setPopped(true);
        playCue("bubble-pop.wav");
        timeout.current = setTimeout(() => setPopped(false), 3500);
      }}><span className="bubble-shine" /></button>
    </div>
  );
}

function Butterfly({ index }: { index: number }) {
  const color = ["#eca04e", "#82cfd4", "#f0ae56", "#b3d887"][index];
  return <span className={`aero-butterfly butterfly-${index}`} style={{ "--flight-delay": `${index * -9}s`, "--flight-top": `${19 + index * 17}%` } as CSSProperties}>
    <svg viewBox="0 0 80 65" fill="none"><g className="butterfly-wing left-wing"><path d="M39 32C28 8 4 1 5 19C5 32 22 35 37 36C21 32 12 41 19 51C26 61 37 44 39 37" fill={color} stroke="#f6ffed" strokeWidth="1.5" /><path d="M35 31L14 18M34 37L23 46" stroke="#226974" strokeOpacity=".3" /></g><g className="butterfly-wing right-wing"><path d="M41 32C52 8 76 1 75 19C75 32 58 35 43 36C59 32 68 41 61 51C54 61 43 44 41 37" fill={color} stroke="#f6ffed" strokeWidth="1.5" /><path d="M45 31L66 18M46 37L57 46" stroke="#226974" strokeOpacity=".3" /></g><path d="M40 27V43M39 28L34 20M41 28L46 20" stroke="#39777a" strokeWidth="2" strokeLinecap="round" /></svg>
  </span>;
}

/** React owns decorative effects. No screenshots, DOM sampling, or report data enter them. */
export function ClearflowIntro({ onReport }: { onReport: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [powerOn, setPowerOn] = useState(true);
  const [performance, setPerformance] = useState(() => {
    try { return localStorage.getItem("clearflow-performance") === "true"; } catch { return false; }
  });
  const [reducedMotion, setReducedMotion] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [hidden, setHidden] = useState(document.hidden);
  const intro = useRef<HTMLDivElement>(null);
  const headerLogo = useRef<HTMLImageElement>(null);
  const performanceButton = useRef<HTMLButtonElement>(null);
  const limited = performance || reducedMotion || hidden;
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReducedMotion(query.matches);
    const visibility = () => setHidden(document.hidden);
    query.addEventListener("change", change);
    document.addEventListener("visibilitychange", visibility);
    return () => { query.removeEventListener("change", change); document.removeEventListener("visibilitychange", visibility); };
  }, []);
  useEffect(() => {
    document.body.classList.toggle("clearflow-performance", performance);
    document.body.classList.toggle("clearflow-reduced-motion", limited);
    try { localStorage.setItem("clearflow-performance", String(performance)); } catch { /* Optional preference storage. */ }
    return () => { document.body.classList.remove("clearflow-performance", "clearflow-reduced-motion"); };
  }, [performance, limited]);
  useEffect(() => {
    document.title = clearflowTitle;
    if (limited) return;
    let letters = 0;
    let offset = 0;
    let timer: ReturnType<typeof setTimeout>;
    const ticker = `${clearflowTitle}   ·   `;
    function tick() {
      if (letters < clearflowTitle.length) {
        letters += 1;
        document.title = `${clearflowTitle.slice(0, letters)} ▌`;
        timer = setTimeout(tick, letters === clearflowTitle.length ? 1500 : 180);
      } else {
        document.title = (ticker + ticker).slice(offset, offset + clearflowTitle.length);
        offset = (offset + 1) % ticker.length;
        timer = setTimeout(tick, offset === 0 ? 1800 : 320);
      }
    }
    timer = setTimeout(tick, 900);
    return () => { clearTimeout(timer); document.title = clearflowTitle; };
  }, [limited]);
  useEffect(() => {
    const mark = intro.current;
    const logo = headerLogo.current;
    if (!mark || !logo || limited) return;
    mark.classList.add("clearflow-opening");
    const source = mark.getBoundingClientRect();
    const target = logo.getBoundingClientRect();
    const x = target.left + target.width / 2 - source.left - source.width / 2;
    const y = target.top + target.height / 2 - source.top - source.height / 2;
    const animation = mark.animate([
      { opacity: 0, transform: "translate(0, 0) scale(.85)", offset: 0 },
      { opacity: 1, transform: "translate(0, 0) scale(1)", offset: .25 },
      { opacity: 1, transform: "translate(0, 0) scale(1)", offset: .6 },
      { opacity: 0, transform: `translate(${x}px, ${y}px) scale(.43)`, offset: 1 },
    ], { duration: 2100, easing: "cubic-bezier(.2,.6,.2,1)", fill: "forwards" });
    animation.onfinish = () => mark.classList.remove("clearflow-opening");
    return () => { animation.cancel(); mark.classList.remove("clearflow-opening"); };
  }, [limited]);
  const off = performance || !powerOn;
  function closeNavigation() { setMenuOpen(false); }
  return <>
    <div className="clearflow-design clearflow-decoration">
      <div className="opening-mark" aria-hidden="true" ref={intro}><img src={asset("drop-logo.png")} alt="" /></div>
      <div id="bubble-layer" aria-label="Interactive bubbles">{[1, 2, 3, 4].map(position => <Bubble position={position} key={position} />)}</div>
      <div id="butterfly-layer" aria-hidden="true">{[0, 1, 2, 3].map(index => <Butterfly index={index} key={index} />)}</div>
      <div id="performance-controls" onKeyDown={event => {
        if (event.key === "Escape" && panelOpen) {
          event.stopPropagation();
          setPanelOpen(false);
          performanceButton.current?.focus();
        }
      }}>
        <button id="performance-menu" ref={performanceButton} type="button" className={performance ? "is-active" : ""} aria-label="Open performance settings" aria-expanded={panelOpen} aria-controls="performance-panel" onClick={() => setPanelOpen(!panelOpen)}><SlidersHorizontal size={19} /></button>
        <section id="performance-panel" aria-label="Performance settings" hidden={!panelOpen}>
          <div className="performance-heading"><strong>Performance</strong><button type="button" aria-label="Close performance settings" onClick={() => { setPanelOpen(false); performanceButton.current?.focus(); }}>×</button></div>
          <label className="performance-switch"><span>Performance mode</span><input type="checkbox" role="switch" checked={performance} onChange={event => setPerformance(event.target.checked)} /><span className="switch-track" aria-hidden="true" /></label>
          <p>Hide bubbles and butterflies. Stop aquarium and decorative animation.</p>
          <span className="sr-only" role="status">{performance ? "Performance mode on" : "Performance mode off"}</span>
        </section>
      </div>
    </div>
    <div className="clearflow-design clearflow-header">
      <header className="header wrap">
        <a className="brand" href="/" aria-label="Clearflow home"><img className="brand-logo" src={asset("drop-logo.png")} alt="" ref={headerLogo} />clearflow</a>
        <nav className={menuOpen ? "clearflow-nav-open" : ""} aria-label="Main navigation">
          <a href="#dashboard" onClick={closeNavigation}>Live map</a><a href="#community" onClick={closeNavigation}>How it works</a><a href="/city" onClick={closeNavigation}>City review</a><a href="#questions" onClick={closeNavigation}>FAQs</a>
        </nav>
        <div className="clearflow-header-actions"><button className="button green small" type="button" onClick={onReport}>Report a blockage <ArrowUpRight size={16} /></button><button className="clearflow-menu" aria-label="Toggle navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={22} /> : <Menu size={22} />}</button></div>
      </header>
    </div>
    <div className="clearflow-design">
      <section className="hero wrap" id="home">
        <div className="hero-copy"><p className="eyebrow">CHAPEL HILL · COMMUNITY STORMWATER WATCH</p><h1>Blocked drain?<br /><em>Report it.</em></h1><p className="lead">A photo. A location. A clearer picture.<br className="desktop" /> Turn what you notice into community evidence.</p><div className="actions"><button className="button green" onClick={onReport}>Share an observation <ArrowRight size={17} /></button><a className="text-link" href="#dashboard"><span className="play">↗</span> Explore the map</a></div><p className="hero-note"><ShieldCheck size={15} /> Observe safely. Confirm the location. Keep neighbors informed.</p></div>
        <div className="hero-art">
          <div className="aquarium-stage"><div className="aquarium-container"><div className={`tank ${off ? "tank-off" : ""}`} aria-hidden="true"><div className="aquarium-bg far ani" /><div className="aquarium-bg bgfish ani" /><div className="fish"><div className="zebra ani" /><div className="clown1 ani" /><div className="butter ani" /></div><div className="aquarium-bg near ani" /><div className="overlay" /></div><button id="pwrbtn" type="button" aria-label={performance ? "Aquarium switched off in performance mode" : off ? "Turn aquarium light and animation on" : "Pause aquarium and turn off its light"} aria-pressed={off} data-on={!off} disabled={performance} onClick={() => { playCue("switch-click.wav"); setPowerOn(!powerOn); }} /></div></div>
          <div className="floating-bowl bowl-one" aria-hidden="true"><div className="bowl-water"><img src={asset("clownfish.avif")} alt="" /></div></div><Bubble hero />
        </div>
      </section>
      <div className="ribbon"><div className="wrap ribbon-inner"><span className="ribbon-word">CLEARFLOW</span><p>A little care, downstream.</p><a href="#dashboard" className="ribbon-action">View the community map <ArrowUpRight size={16} /></a></div></div>
    </div>
  </>;
}

export function ClearflowCommunity({ onReport }: { onReport: () => void }) {
  return <div className="clearflow-design">
    <section className="how wrap" id="community"><div className="section-heading"><div><h2>How it works</h2></div><p>From a moment to a meaningful report.</p></div><div className="tv-grid">
      {[
        { color: "mint", channel: "01", label: "TAKE A LOOK", action: "NOTICE", title: "Observe safely", text: "Take a photo of a blocked grate or standing water from a safe place. Gemini helps describe visible evidence; you stay in control.", icon: <div className="drain-icon" aria-hidden="true"><span /><span /><span /><span /></div> },
        { color: "blue", channel: "02", label: "PUT IT ON THE MAP", action: "LOCATE", title: "Pin & confirm", text: "Place the pin where you observed the concern. Check nearby incidents and add an observation if someone has reported the same drain.", icon: <div className="pin-icon" aria-hidden="true">●</div> },
        { color: "lime", channel: "03", label: "KEEP THE PICTURE CLEAR", action: "CONNECT", title: "Build the picture", text: "Your confirmed report appears on the live map with its photo, observations and history. Share a follow-up when conditions change.", icon: <div className="folder-icon" aria-hidden="true"><span>✓</span></div> },
      ].map(step => <article tabIndex={0} className={`mini-tv ${step.color}`} key={step.channel}><div className={`antenna ${step.channel === "03" ? "short" : ""}`} aria-hidden="true" /><div className="mini-screen"><span className="screen-channel">CH. {step.channel}</span><div className="icon-motion">{step.icon}</div><span className="screen-glint" aria-hidden="true" /><span className="screen-label">{step.label}</span></div><div className="mini-controls"><span className="tiny-light" /><span>{step.action}</span><i /><i /></div><h3>{step.title}</h3><p>{step.text}</p><span className="step">{step.channel} / {step.action}</span></article>)}
    </div></section>
    <section className="report-section" id="report"><div className="wrap report-layout"><div className="report-copy"><h2>One photo.<br />More clarity.</h2><div className="glass-note"><span className="note-icon">i</span><div><strong>Community evidence, human review</strong><p>Reports are saved to Clearflow after you confirm the location. They do not automatically notify the Town or confirm a repair.</p></div></div><div className="bowl-display" aria-hidden="true"><div className="floating-bowl large"><div className="bowl-water"><img src={asset("butterflyfish.avif")} alt="" /><img className="second-fish" src={asset("zebrafish.avif")} alt="" /></div></div><div className="grass">{Array.from({ length: 9 }, (_, index) => <i key={index} />)}</div></div></div><div className="report-tv"><div className="report-screen"><div className="screen-top"><span><i className="status-dot" /> COMMUNITY REPORTING</span><span>LIVE / CHAPEL HILL</span></div><h3>Where’s the blockage?</h3><p className="clearflow-report-intro">Choose the way that works for you. Both paths lead to the same confirmed report and live dashboard.</p><div className="clearflow-report-path"><MapPin size={25} /><div><strong>Report here</strong><p>Add a photo, review visual findings and confirm a pin on the map.</p></div></div><div className="clearflow-report-path"><MessageCircle size={25} /><div><strong>Already using iMessage?</strong><p>Send a drain photo in your Clearflow conversation. Open the reply to confirm its location. Send <b>RESUME</b> to reopen your latest report.</p></div></div><p className="clearflow-photo-limits">JPEG, PNG or WebP · up to 8 MB · review before sharing.</p><button className="button green" type="button" onClick={onReport}>Start a report <ArrowRight size={17} /></button></div><div className="tv-bottom"><span className="tv-name">clearflow</span><span className="clearflow-live-label"><i className="tiny-light" /> Confirmed observations, shared context</span><span className="tv-knob" aria-hidden="true" /></div></div></div></section>
    <section className="care wrap" id="care"><div className="care-art"><img src={asset("aquarium-tv.png")} alt="A glossy retro television filled with fish, beside a goldfish bowl and bright grass" loading="lazy" /></div><div className="care-copy"><h2>Drain care</h2><ul className="care-list"><li><span>01</span><div><strong>Keep litter out of the flow.</strong><p>Dispose of leaves and litter properly. Avoid sweeping waste toward street drains.</p></div></li><li><span>02</span><div><strong>Give waterways a clear path.</strong><p>Keep oils, paint and other waste out of storm drains. Connect with official stormwater resources for guidance.</p></div></li><li><span>03</span><div><strong>Observe from a safe spot.</strong><p>Never lift a grate, enter a drain, step into traffic or approach floodwater. Follow official weather instructions.</p></div></li></ul><a className="text-link" href={official} target="_blank" rel="noreferrer">Town stormwater resources <ArrowUpRight size={15} /></a></div></section>
    <section className="faq wrap" id="questions"><div><h2>FAQs</h2><div className="floating-bowl faq-bowl" aria-hidden="true"><div className="bowl-water"><img src={asset("zebrafish.avif")} alt="" /></div></div></div><div className="faq-list">
      {[
        ["What kind of concern can I report?", "Outdoor storm-drain blockages, standing water, flooding, damaged grates and other drainage concerns around Chapel Hill. Describe only what you can safely observe."],
        ["Where does my report go?", "After you confirm the location, your report is saved to the community database and appears on the dashboard. Clearflow is independent of the Town of Chapel Hill. Use the official Town reporting link to contact the responsible public service; Clearflow does not automatically file a municipal report."],
        ["Can I come back to my iMessage report?", "Yes. Send RESUME in the same Clearflow conversation for a fresh confirmation link. Your saved photo, visual findings and draft are preserved. An already confirmed report opens its saved incident."],
        ["What if someone reported the same drain?", "Review nearby suggestions during location confirmation. If an incident concerns the same physical drain, confirm that match to add an observation. Each contribution remains visible in the incident history."],
        ["How should I use the photo findings?", "Gemini describes visible evidence and suggests a category. Review and edit its findings before submitting. A photo cannot establish hidden conditions, municipal responsibility or that a repair is complete."],
        ["Why do the map and statistics sometimes differ?", "Community counts and trends exclude labeled demo reports. You can include those test records on the map; a separate demo preview shows their counts. Filters also change which incidents you see."],
      ].map(([question, answer]) => <details key={question}><summary>{question}<span>+</span></summary><div className="faq-answer"><p>{answer}</p></div></details>)}
    </div></section>
    <section className="closing wrap"><h2>Small observations.<br />Healthier waterways.</h2><button className="button green" type="button" onClick={onReport}>Report a blockage <ArrowUpRight size={17} /></button></section>
  </div>;
}

export function ClearflowFooter() {
  return <div className="clearflow-design"><footer className="wrap"><a className="brand" href="/" aria-label="Clearflow home"><img className="brand-logo" src={asset("drop-logo.png")} alt="" />clearflow</a><span>HackNC 2026 · Community stormwater watch</span><a className="credits-link" href="/clearflow/credits.html">Credits &amp; sources</a><a href="#home">Back to top ↑</a></footer><div className="clearflow-footer-note wrap"><p><ShieldCheck size={14} /> Observe safely. Never enter drains, floodwater or active roadways.</p><p>Independent of the Town of Chapel Hill. Community reports do not automatically notify the Town. Not an emergency service.</p><a href="/city">Open the city review workspace <ArrowUpRight size={14} /></a></div><div className="font-credit wrap">Not Just Groovy by Zdeněk Gromnica / FutureMillennium · Barstain by burntilldead · <a href="/clearflow/credits.html">All credits &amp; sources</a></div></div>;
}
