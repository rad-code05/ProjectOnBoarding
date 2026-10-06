import { StatusPage } from "@/components/shell";

export const metadata = { title: "Page not found" };

/** Unknown address or notFound() — no user lookup, so it also works signed out. */
export default function NotFound() {
  return (
    <main className="flex flex-1 items-center justify-center bg-sand p-8">
      <StatusPage
        code="404"
        label="not found"
        title="Page not found"
        message="The link may be wrong, or the page has moved."
        action={{ href: "/", label: "Go to my start page" }}
      />
    </main>
  );
}
