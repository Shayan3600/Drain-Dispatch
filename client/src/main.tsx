import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import CityReview from "./CityReview";
import EmployeeLogin, { EMPLOYEE_DEMO_SESSION_KEY, hasEmployeeDemoSession } from "./EmployeeLogin";
import "leaflet/dist/leaflet.css";
import "./styles.css";
// Demo access controls presentation only. Backend authorization is unchanged.
function EmployeeWorkspace() {
  const [entered, setEntered] = React.useState(hasEmployeeDemoSession);
  React.useEffect(() => {
    if (!entered) window.location.replace("/employee/login");
    else document.title = "Clearflow · Employee workspace";
  }, [entered]);
  function signOut() {
    try { sessionStorage.removeItem(EMPLOYEE_DEMO_SESSION_KEY); } catch { /* Still leave the demo view. */ }
    setEntered(false);
  }
  return entered ? <CityReview onSignOut={signOut} /> : null;
}
const path = window.location.pathname;
const isEmployeeLogin = /^\/employee\/login\/?$/.test(path);
const isEmployeeWorkspace = /^\/(?:employee|city)\/?$/.test(path);
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isEmployeeLogin ? <EmployeeLogin /> : isEmployeeWorkspace ? <EmployeeWorkspace /> : <App />}
  </React.StrictMode>,
);
