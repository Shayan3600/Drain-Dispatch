import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Building2, FileSearch, ShieldCheck, Waves } from "lucide-react";
import "./employee-login.css";

export const EMPLOYEE_DEMO_SESSION_KEY = "clearflow-employee-demo";

/** Presentation preference only; this never authorizes a backend operation. */
export function hasEmployeeDemoSession() {
  try { return sessionStorage.getItem(EMPLOYEE_DEMO_SESSION_KEY) === "true"; }
  catch { return false; }
}

export default function EmployeeLogin({ onContinue }: { onContinue?: () => void }) {
  const [error, setError] = useState("");
  useEffect(() => {
    const previous = document.title;
    document.title = "Clearflow — Employee demo login";
    return () => { document.title = previous; };
  }, []);

  function continueDemo() {
    setError("");
    try {
      sessionStorage.setItem(EMPLOYEE_DEMO_SESSION_KEY, "true");
      if (onContinue) onContinue();
      else window.location.assign("/employee");
    } catch {
      setError("This browser could not open a demo session. Allow session storage or try a normal browser tab.");
    }
  }

  return <div className="employee-login">
    <header className="el-header">
      <a className="el-brand" href="/" aria-label="Clearflow home">
        <img src="/clearflow/assets/drop-logo.png" alt="" />
        <span>Clearflow</span>
      </a>
      <span className="el-demo-label">Demo workspace</span>
    </header>
    <main className="el-main">
      <section className="el-intro" aria-labelledby="employee-title">
        <span className="el-eyebrow"><Building2 size={17} aria-hidden="true" /> Employee workspace</span>
        <h1 id="employee-title">Review reports.</h1>
        <p className="el-lead">Locations, photos and history.</p>
        <p className="el-description">Prepare report packets for human follow-up.</p>
        <div className="el-capabilities">
          <span><FileSearch size={20} aria-hidden="true" /> Review evidence</span>
          <span><Waves size={20} aria-hidden="true" /> Explore report locations</span>
        </div>
        <a className="el-return" href="/"><ArrowLeft size={16} aria-hidden="true" /> Back to the community dashboard</a>
      </section>
      <section className="el-card" aria-labelledby="demo-entry-title">
        <div className="el-card-icon"><ShieldCheck size={30} aria-hidden="true" /></div>
        <span className="el-card-label">Demo access only</span>
        <h2 id="demo-entry-title">Demo login</h2>
        <p>No password required.</p>
        <div className="el-explanation">
          <p>Demonstration only. No government account or admin access.</p>
        </div>
        {error && <p className="el-error" role="alert">{error}</p>}
        <button className="el-continue" type="button" onClick={continueDemo}>Continue to demo <ArrowRight size={18} aria-hidden="true" /></button>
        <p className="el-session-note">This demo stays in this tab. Sign out to leave.</p>
      </section>
    </main>
    <footer className="el-footer">Independent of the Town of Chapel Hill. Community reports do not automatically notify the Town.</footer>
  </div>;
}
