import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";

export function SetupPage() {
  const navigate = useNavigate();

  useEffect(() => {
    void navigate({ to: "/welcome", replace: true });
  }, [navigate]);

  return null;
}
