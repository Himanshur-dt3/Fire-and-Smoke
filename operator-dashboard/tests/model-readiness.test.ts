import { describe, expect, it } from "vitest";

import { isModelReady, modelReadinessCode } from "../app/lib/types";

describe("model readiness display", () => {
  it("maps legacy backend readiness values to the safe public readiness codes", () => {
    expect(modelReadinessCode({ model_id: "dfire", status: "ready", detail: "Loaded." })).toBe("MODEL_READY");
    expect(modelReadinessCode({ model_id: "pyronear", status: "not_configured", detail: "No local path." })).toBe(
      "MODEL_NOT_CONFIGURED"
    );
    expect(modelReadinessCode({ model_id: "dfire", status: "not_ready", detail: "Load failed." })).toBe("MODEL_NOT_READY");
  });

  it("permits processing only for explicit ready state", () => {
    expect(isModelReady({ model_id: "dfire", code: "MODEL_READY", detail: "Loaded." })).toBe(true);
    expect(isModelReady({ model_id: "pyronear", code: "MODEL_NOT_CONFIGURED", detail: "No local path." })).toBe(false);
  });
});
