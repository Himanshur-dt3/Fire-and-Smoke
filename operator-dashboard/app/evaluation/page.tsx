"use client";

import { EvaluationPanel } from "../components/EvaluationPanel";

export default function EvaluationPage() {
  return (
    <div className="dashboard-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">OPERATIONS</div>
          <h1>Evaluation</h1>
          <p>Evaluate detection performance against labelled media.</p>
        </div>
      </div>

      <EvaluationPanel />
    </div>
  );
}
