"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function JoinPage() {
  const params = useParams();
  const router = useRouter();

  useEffect(() => {
    const code = params.code as string;
    if (code) {
      router.replace(`/auth/signup?ref=${encodeURIComponent(code)}`);
    }
  }, [params.code, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-cream-50">
      <div className="text-center">
        <Loader2 size={32} className="animate-spin text-gold-700 mx-auto mb-4" />
        <p className="text-navy-500">Redirecting to signup...</p>
      </div>
    </div>
  );
}
