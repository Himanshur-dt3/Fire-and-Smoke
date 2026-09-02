"use client";

import { SettingsPanel } from "../components/SettingsPanel";

export default function SettingsPage() {
  return (
    <div className="dashboard-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">SYSTEM</div>
          <h1>Operational Settings</h1>
          <p>Review the sanitized runtime configuration provided by the API.</p>
        </div>
      </div>

      <SettingsPanel />
    </div>
  );
}
