"use client";

import { useEffect, useRef, useState } from "react";
import { ProcessingStatus } from "../components/ProcessingStatus";
import { backendRequest } from "../lib/backend";
import type { ProcessingRun } from "../lib/types";

export default function ProcessingPage() {
  const [runs, setRuns] = useState<ProcessingRun[]>([]);
  const loadingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (loadingRef.current) {
        return;
      }

      loadingRef.current = true;

      try {
        const response = await backendRequest<{ items?: ProcessingRun[] }>(
          "/api/processing/runs"
        );

        if (!cancelled) {
          setRuns(response.items ?? []);
        }
      } catch {
        if (!cancelled) {
          setRuns([]);
        }
      } finally {
        loadingRef.current = false;
      }
    }

    void load();

    const timer = window.setInterval(() => {
      void load();
    }, 10000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="dashboard-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">OPERATIONS</div>
          <h1>Processing Runs</h1>
          <p>Track media processing attempts and their persisted status.</p>
        </div>
      </div>

      <ProcessingStatus
        latestRun={runs[0] ?? null}
        runs={runs}
      />
    </div>
  );
}
