import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { apiError } from "@/lib/api";
import { PRIVATE_KEYS } from "@/hooks/useMarket";

export function useAction() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const run = async (fn, success) => {
    setBusy(true);
    try {
      const res = await fn();
      if (success) toast.success(typeof success === "function" ? success(res) : success);
      PRIVATE_KEYS.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      return res;
    } catch (e) {
      toast.error(apiError(e));
      return null;
    } finally {
      setBusy(false);
    }
  };
  return { run, busy };
}
