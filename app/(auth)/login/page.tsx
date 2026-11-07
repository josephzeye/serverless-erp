import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Serverless ERP</CardTitle>
        <CardDescription>
          Sign in to manage Shopify orders, inventory, and finance
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-center text-sm text-muted-foreground">
          Supabase Auth integration will be wired in Step 2 (Database schema &
          RLS).
        </p>
        <Button asChild className="w-full">
          <Link href="/">Continue to Dashboard</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
