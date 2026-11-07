import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In — Serverless ERP",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
