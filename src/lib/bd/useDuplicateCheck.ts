import { useEffect, useState } from "react";

export type DupState = {
  checking: boolean;
  exists: boolean;
  message: string;
};

const DUP_IDLE: DupState = { checking: false, exists: false, message: "" };

/**
 * Live "does this company name / website already exist" check.
 *
 * Fires ~500ms after the user stops typing (debounced) rather than waiting
 * for form submit, so the error shows up right under the field while they're
 * still filling out the form. Pass `excludeId` on an edit form so a lead
 * doesn't flag itself as a duplicate of its own current value.
 */
export function useDuplicateCheck(
  field: "companyName" | "website",
  value: string,
  excludeId?: number | null
) {
  const [state, setState] = useState<DupState>(DUP_IDLE);

  useEffect(() => {
    const trimmed = value.trim();
    if (trimmed.length < 1) {
      setState(DUP_IDLE);
      return;
    }

    setState((prev) => ({ ...prev, checking: true }));
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ field, value: trimmed });
        if (excludeId) params.set("excludeId", String(excludeId));
        const res = await fetch(`/api/bd/leads/check-duplicate?${params.toString()}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          setState(DUP_IDLE);
          return;
        }
        const data = await res.json();
        setState({
          checking: false,
          exists: !!data.exists,
          message: data.exists
            ? `This ${field === "companyName" ? "company name" : "website"} is already in the pipeline${
                data.lead?.assignedToName ? ` (assigned to ${data.lead.assignedToName})` : ""
              }`
            : "",
        });
      } catch (err) {
        if ((err as { name?: string })?.name !== "AbortError") {
          setState(DUP_IDLE);
        }
      }
    }, 500);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [field, value, excludeId]);

  return state;
}
