import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";

export function OnboardingPage() {
  const navigate = useNavigate();

  useEffect(() => {
    void navigate({ to: "/welcome", replace: true });
  }, [navigate]);

  return <div className="h-full bg-[#f5f5f5]" />;
}
